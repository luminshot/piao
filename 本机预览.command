#!/bin/bash
# 双击这个文件：起一个本机小服务，然后自动打开浏览器看预览。
cd "$(dirname "$0")" || exit 1
PORT=8911
if ! lsof -nP -iTCP:$PORT -sTCP:LISTEN >/dev/null 2>&1; then
  python3 -m http.server $PORT --bind 127.0.0.1 >/tmp/xpl-http.log 2>&1 &
  sleep 1
fi
open "http://127.0.0.1:$PORT"
echo ""
echo "  预览地址： http://127.0.0.1:$PORT"
echo "  想给手机看，双击「手机打开.command」。"
echo ""
echo "  关掉这个窗口就会停掉服务。"
read -r -p "  按回车停止…" _
pkill -f "http.server $PORT" 2>/dev/null
