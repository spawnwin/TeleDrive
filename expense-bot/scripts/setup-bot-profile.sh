#!/usr/bin/env bash
# Одноразовая настройка профиля бота (имя, описания, команды, меню, аватар)
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ ! -f .env ]]; then
  echo "Нет .env"
  exit 1
fi

set -a
# shellcheck disable=SC1091
source .env
set +a

: "${BOT_TOKEN:?BOT_TOKEN не задан}"
: "${WEBAPP_URL:?WEBAPP_URL не задан}"

URL="${WEBAPP_URL%/}"
API="https://api.telegram.org/bot${BOT_TOKEN}"

NAME='Златник'
SHORT='Учёт расходов · золотая монета Древней Руси'
DESC=$'Златник — мини-приложение для учёта расходов.\n\nИмя от первой золотой монеты Древней Руси.\n\n• Быстрые траты по категориям\n• Сводка за день, неделю и месяц\n• Свои категории\n• Тёмный Liquid Glass-интерфейс\n\nНажми «Открыть Златник» или кнопку меню.'

echo "→ имя"
curl -fsS -X POST "$API/setMyName" -H 'Content-Type: application/json' \
  -d "{\"name\":\"$NAME\"}" | tee /dev/null
echo

echo "→ короткое описание"
curl -fsS -X POST "$API/setMyShortDescription" -H 'Content-Type: application/json' \
  --data-binary @- <<EOF
{"short_description":"$SHORT"}
EOF
echo

echo "→ полное описание"
python3 - <<PY
import json, os, urllib.request
desc = """Златник — мини-приложение для учёта расходов.

Имя от первой золотой монеты Древней Руси.

• Быстрые траты по категориям
• Сводка за день, неделю и месяц
• Свои категории
• Тёмный Liquid Glass-интерфейс

Нажми «Открыть Златник» или кнопку меню."""
body = json.dumps({"description": desc}, ensure_ascii=False).encode()
req = urllib.request.Request(
    f"https://api.telegram.org/bot{os.environ['BOT_TOKEN']}/setMyDescription",
    data=body,
    headers={"Content-Type": "application/json"},
)
print(urllib.request.urlopen(req).read().decode())
PY

echo "→ команды"
curl -fsS -X POST "$API/setMyCommands" -H 'Content-Type: application/json' \
  -d '{"commands":[
    {"command":"start","description":"Запустить и открыть Златник"},
    {"command":"app","description":"Открыть мини-приложение"},
    {"command":"categories","description":"Управление категориями"},
    {"command":"today","description":"Сводка за сегодня"},
    {"command":"month","description":"Сводка за месяц"},
    {"command":"help","description":"Как пользоваться"}
  ]}'
echo

echo "→ кнопка меню (Mini App)"
curl -fsS -X POST "$API/setChatMenuButton" -H 'Content-Type: application/json' \
  -d "{\"menu_button\":{\"type\":\"web_app\",\"text\":\"Златник\",\"web_app\":{\"url\":\"${URL}\"}}}"
echo

AVATAR="assets/zlatnik-avatar.jpg"
if [[ -f "$AVATAR" ]]; then
  echo "→ аватарка"
  curl -fsS -X POST "$API/setMyProfilePhoto" \
    -F 'photo={"type":"static","photo":"attach://pic"}' \
    -F "pic=@${AVATAR};type=image/jpeg"
  echo
fi

echo
echo "Готово. Проверка:"
curl -fsS "$API/getMyName"; echo
curl -fsS "$API/getMyShortDescription"; echo
curl -fsS "$API/getChatMenuButton"; echo
echo "Бот: https://t.me/Caura_bot"
