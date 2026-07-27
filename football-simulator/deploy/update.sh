#!/usr/bin/env bash
#
# Обновление FUTBOL X на сервере: подтянуть свежий код и перезапустить службу.
# База игроков в server/data не трогается.

set -euo pipefail

APP_DIR="${APP_DIR:-/opt/futbolx}"
SERVICE="${SERVICE:-futbolx}"
BRANCH="${BRANCH:-claude/football-simulator-browser-52jqnc}"

say() { printf '\033[1;32m==>\033[0m %s\n' "$*"; }
die() { printf '\033[1;31m[x]\033[0m %s\n' "$*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || die "Запускать от root: sudo bash update.sh"
[[ -d "$APP_DIR/.git" ]] || die "$APP_DIR не похож на установленную копию"

say "Забираем свежий код ветки $BRANCH"
git -C "$APP_DIR" fetch --depth 1 origin "$BRANCH"
git -C "$APP_DIR" checkout -B "$BRANCH" FETCH_HEAD

say "Перезапускаем службу $SERVICE"
systemctl restart "$SERVICE"
sleep 2

PORT="$(systemctl show -p Environment "$SERVICE" | tr ' ' '\n' | sed -n 's/^PORT=//p' | head -1)"
PORT="${PORT:-8787}"

if curl -fsS --max-time 10 "http://127.0.0.1:${PORT}/api/health" >/dev/null; then
  say "Обновлено, сервер отвечает."
  git -C "$APP_DIR" log -1 --format='    %h %s'
else
  die "Сервер не ответил. Логи: journalctl -u $SERVICE -n 50 --no-pager"
fi
