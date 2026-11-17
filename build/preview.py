#!/usr/bin/env python3
"""截图 + 量尺寸：python3 build/preview.py <url> <out.png> [js文件]

用法：
  python3 build/preview.py http://127.0.0.1:8899/ /tmp/a.png
  python3 build/preview.py http://127.0.0.1:8899/ /tmp/b.png build/act_print.js
"""
import json
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from cdp import Chrome  # noqa: E402


def main():
    url = sys.argv[1]
    out = sys.argv[2]
    js_path = sys.argv[3] if len(sys.argv) > 3 else None
    js = ''
    if js_path and os.path.exists(js_path):
        with open(js_path, encoding='utf-8') as f:
            js = f.read()

    c = Chrome(port=9333, user_dir='/tmp/xp-prof')
    try:
        sid = c.new_page(url)
        wh = os.environ.get('WH', '390,844').split(',')
        c.send('Emulation.setDeviceMetricsOverride', {
            'width': int(wh[0]), 'height': int(wh[1]),
            'deviceScaleFactor': float(os.environ.get('DPR', '2')),
            'mobile': os.environ.get('WH') is None,
        }, session=sid)
        if os.environ.get('RESET'):
            try:
                c.eval('localStorage.clear()')
            except Exception:
                pass
        c.send('Page.reload', {'ignoreCache': True}, session=sid)
        time.sleep(0.8)
        c.send('Emulation.setTouchEmulationEnabled', {
            'enabled': True, 'maxTouchPoints': 5,
        }, session=sid)
        time.sleep(0.9)

        if js:
            r = c.eval(js)
            print('JS =>', json.dumps(r, ensure_ascii=False)[:2000])
            time.sleep(0.4)

        errs = c.console_errors()
        if errs:
            print('!! console:', errs[:6])

        if os.environ.get('FULL'):
            c.send('Page.enable', session=sid)
            c.screenshot(out)
        else:
            c.screenshot(out)
        print('saved', out)

        try:
          box = c.eval("""(() => {
          const m = document.getElementById('machine');
          const s = document.getElementById('slot');
          const d = document.documentElement;
          const r = m.getBoundingClientRect();
          return {
            vw: innerWidth, vh: innerHeight,
            scrollW: d.scrollWidth, bodyW: document.body.getBoundingClientRect().width,
            machine: {l: Math.round(r.left), w: Math.round(r.width), t: Math.round(r.top), h: Math.round(r.height)},
            slotH: s ? s.style.height : null,
            saveH: s ? s.getBoundingClientRect().height : null,
            pageH: d.scrollHeight
          };
        })()""")
          print('BOX', json.dumps(box, ensure_ascii=False))
        except Exception as e:
          print('BOX skipped:', str(e)[:120])
    finally:
        c.close()


if __name__ == '__main__':
    main()
