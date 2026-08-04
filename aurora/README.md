# Aurora — UI + viral features

Patches applied on the live Aurora messenger at `135.106.173.99` (`/opt/aurora`).

## Latest
- Yandex Music: per-user OAuth, encrypted tokens, favorites/playlists, mini-player
- Privacy: last seen / who can message / who can call (enforced in API + calls)
- Settings: devices (sessions), blocklist, password change, delete account
- iPhone-style notification sounds; Telegram-like navigation

## Deploy checklist (VPS)

```bash
cd /opt/aurora
# sync overlay, then:
npx prisma db push
npx prisma generate
# required in production .env:
#   TOKEN_ENCRYPTION_KEY=<random 32+ bytes hex>
# optional:
#   YANDEX_MUSIC_SHARE_ENV=1   # only if you intentionally share one YM account with all users
npm run build
pm2 restart aurora-web --update-env
# Call privacy (1:1 + group:invite) lives in the signaling service — always restart both:
pm2 restart aurora-call --update-env
```

Smoke:
- `GET /` → 200
- `GET /yandex-oauth` → 200
- `GET /api/yandex-music/connect` without cookie → 401
