#!/usr/bin/env bash
#
# Установка FUTBOL X на сервер.
#
# Скрипт создаёт только свои файлы и НЕ РЕДАКТИРУЕТ ничего существующего:
#   /opt/futbolx                      — код игры (git-клон)
#   /etc/systemd/system/futbolx.service — служба
#   /etc/nginx/sites-available/futbolx  — опционально, отдельный server-блок
#
# Чужие сайты, конфиги nginx по умолчанию и другие проекты не затрагиваются.
#
# Использование:
#   sudo bash install.sh                 # только Node-сервер на :8787
#   sudo bash install.sh --nginx         # плюс проксирование через nginx на :8080
#   sudo bash install.sh --public --port 9100   # без прокси, сразу наружу
#   sudo bash install.sh --port 9000     # другой порт для Node
#   sudo bash install.sh --dry-run       # показать, что будет сделано

set -euo pipefail

REPO_URL="https://github.com/spawnwin/TeleDrive.git"
BRANCH="claude/football-simulator-browser-52jqnc"
APP_DIR="/opt/futbolx"
SERVICE="futbolx"
NODE_PORT="8787"
NODE_HOST="127.0.0.1"
NGINX_PORT="8080"
WITH_NGINX="no"
DRY_RUN="no"
MARKER="# managed-by: futbolx-installer"
# Базе нужен модуль node:sqlite, он появился в Node 22.
NODE_MIN_MAJOR=22
NODE_PIN="v22.23.1"
RUNTIME_DIR="/opt/futbolx-runtime"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --nginx)       WITH_NGINX="yes"; shift ;;
    --public)      NODE_HOST="0.0.0.0"; shift ;;
    --port)        NODE_PORT="$2"; shift 2 ;;
    --nginx-port)  NGINX_PORT="$2"; shift 2 ;;
    --branch)      BRANCH="$2"; shift 2 ;;
    --dry-run)     DRY_RUN="yes"; shift ;;
    *) echo "Неизвестный параметр: $1" >&2; exit 1 ;;
  esac
done

say()  { printf '\033[1;32m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[!]\033[0m %s\n' "$*"; }
die()  { printf '\033[1;31m[x]\033[0m %s\n' "$*" >&2; exit 1; }
# Аргументы передаются как есть, без eval: команда не пересобирается из строки.
run()  { if [[ "$DRY_RUN" == "yes" ]]; then printf '    (dry-run) %s\n' "$*"; else "$@"; fi; }

[[ $EUID -eq 0 ]] || die "Запускать от root: sudo bash install.sh"

# ---------- Node.js ----------
node_major() {
  local bin="$1"
  [[ -x "$bin" ]] || return 1
  "$bin" -p 'process.versions.node.split(".")[0]' 2>/dev/null
}

# Настоящее требование — модуль node:sqlite, а не номер версии: в части
# сборок 22.x он ещё за флагом. Проверяем напрямую.
node_has_sqlite() {
  local bin="$1"
  [[ -x "$bin" ]] || return 1
  "$bin" -e 'require("node:sqlite")' >/dev/null 2>&1
}

command -v git >/dev/null 2>&1 || {
  run apt-get update -qq
  run env DEBIAN_FRONTEND=noninteractive apt-get install -y -qq git
}

NODE_BIN=""
SYS_NODE="$(command -v node || true)"
if [[ -n "$SYS_NODE" ]]; then
  SYS_MAJOR="$(node_major "$SYS_NODE" || echo 0)"
  say "Системный Node.js: $("$SYS_NODE" -v)"
  if [[ "${SYS_MAJOR:-0}" -ge "$NODE_MIN_MAJOR" ]] && node_has_sqlite "$SYS_NODE"; then
    NODE_BIN="$SYS_NODE"
    say "Системный Node подходит: модуль node:sqlite доступен"
  fi
fi

# Системный Node не трогаем: его версию могут использовать другие проекты
# на этом же сервере. Для игры ставим отдельную среду в свой каталог.
if [[ -z "$NODE_BIN" ]]; then
  if node_has_sqlite "$RUNTIME_DIR/bin/node"; then
    NODE_BIN="$RUNTIME_DIR/bin/node"
    say "Отдельная среда уже стоит: $("$NODE_BIN" -v)"
  else
    case "$(uname -m)" in
      x86_64)  NARCH="linux-x64" ;;
      aarch64) NARCH="linux-arm64" ;;
      *) die "Неизвестная архитектура $(uname -m). Поставьте Node ${NODE_MIN_MAJOR}+ вручную." ;;
    esac
    TARBALL="node-${NODE_PIN}-${NARCH}.tar.xz"
    say "Ставим Node ${NODE_PIN} только для игры в ${RUNTIME_DIR} (системный не меняем)"
    if [[ "$DRY_RUN" == "yes" ]]; then
      echo "    (dry-run) скачивание и распаковка $TARBALL"
      NODE_BIN="$RUNTIME_DIR/bin/node"
    else
      command -v curl >/dev/null 2>&1 || env DEBIAN_FRONTEND=noninteractive apt-get install -y -qq curl
      command -v xz >/dev/null 2>&1 || env DEBIAN_FRONTEND=noninteractive apt-get install -y -qq xz-utils
      tmp="$(mktemp -d)"
      curl -fsSL "https://nodejs.org/dist/${NODE_PIN}/${TARBALL}" -o "$tmp/$TARBALL"
      curl -fsSL "https://nodejs.org/dist/${NODE_PIN}/SHASUMS256.txt" -o "$tmp/SHASUMS256.txt"
      # Проверяем контрольную сумму: подменённый архив не должен попасть на сервер.
      ( cd "$tmp" && grep " ${TARBALL}\$" SHASUMS256.txt | sha256sum -c - ) \
        || die "Контрольная сумма Node не сошлась, установка прервана."
      rm -rf "$RUNTIME_DIR"
      mkdir -p "$RUNTIME_DIR"
      tar -xJf "$tmp/$TARBALL" -C "$RUNTIME_DIR" --strip-components=1
      rm -rf "$tmp"
      NODE_BIN="$RUNTIME_DIR/bin/node"
      node_has_sqlite "$NODE_BIN" \
        || die "В Node ${NODE_PIN} нет модуля node:sqlite. Обновите NODE_PIN в скрипте."
      say "Готово: $("$NODE_BIN" -v), модуль node:sqlite на месте"
    fi
  fi
fi

# ---------- код ----------
if [[ -d "$APP_DIR/.git" ]]; then
  existing_remote="$(git -C "$APP_DIR" remote get-url origin 2>/dev/null || echo '')"
  [[ "$existing_remote" == "$REPO_URL" ]] || die "$APP_DIR занят другим репозиторием ($existing_remote). Уберите его или укажите другой путь."
  say "Обновляем код в $APP_DIR"
  run git -C "$APP_DIR" fetch --depth 1 origin "$BRANCH"
  run git -C "$APP_DIR" checkout -B "$BRANCH" FETCH_HEAD
elif [[ -e "$APP_DIR" ]]; then
  die "$APP_DIR существует и не является нашим клоном. Ничего не трогаю."
else
  say "Клонируем репозиторий в $APP_DIR"
  run git clone --depth 1 --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
fi

run mkdir -p "$APP_DIR/football-simulator/server/data"

# Отдельный системный пользователь: служба не должна ходить под root.
if ! id futbolx >/dev/null 2>&1; then
  say "Создаём системного пользователя futbolx"
  run useradd --system --home "$APP_DIR" --shell /usr/sbin/nologin futbolx
fi
run chown -R futbolx:futbolx "$APP_DIR/football-simulator/server/data"

# ---------- служба ----------
UNIT="/etc/systemd/system/${SERVICE}.service"
if [[ -f "$UNIT" ]] && ! grep -q "$MARKER" "$UNIT"; then
  die "$UNIT существует и создан не этим установщиком. Ничего не трогаю."
fi

# ---------- пароль панели управления ----------
# Лежит отдельным файлом с правами 0600: в юните его видел бы любой,
# кто может прочитать /etc/systemd/system. При повторном запуске
# установщика пароль не меняется — иначе админ терял бы доступ.
ENV_FILE="/etc/futbolx.env"
if [[ "$DRY_RUN" == "yes" ]]; then
  echo "    (dry-run) пароль панели в $ENV_FILE"
  ADMIN_PASS="(dry-run)"
elif [[ -f "$ENV_FILE" ]] && grep -q '^FUTBOLX_ADMIN_PASSWORD=' "$ENV_FILE"; then
  ADMIN_PASS="$(grep '^FUTBOLX_ADMIN_PASSWORD=' "$ENV_FILE" | cut -d= -f2-)"
  say "Пароль панели управления уже задан, оставляем прежний"
else
  ADMIN_PASS="$(head -c 12 /dev/urandom | base64 | tr -d '/+=' | head -c 14)"
  printf 'FUTBOLX_ADMIN_PASSWORD=%s\n' "$ADMIN_PASS" > "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  say "Создан пароль панели управления"
fi

say "Настраиваем службу ${SERVICE} на порту ${NODE_PORT}"
if [[ "$DRY_RUN" == "yes" ]]; then
  echo "    (dry-run) запись $UNIT"
else
  cat > "$UNIT" <<UNITEOF
$MARKER
[Unit]
Description=FUTBOL X — бэкенд футбольного менеджера
After=network.target

[Service]
Type=simple
User=futbolx
WorkingDirectory=$APP_DIR/football-simulator/server
Environment=PORT=$NODE_PORT
Environment=HOST=$NODE_HOST
Environment=DB_FILE=$APP_DIR/football-simulator/server/data/futbolx.json
EnvironmentFile=-$ENV_FILE
ExecStart=$NODE_BIN server.js
Restart=on-failure
RestartSec=3

# Ограничения: служба не должна иметь доступ никуда, кроме своей папки.
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=$APP_DIR/football-simulator/server/data

[Install]
WantedBy=multi-user.target
UNITEOF
fi

run systemctl daemon-reload
run systemctl enable --now "$SERVICE"
run sleep 2

# Без прокси служба смотрит наружу сама — тогда её порт нужно открыть.
if [[ "$NODE_HOST" == "0.0.0.0" ]] && command -v ufw >/dev/null 2>&1 \
   && ufw status 2>/dev/null | grep -q "Status: active"; then
  say "Открываем порт ${NODE_PORT} в ufw"
  run ufw allow "${NODE_PORT}/tcp"
fi

# ---------- nginx (по желанию) ----------
if [[ "$WITH_NGINX" == "yes" ]]; then
  command -v nginx >/dev/null 2>&1 || die "nginx не установлен, а запрошен --nginx"
  SITE="/etc/nginx/sites-available/futbolx"
  LINK="/etc/nginx/sites-enabled/futbolx"

  if [[ -f "$SITE" ]] && ! grep -q "$MARKER" "$SITE"; then
    die "$SITE существует и создан не этим установщиком. Ничего не трогаю."
  fi

  say "Добавляем отдельный server-блок nginx на порту ${NGINX_PORT}"
  if [[ "$DRY_RUN" == "yes" ]]; then
    echo "    (dry-run) запись $SITE и симлинк $LINK"
  else
    cat > "$SITE" <<SITEEOF
$MARKER
# Отдельный блок для FUTBOL X. Существующие сайты не затрагиваются.
server {
    listen ${NGINX_PORT};
    listen [::]:${NGINX_PORT};
    server_name _;

    client_max_body_size 2m;

    location / {
        proxy_pass http://127.0.0.1:${NODE_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
SITEEOF
    ln -sfn "$SITE" "$LINK"

    # Проверяем конфиг до перезагрузки: битый конфиг уронил бы и соседние сайты.
    if ! nginx -t 2>/tmp/futbolx-nginx-test; then
      cat /tmp/futbolx-nginx-test >&2
      rm -f "$LINK"
      die "nginx -t не прошёл, симлинк убран, ничего не перезагружено."
    fi
    systemctl reload nginx
  fi

  if command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | grep -q "Status: active"; then
    say "Открываем порт ${NGINX_PORT} в ufw"
    run ufw allow "${NGINX_PORT}/tcp"
  fi
fi

# ---------- проверка ----------
say "Проверяем, что сервер отвечает"
if [[ "$DRY_RUN" != "yes" ]]; then
  if HEALTH="$(curl -fsS --max-time 10 "http://127.0.0.1:${NODE_PORT}/api/health")"; then
    case "$HEALTH" in
      *'"storage":"sqlite"'*) say "Служба работает, хранилище: SQLite." ;;
      *'"storage":"json"'*)   warn "Служба работает, но хранилище JSON — node:sqlite недоступен." ;;
      *)                      say "Служба работает." ;;
    esac
  else
    warn "Служба не ответила. Логи: journalctl -u ${SERVICE} -n 50 --no-pager"
    exit 1
  fi
fi

IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
echo
say "Готово."
echo "  Служба:    systemctl status ${SERVICE}"
echo "  Логи:      journalctl -u ${SERVICE} -f"
echo "  Обновить:  bash $APP_DIR/football-simulator/deploy/update.sh"
if [[ "$WITH_NGINX" == "yes" ]]; then
  echo "  Игра:      http://${IP:-<адрес-сервера>}:${NGINX_PORT}"
elif [[ "$NODE_HOST" == "0.0.0.0" ]]; then
  echo "  Игра:      http://${IP:-<адрес-сервера>}:${NODE_PORT}"
else
  echo "  Игра:      http://127.0.0.1:${NODE_PORT} (наружу порт не открыт —"
  echo "             запустите с --public или --nginx)"
fi

if [[ "$WITH_NGINX" == "yes" ]]; then
  BASE_URL="http://${IP:-<адрес-сервера>}:${NGINX_PORT}"
else
  BASE_URL="http://${IP:-<адрес-сервера>}:${NODE_PORT}"
fi
echo
echo "  ┌─ Панель управления ─────────────────────────────────"
echo "  │  адрес:  ${BASE_URL}/admin"
echo "  │  пароль: ${ADMIN_PASS}"
echo "  │"
echo "  │  Пароль лежит в ${ENV_FILE} (права 0600) и при"
echo "  │  повторной установке не меняется. Сменить можно"
echo "  │  прямо в панели или отредактировав этот файл."
echo "  └─────────────────────────────────────────────────────"
