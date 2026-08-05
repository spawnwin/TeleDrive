#!/usr/bin/env bash
# Держит бота + Cloudflare tunnel (HTTPS для Telegram Mini App)
set -euo pipefail
cd "$(dirname "$0")"

if [[ ! -f .env ]]; then
  echo "Нет .env — скопируйте .env.example и укажите BOT_TOKEN"
  exit 1
fi

set -a
# shellcheck disable=SC1091
source .env
set +a

if [[ -z "${BOT_TOKEN:-}" ]]; then
  echo "BOT_TOKEN пустой"
  exit 1
fi

npm run build -w web
npm run build -w bot

CLOUDFLARED="${CLOUDFLARED_BIN:-cloudflared}"
if ! command -v "$CLOUDFLARED" >/dev/null 2>&1; then
  CLOUDFLARED=/tmp/cloudflared
fi

cleanup() {
  [[ -n "${BOT_PID:-}" ]] && kill "$BOT_PID" 2>/dev/null || true
  [[ -n "${TUNNEL_PID:-}" ]] && kill "$TUNNEL_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

# Стартуем бота временно на localhost, потом обновим WEBAPP_URL
export WEBAPP_URL="${WEBAPP_URL:-http://localhost:${PORT:-3000}}"
node bot/dist/index.js &
BOT_PID=$!
sleep 2

LOG=$(mktemp)
"$CLOUDFLARED" tunnel --url "http://localhost:${PORT:-3000}" --no-autoupdate >"$LOG" 2>&1 &
TUNNEL_PID=$!

echo "Ждём Cloudflare URL…"
URL=""
for _ in $(seq 1 40); do
  URL=$(grep -oE 'https://[a-zA-Z0-9.-]+\.trycloudflare\.com' "$LOG" | head -1 || true)
  if [[ -n "$URL" ]]; then
    break
  fi
  sleep 1
done

if [[ -z "$URL" ]]; then
  echo "Не удалось получить tunnel URL"
  cat "$LOG"
  exit 1
fi

echo "Mini App: $URL"
# Обновляем .env и перезапускаем бота с правильным URL
sed -i "s|^WEBAPP_URL=.*|WEBAPP_URL=$URL|" .env
export WEBAPP_URL="$URL"
kill "$BOT_PID" 2>/dev/null || true
wait "$BOT_PID" 2>/dev/null || true
node bot/dist/index.js &
BOT_PID=$!

# Menu button + имя
curl -fsS -X POST "https://api.telegram.org/bot${BOT_TOKEN}/setChatMenuButton" \
  -H 'Content-Type: application/json' \
  -d "{\"menu_button\":{\"type\":\"web_app\",\"text\":\"Златник\",\"web_app\":{\"url\":\"${URL}\"}}}" >/dev/null || true
curl -fsS -X POST "https://api.telegram.org/bot${BOT_TOKEN}/setMyName" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Златник"}' >/dev/null || true

echo "Готово. Бот @Caura_bot → /start → Открыть Златник"
echo "URL: $URL"
wait
