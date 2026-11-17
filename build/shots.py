#!/usr/bin/env python3
"""按流程截图 + 校验：python3 build/shots.py [url]"""
import base64
import json
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from cdp import Chrome  # noqa: E402

URL = sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:8911/'
OUT = os.path.join(os.path.dirname(HERE), '截图')


def main():
    c = Chrome(port=9333, user_dir='/tmp/xpl-prof')
    sid = None
    try:
        sid = c.new_page(URL)
        c.send('Emulation.setDeviceMetricsOverride', {
            'width': 390, 'height': 844, 'deviceScaleFactor': 2, 'mobile': True,
        }, session=sid)
        c.send('Emulation.setTouchEmulationEnabled',
               {'enabled': True, 'maxTouchPoints': 5}, session=sid)
        c.send('Page.reload', {'ignoreCache': True}, session=sid)
        time.sleep(1.1)

        # A 首页
        c.screenshot(os.path.join(OUT, '01-首页.png'))
        print('A 首页 OK')

        # B 开单面板
        c.eval("document.getElementById('btn-print').click()")
        time.sleep(0.7)
        c.screenshot(os.path.join(OUT, '02-开单.png'))
        print('B 开单面板 OK')

        # C 打印中
        c.eval("document.getElementById('btn-do-print').click()")
        time.sleep(1.05)
        c.screenshot(os.path.join(OUT, '03-打印中.png'))
        st = c.eval("JSON.stringify({h: document.getElementById('slot').style.height, mode: window.__xpl.state.mode})")
        print('C 打印中', st)

        # D 打完（等出纸完）
        time.sleep(2.6)
        c.eval("window.scrollTo(0,0)")
        time.sleep(0.35)
        c.screenshot(os.path.join(OUT, '04-打完.png'))
        info = c.eval("""(() => {
          const s = document.getElementById('slot');
          const w = document.getElementById('wrap');
          const cv = document.getElementById('cv-paper');
          const ink = document.getElementById('cv-ink');
          const cs = getComputedStyle(ink);
          return {
            mode: window.__xpl.state.mode,
            slotH: s.getBoundingClientRect().height,
            wrapH: w.style.height,
            canvas: [cv.width, cv.height, cv.style.width, cv.style.height],
            ph: w.style.getPropertyValue('--ph'),
            mask: cs.maskImage || cs.webkitMaskImage,
            pageH: document.documentElement.scrollHeight
          };
        })()""")
        print('D 打完', json.dumps(info, ensure_ascii=False))

        # E 整张纸全貌
        c.eval("window.scrollTo(0, 380)")
        time.sleep(0.3)
        c.screenshot(os.path.join(OUT, '05-小票上半.png'))
        c.eval("window.scrollTo(0, 900)")
        time.sleep(0.3)
        c.screenshot(os.path.join(OUT, '06-小票下半.png'))

        # F 导出 PNG 落盘
        data = c.eval("""(() => {
          return new Promise(res => {
            window.__xpl.state.receipt && null;
            const d = window.__xpl.state.data;
            const r = window.Receipt.render(d, {dpr: 3});
            const o = document.createElement('canvas');
            o.width = r.canvas.width; o.height = r.canvas.height;
            const g = o.getContext('2d');
            g.fillStyle = '#FDFAF1'; g.fillRect(0,0,o.width,o.height);
            g.drawImage(r.canvas, 0, 0);
            res({url: o.toDataURL('image/png'), w: o.width, h: o.height,
                 bg: (() => { const p = g.getImageData(0,0,1,1).data; return [p[0],p[1],p[2],p[3]]; })()});
          });
        })()""")
        if data and data.get('url'):
            b64 = data['url'].split(',', 1)[1]
            with open(os.path.join(OUT, '07-导出原图.png'), 'wb') as f:
                f.write(base64.b64decode(b64))
            print('F 导出 OK', data['w'], 'x', data['h'], '底色', data.get('bg'))
        else:
            print('F 导出失败', data)

        # G 撕纸
        c.eval("window.__xpl.tearNow()")
        time.sleep(0.62)
        c.screenshot(os.path.join(OUT, '08-撕纸.png'))
        time.sleep(0.9)
        print('G 撕纸后', c.eval("JSON.stringify({mode: window.__xpl.state.mode, h: document.getElementById('slot').style.height})"))

        errs = c.console_errors()
        print('console errors:', errs if errs else 'none')
    finally:
        c.close()


if __name__ == '__main__':
    main()
