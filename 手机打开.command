#!/bin/bash
# 双击这个文件，会弹出一个窗口，里面给出手机能打开的网址。
# 关掉那个窗口（或按 Ctrl+C）就停了。

cd "$(dirname "$0")" || exit 1

PORT=8911
LOG=/tmp/xpl-cloudflared.log

echo ""
echo "  🧾  小票来了 · 手机预览"
echo "  ──────────────────────────────────────"
echo ""

# 1. 本机预览服务
if ! lsof -nP -iTCP:$PORT -sTCP:LISTEN >/dev/null 2>&1; then
  python3 -m http.server $PORT --bind 127.0.0.1 >/tmp/xpl-http.log 2>&1 &
  HTTP_PID=$!
  sleep 1
  echo "  ✅ 电脑上先看看：http://127.0.0.1:$PORT"
else
  echo "  ✅ 电脑预览服务已经在跑：http://127.0.0.1:$PORT"
  HTTP_PID=""
fi

# 2. 手机要用的 HTTPS 网址
if [ ! -x ./bin/cloudflared ]; then
  echo "  ❌ 没找到 bin/cloudflared，手机网址开不了。"
  echo "     电脑版仍然能用：http://127.0.0.1:$PORT"
  echo ""
  read -r -p "  按回车关闭…" _
  [ -n "$HTTP_PID" ] && kill $HTTP_PID 2>/dev/null
  exit 1
fi

CF_PID=""
cleanup() {
  [ -n "$CF_PID" ] && kill "$CF_PID" 2>/dev/null
  [ -n "$HTTP_PID" ] && kill "$HTTP_PID" 2>/dev/null
  rm -f "$LOG"
  echo ""
  echo "  已停止。"
  exit 0
}
trap cleanup INT TERM

rm -f "$LOG"
./bin/cloudflared tunnel --url "http://127.0.0.1:$PORT" --protocol http2 --no-autoupdate >"$LOG" 2>&1 &
CF_PID=$!

echo "  ⏳ 正在要一个手机能开的网址…"
URL=""
for _ in $(seq 1 40); do
  URL=$(grep -Eo 'https://[a-z0-9-]+\.trycloudflare\.com' "$LOG" 2>/dev/null | head -1)
  [ -n "$URL" ] && break
  sleep 0.5
done

if [ -z "$URL" ]; then
  echo "  ❌ 没拿到网址（可能是网络问题）。电脑版仍然能用：http://127.0.0.1:$PORT"
  echo ""
  read -r -p "  按回车关闭…" _
  cleanup
fi

echo ""
echo "  ✅ 手机用这个网址打开（同一个 Wi-Fi 或流量都行）："
echo ""
echo "     $URL"
echo ""
echo "  小提示："
echo "   · 手机浏览器打开后，点分享 → 添加到主屏幕，以后像 app 一样用"
echo "   · 这个网址每次重新启动都会变；窗口别关，用的时候一直开着"
echo "   · 想关掉：按 Ctrl+C，或者直接关掉这个窗口"
echo ""
read -r -p "  按回车停止…" _
cleanup
