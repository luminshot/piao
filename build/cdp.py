#!/usr/bin/env python3
"""极简 CDP 客户端：通过 WebSocket 操控无头 Chrome 做交互验证。
不依赖第三方库，手写 WebSocket 分帧。
"""
import base64
import json
import os
import socket
import struct
import subprocess
import sys
import time
import urllib.request


class WS:
    def __init__(self, url):
        # ws://127.0.0.1:PORT/devtools/page/XXXX
        assert url.startswith('ws://')
        rest = url[5:]
        hostport, path = rest.split('/', 1)
        host, port = hostport.split(':')
        self.sock = socket.create_connection((host, int(port)), timeout=30)
        key = base64.b64encode(os.urandom(16)).decode()
        req = (
            f'GET /{path} HTTP/1.1\r\nHost: {hostport}\r\n'
            'Upgrade: websocket\r\nConnection: Upgrade\r\n'
            f'Sec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n\r\n'
        )
        self.sock.sendall(req.encode())
        buf = b''
        while b'\r\n\r\n' not in buf:
            buf += self.sock.recv(4096)
        header, self.rest = buf.split(b'\r\n\r\n', 1)

    def _recv_exact(self, n):
        out = b''
        while len(out) < n:
            if self.rest:
                take = self.rest[:n - len(out)]
                self.rest = self.rest[len(take):]
                out += take
                continue
            chunk = self.sock.recv(max(n - len(out), 4096))
            if not chunk:
                raise ConnectionError('ws closed')
            self.rest += chunk
        return out

    def send(self, text):
        data = text.encode()
        header = bytearray([0x81])
        n = len(data)
        if n < 126:
            header.append(0x80 | n)
        elif n < 65536:
            header.append(0x80 | 126)
            header += struct.pack('>H', n)
        else:
            header.append(0x80 | 127)
            header += struct.pack('>Q', n)
        mask = os.urandom(4)
        header += mask
        masked = bytes(b ^ mask[i % 4] for i, b in enumerate(data))
        self.sock.sendall(bytes(header) + masked)

    def recv(self):
        while True:
            b1, b2 = self._recv_exact(2)
            opcode = b1 & 0x0F
            length = b2 & 0x7F
            if length == 126:
                length = struct.unpack('>H', self._recv_exact(2))[0]
            elif length == 127:
                length = struct.unpack('>Q', self._recv_exact(8))[0]
            payload = self._recv_exact(length) if length else b''
            if opcode == 0x8:
                raise ConnectionError('closed')
            if opcode == 0x9:
                continue
            if opcode in (0x1, 0x2):
                return payload.decode('utf-8', 'replace')

    def close(self):
        try:
            self.sock.close()
        except Exception:
            pass


class Chrome:
    def __init__(self, port=9333, user_dir='/tmp/cdp-profile'):
        subprocess.run(['pkill', '-f', 'remote-debugging-port=%d' % port], capture_output=True)
        time.sleep(0.4)
        self.port = port
        self.proc = subprocess.Popen([
            '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
            '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run',
            '--disable-extensions', '--mute-audio',
            '--remote-debugging-port=%d' % port,
            '--user-data-dir=%s' % user_dir,
            '--window-size=1600,1000',
            'about:blank',
        ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        for _ in range(80):
            try:
                data = json.load(urllib.request.urlopen(
                    'http://127.0.0.1:%d/json/version' % port, timeout=1))
                self.ws_url = data['webSocketDebuggerUrl']
                break
            except Exception:
                time.sleep(0.25)
        else:
            raise RuntimeError('chrome 启动失败')
        self.ws = WS(self.ws_url)
        self.msg_id = 0
        self.session_id = None
        self.send('Target.setDiscoverTargets', {'discover': True})

    def send(self, method, params=None, session=None):
        self.msg_id += 1
        payload = {'id': self.msg_id, 'method': method, 'params': params or {}}
        if session:
            payload['sessionId'] = session
        self.ws.send(json.dumps(payload))
        while True:
            raw = self.ws.recv()
            msg = json.loads(raw)
            if msg.get('id') == self.msg_id:
                if 'error' in msg:
                    raise RuntimeError('%s: %s' % (method, msg['error']))
                return msg.get('result', {})
            # 丢弃事件（但保留给 wait 用）
            self._events = getattr(self, '_events', [])
            self._events.append(msg)

    def new_page(self, url):
        t = self.send('Target.createTarget', {'url': 'about:blank'})
        self._target_id = t['targetId']
        a = self.send('Target.attachToTarget', {'targetId': self._target_id, 'flatten': True})
        self.session_id = a['sessionId']
        self.send('Page.enable', session=self.session_id)
        self.send('Runtime.enable', session=self.session_id)
        self.navigate(url)
        return self.session_id

    def navigate(self, url):
        self.send('Page.navigate', {'url': url}, session=self.session_id)
        time.sleep(1.2)

    def eval(self, expr):
        r = self.send('Runtime.evaluate', {
            'expression': expr, 'returnByValue': True, 'awaitPromise': True,
            'userGesture': True,
        }, session=self.session_id)
        if r.get('exceptionDetails'):
            raise RuntimeError(json.dumps(r['exceptionDetails'], ensure_ascii=False)[:600])
        return r.get('result', {}).get('value')

    def screenshot(self, path):
        r = self.send('Page.captureScreenshot', {'format': 'png', 'captureBeyondViewport': False},
                      session=self.session_id)
        with open(path, 'wb') as fp:
            fp.write(base64.b64decode(r['data']))
        return path

    def console_errors(self):
        errs = []
        for m in getattr(self, '_events', []):
            if m.get('method') == 'Runtime.exceptionThrown':
                d = m['params'].get('exceptionDetails', {})
                errs.append(d.get('exception', {}).get('description') or d.get('text'))
            elif m.get('method') == 'Runtime.consoleAPICalled':
                if m['params'].get('type') == 'error':
                    errs.append(str(m['params'].get('args')))
        # 清空已读事件，避免重复
        self._events = []
        return errs

    def close(self):
        try:
            self.proc.terminate()
        except Exception:
            pass


if __name__ == '__main__':
    c = Chrome()
    c.new_page(sys.argv[1] if len(sys.argv) > 1 else 'about:blank')
    print(c.eval('document.title'))
    c.close()
