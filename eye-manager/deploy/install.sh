#!/usr/bin/env bash
set -euo pipefail
# Install / update EYE Manager on VPS. Does NOT touch Aurora.

APP_DIR="${EYE_APP_DIR:-/opt/eye-manager}"
PORT="${EYE_PORT:-9140}"
SERVICE_USER="${EYE_USER:-eyemanager}"

echo "[EYE] installing into $APP_DIR (port $PORT)"

if ! id "$SERVICE_USER" &>/dev/null; then
  useradd --system --home "$APP_DIR" --shell /usr/sbin/nologin "$SERVICE_USER" || true
fi

mkdir -p "$APP_DIR" "$APP_DIR/server/data/saves"
rsync -a --delete \
  --exclude 'server/data' \
  --exclude 'server/data-test' \
  --exclude '.git' \
  ./ "$APP_DIR/"

chown -R "$SERVICE_USER":"$SERVICE_USER" "$APP_DIR"

# systemd unit
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
ExecStart=/usr/bin/node $APP_DIR/server/server.js
Restart=on-failure
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable eye-manager
systemctl restart eye-manager

# nginx snippet for http://IP/eye/
if [[ -f /etc/nginx/sites-enabled/rubezh ]]; then
  if ! grep -q 'location /eye/' /etc/nginx/sites-enabled/rubezh; then
    python3 - <<'PY'
from pathlib import Path
p = Path('/etc/nginx/sites-enabled/rubezh')
text = p.read_text()
snippet = '''
    # EYE Football Manager (do not touch Aurora)
    location /eye/ {
        proxy_pass http://127.0.0.1:9140/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
'''
    if 'location /api/' in text:
        text = text.replace('location /api/', snippet + '\n    location /api/', 1)
    else:
        text = text.replace('location / {', snippet + '\n    location / {', 1)
    p.write_text(text)
    print('[EYE] nginx /eye/ location added')
PY
    nginx -t && systemctl reload nginx
  else
    echo "[EYE] nginx /eye/ already present"
  fi
fi

sleep 1
curl -sf "http://127.0.0.1:$PORT/api/health" && echo
echo "[EYE] OK — http://135.106.173.99:$PORT/  and  http://135.106.173.99/eye/"
