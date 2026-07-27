# AGENTS.md

## Cursor Cloud specific instructions

This repo contains two distinct products:

- **TeleDrive** (root `package.json`, yarn-workspaces monorepo: `api` + `web`). A Telegram-API-backed cloud storage app. This is the buildable/runnable product in this repo.
- **Aurora** (`aurora/`). A separate Next.js/Capacitor messenger delivered here only as a **patch-set** to be applied onto a live server at `/opt/aurora`. It has **no `package.json`, lockfile, or `tsconfig.json`**, and `aurora/mini-services/chat-service` imports a `../shared/ws-auth` module that is **not present** in this repo. Aurora therefore **cannot be installed/built/run standalone** from this checkout — do not attempt a fresh `next build` here; edit the source files and deploy them to the existing `/opt/aurora` install.

### Toolchain / environment
- Node is pinned to **18.16.0** (root `package.json` `engines`). Node 18 is installed via nvm and prepended to `PATH` in `~/.bashrc`, so login shells get it automatically. A newer Node (`/exec-daemon/node`, v22) exists on the base image and will shadow nvm in non-login shells — if `node -v` is not 18, run `export PATH="$HOME/.nvm/versions/node/v18.16.0/bin:$PATH"`.
- Package manager is **yarn classic** (1.x). Update script: `yarn install --ignore-engines`.

### Services (TeleDrive)
| Service | Dir | Dev run | Port |
| --- | --- | --- | --- |
| API (Express + Prisma + GramJS) | `api` | `yarn api start` (nodemon on `dist/`) | 4000 |
| Web (CRA / react-scripts 4) | `web` | `yarn web start` | 3000 |

- **Build/lint:** `yarn api build` runs `prisma generate` + `eslint` + `tsc` (and generates a `keys` file for JWTs). `yarn web build` runs the CRA build (lint runs during build/start). There is no separate `lint` script. The only automated test runner is `yarn web test` (react-scripts/jest).
- `yarn api start` runs the **compiled** `dist/index.js`, so run `yarn api build` first (and after changing `api/src`). `yarn web start` hot-reloads from source.
- CRA (react-scripts 4) needs the OpenSSL legacy flag on modern Node; this is already baked into the `web` `start`/`build` scripts (`--openssl-legacy-provider --no-experimental-fetch`), so use those yarn scripts rather than calling `react-scripts` directly.

### PostgreSQL
- Required by the API (Prisma, `DATABASE_URL=postgresql://postgres@localhost:5432/teledrive`). PostgreSQL 16 is installed but **not auto-started** (no systemd). Start it each session with `sudo pg_ctlcluster 16 main start`. `pg_hba.conf` is set to `trust` for `127.0.0.1`/`::1` so the passwordless `postgres` user connects over TCP.
- Apply schema with `yarn api prisma migrate deploy`.

### Env files
- `api/.env` and `web/.env` are git-ignored and created from the `*-example` files. `TG_API_ID`/`TG_API_HASH` (and `REACT_APP_TG_API_ID`/`REACT_APP_TG_API_HASH`) are left blank — they require real Telegram API credentials from https://my.telegram.org. Without them the app loads and the "Login with Telegram" page is fully functional, but "Send code" fails at Telegram-client init (`api_id and api_hash are required`), so end-to-end Telegram login/upload cannot be exercised without those secrets.
- Optional: `REDIS_URI` (caching; code no-ops if unset), `TG_BOT_TOKEN`/`TG_BOT_OWNER_ID` (error reporting).
