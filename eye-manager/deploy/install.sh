#!/usr/bin/env bash
set -euo pipefail
# Install / update EYE Manager on VPS. Does NOT touch Aurora.

APP_DIR="${EYE_APP_DIR:-/opt/eye-manager}"
PORT="${EYE_PORT:-9140}"
SERVICE_USER="${EYE_USER:-eyemanager}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "[EYE] installing into $APP_DIR (port $PORT) from $SRC_DIR"

if [[ ! -f "$SRC_DIR/server/server.js" ]]; then
  echo "[EYE] ERROR: source tree missing server/server.js under $SRC_DIR" >&2
  exit 1
fi

if ! id "$SERVICE_USER" &>/dev/null; then
  useradd --system --home "$APP_DIR" --shell /usr/sbin/nologin "$SERVICE_USER" || true
fi

mkdir -p "$APP_DIR" "$APP_DIR/server/data"
# When already installing from inside APP_DIR, skip destructive rsync.
if [[ "$SRC_DIR" != "$APP_DIR" ]]; then
  rsync -a --delete \
    --exclude 'server/data' \
    --exclude 'server/data-test' \
    --exclude 'server/node_modules' \
    --exclude '.git' \
    "$SRC_DIR/" "$APP_DIR/"
else
  echo "[EYE] source is APP_DIR — skip rsync"
fi

# Prisma SQLite
cd "$APP_DIR/server"
export DATABASE_URL="file:$APP_DIR/server/data/eye.db"
echo "DATABASE_URL=\"file:$APP_DIR/server/data/eye.db\"" > .env
npm install --omit=dev
npx prisma generate
npx prisma db push --skip-generate
cd "$APP_DIR"

chown -R "$SERVICE_USER":"$SERVICE_USER" "$APP_DIR"

cat >/etc/systemd/system/eye-manager.service <<EOF
[Unit]
Description=EYE Football Manager
After=network.target

[Service]
Type=simple
User=$SERVICE_USER
WorkingDirectory=$APP_DIR
Environment=EYE_PORT=$PORT
Environment=EYE_DATA=$APP_DIR/server/data
Environment=DATABASE_URL=file:$APP_DIR/server/data/eye.db
ExecStart=/usr/bin/node $APP_DIR/server/server.js
Restart=on-failure
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable eye-manager
systemctl restart eye-manager

# Dedicated nginx site for /eye/ on the public IP — does not modify Aurora site
cat >/etc/nginx/sites-available/eye <<EOF
# EYE Football Manager — isolated from Aurora
server {
    listen 80;
    listen [::]:80;
    server_name 135.106.173.99;

    location /eye/ {
        proxy_pass http://127.0.0.1:${PORT}/;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF

# Prefer injecting into existing IP vhost (rubezh) if present, else enable eye site.
if [[ -f /etc/nginx/sites-enabled/rubezh ]]; then
  if ! grep -q 'location /eye/' /etc/nginx/sites-enabled/rubezh; then
    # Insert before the first "location / {" using awk (no indented Python)
    awk '
      BEGIN{done=0}
      /location \/ \{/ && !done {
        print "    # EYE Football Manager (do not touch Aurora)"
        print "    location /eye/ {"
        print "        proxy_pass http://127.0.0.1:'"$PORT"'/;"
        print "        proxy_http_version 1.1;"
        print "        proxy_set_header Host $host;"
        print "        proxy_set_header X-Real-IP $remote_addr;"
        print "        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;"
        print "        proxy_set_header X-Forwarded-Proto $scheme;"
        print "    }"
        print ""
        done=1
      }
      {print}
    ' /etc/nginx/sites-enabled/rubezh > /tmp/rubezh.eye.conf
    mv /tmp/rubezh.eye.conf /etc/nginx/sites-enabled/rubezh
    echo "[EYE] nginx /eye/ location added to rubezh vhost"
  else
    echo "[EYE] nginx /eye/ already present"
  fi
  rm -f /etc/nginx/sites-enabled/eye
else
  ln -sfn /etc/nginx/sites-available/eye /etc/nginx/sites-enabled/eye
fi

nginx -t
systemctl reload nginx

sleep 1
curl -sf "http://127.0.0.1:$PORT/api/health" && echo
echo "[EYE] OK — http://135.106.173.99:$PORT/  and  http://135.106.173.99/eye/"
