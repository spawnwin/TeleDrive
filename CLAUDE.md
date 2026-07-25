# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

TeleDrive is a cloud storage web app that uses a user's own Telegram account as the storage
backend (via the MTProto `telegram` client library), giving effectively free, unlimited storage.
There is no proprietary file storage — every uploaded file is a message sent to a Telegram "Saved
Messages"-style chat, and Postgres only stores file metadata (name, size, parent folder, sharing
options) plus a pointer (`message_id`) back to the Telegram message.

## Monorepo layout

Yarn workspaces, two published packages plus supporting, unpublished projects:

```
api/      Express + TypeScript REST API (workspace name: "api")
web/      React (CRA, TS) single-page app (workspace name: "web")
docs/     Docusaurus documentation site (teledriveapp.com docs) — not a yarn workspace
electron/ Thin Electron wrapper that loads the web app in a webview
android/  Expo/React Native wrapper app
integrations/webeditor/  Expo app, separate integration
docker/, install.*.sh, Dockerfile, Dockerfile.fly, fly.toml, vercel.json  Deployment configs for
  Docker, CapRover, Fly.io, Vercel, Heroku, Railway (see README for the various "Deploy to X" buttons)
```

Day-to-day development happens almost entirely in `api/` and `web/`. The root `package.json`
only orchestrates the two workspaces (`api`, `web`); `docs`, `electron`, `android`, and
`integrations` are built/run independently from their own directories.

## Commands

Run from the repo root unless noted.

```bash
yarn install                  # install all workspace deps

# API (workspace "api", alias "server")
yarn api start                # nodemon dist/index.js --watch (run build first)
yarn workspace api build      # rimraf dist && eslint . && tsc  -> dist/
yarn workspace api prisma migrate dev      # create/apply a migration in dev
yarn workspace api prisma migrate deploy   # apply migrations (used in Docker build/CI)
yarn workspace api prisma generate         # regenerate Prisma client (runs automatically as "prebuild")

# Web (workspace "web")
yarn web start                # react-scripts start (dev server)
yarn web build                # react-scripts build -> web/build (served statically by the API)
yarn web test                 # react-scripts test (CRA/Jest, watch mode)
yarn web test -- --watchAll=false --testPathPattern=App   # run a single test file non-interactively

# Both workspaces
yarn build                    # yarn workspaces run build (api + web)
yarn start                    # cd api && node dist/index.js  (serves API + prebuilt web/build)
```

There is no root-level lint/test script; lint via `yarn workspace api build` (ESLint runs as part
of the API build and fails the build on error) or `yarn workspace web build`. The web workspace's
only tests are the default CRA `App.test.tsx` — there is no meaningful frontend test suite. There
are no backend tests either.

### Environment setup

Both `api/.env-example` and `web/.env-example` must be copied to `.env` before running locally.
Key API vars: `TG_API_ID` / `TG_API_HASH` (your own Telegram app credentials from
my.telegram.org), `DATABASE_URL` (Postgres), `ADMIN_USERNAME`, `CACHE_FILES_LIMIT`. Key web vars:
`REACT_APP_API_URL`, `REACT_APP_TG_API_ID`, `REACT_APP_TG_API_HASH`. Postgres and Redis must be
running locally (see `docker/` for a docker-compose reference). On first boot, the API
auto-generates `api/keys` (used to derive `API_JWT_SECRET` / `FILES_JWT_SECRET` if those env vars
are unset) — don't hand-edit or commit that file.

## API architecture (`api/src`)

- **Decorator-based routing** (`api/src/api/base/Endpoint.ts`): controllers are plain classes
  decorated with `@Endpoint.API()` and methods decorated with `@Endpoint.GET/POST/PUT/PATCH/DELETE/USE(path, { middlewares })`.
  `Endpoint.register(...)` (called once in `api/src/api/v1/index.ts`) turns all decorated methods
  across all registered classes into one Express `Router`. The basepath for a class defaults to
  its lowercased class name (`Files` -> `/files`) unless overridden by `@Endpoint.API('/custom')`.
  To add an endpoint: add a decorated method to an existing controller in `api/src/api/v1/`, or add
  a new controller class and register it in `api/src/api/v1/index.ts`.
- **Request wrapping / retry**: every handler and `USE` middleware is wrapped so that Telegram
  "You need to call .connect()" errors are retried (up to 5x with backoff) by reconnecting
  `req.tg`, and any other thrown error/`{status, body}` object is forwarded to Express's error
  handler (`api/src/index.ts`), which reports 5xx errors to a Telegram bot chat if
  `TG_BOT_TOKEN`/`TG_BOT_ERROR_REPORT_ID` are configured.
- **Per-request Telegram client**: `TGClient` middleware (`api/src/api/middlewares/TGClient.ts`)
  attaches an empty-session `TelegramClient` to `req.tg`. `Auth`/`AuthMaybe` middlewares
  (`api/src/api/middlewares/Auth.ts`) instead rebuild `req.tg` from the caller's session string
  (extracted from a JWT in the `Authorization` header or `authorization` cookie), connect it, call
  `getMe()`, and look up the corresponding row in the local `users` table by `tg_id`. `Auth`
  throws 401 if there's no session/user; `AuthMaybe` degrades gracefully (`req.user` stays
  `undefined`) for endpoints that support anonymous/shared access (e.g. public file links).
  `req.tg` / `req.user` / `req.userAuth` / `req.authKey` are typed via the `http.IncomingMessage`
  augmentation in `api/src/Types.ts`.
- **Auth session caching**: `Auth`/`AuthMaybe` cache the `getMe()` + user lookup result in Redis
  under `auth:{authkey}` for 54000s (`api/src/service/Cache.ts`, `getFromCacheFirst`) to avoid
  re-hitting Telegram on every request.
- **Data model** (`api/prisma/schema.prisma`, Postgres via Prisma): `users` (linked to a Telegram
  account by `tg_id`), `files` (self-referential tree via `parent_id` for folders, `link_id` for
  shared-file aliases, `sharing_options: String[]` holding usernames or `'*'` for public sharing,
  `message_id`/`file_id` pointing at the underlying Telegram message), `config` (singleton-ish
  instance flags: signup disabled, invitation code, server-storage toggle), `usages` and
  `rate_limits` (quota/rate-limit bookkeeping), `waitings` (waitlist emails).
- **Controllers** (`api/src/api/v1/`): `Auth` (login/session), `Users`, `Files` (upload/download/
  list/share — the biggest and most central controller; files are streamed to/from Telegram, not
  disk, though there's an optional local `.cached` directory used as a download cache subject to
  `CACHE_FILES_LIMIT`), `Dialogs` (Telegram chat/dialog listing), `Messages`, `Utils`
  (maintenance flag, misc), `Config` (admin config for signup/invitation settings).
- Utility modules live in `api/src/utils/`: `Constant.ts` (env-derived constants, generates and
  persists JWT secrets to `api/keys` on first run), `FilterQuery.ts` (query-string -> Prisma
  `orderBy` sort building), `ObjectParser.ts`/`StringParser.ts` (misc parsing/sanitization
  helpers, e.g. `markdownSafe` used in Telegram error reports).
- `api/src/index.ts` is the Express entrypoint: global middleware (CORS wide open, JSON/urlencoded
  up to 100mb, cookies, `morgan` logging outside production), mounts `/api` -> `API` router,
  serves the built `web/build` as static files with an SPA fallback, and exports both a plain
  Express `app` and a `serverless-http`-wrapped `handler` (for serverless deploy targets like
  Vercel).

## Web architecture (`web/src`)

- Create React App + TypeScript, class-free functional components, Ant Design (`antd`) as the UI
  kit, `swr`/`swr/immutable` for data fetching against the API (`web/src/utils/Fetcher.ts`),
  `react-router-dom` v5 (`Switch`/`Route`, not the v6 API) for routing.
- `web/src/App.tsx` is the top-level shell: theme switching (light/dark via
  `react-css-theme-switcher`, persisted in the logged-in user's `settings.theme`), a maintenance-
  mode banner driven by `/utils/maintenance`, PWA install prompt handling, and lazy-loaded routes
  under `web/src/pages/`: `Startup` (initial phone/OTP login flow), `dashboard` (the main file
  browser — largest page, has its own `components/` subfolder), `Settings`, `view` (public file
  viewer, has its own `components/`), `Login`, `admin` (site-admin config panel), `errors/NotFound`.
- `web/src/utils/Telegram.ts` wraps the `telegram` (GramJS/MTProto) client for browser-side use
  (e.g. driving the login flow before a session/JWT exists); `web/src/utils/Constant.ts` holds
  frontend constants; `web/src/utils/Download.ts` handles browser-side file downloads/streaming
  (via `streamsaver`/`stream-to-blob`).
- The API base URL comes from `REACT_APP_API_URL`; requests carry the session JWT as a
  cookie/Authorization header (see `Fetcher.ts`).
- Note the build/start scripts pass `--openssl-legacy-provider --no-experimental-fetch` — this CRA
  setup requires the legacy OpenSSL provider flag to build on modern Node.

## Conventions

- **Formatting/lint**: 2-space indent, single quotes, no semicolons, no trailing spaces (enforced
  by ESLint in `api/.eslintrc.js` and `web/.eslintrc.js`, the latter extending `react-app`). The
  API build (`tsc` after `eslint`) fails on lint errors, so lint issues block `yarn workspace api build`.
- **PascalCase filenames** for TS/TSX modules that export a class/component/route table
  (`Files.ts`, `Auth.ts`, `Navbar.tsx`), matching their default/primary export.
- New API endpoints follow the existing decorator pattern in `api/src/api/v1/*` rather than
  hand-wiring Express routes.
- Errors inside `Endpoint`-wrapped handlers should be thrown as `{ status, body }` (or a plain
  `Error`) rather than calling `res.status().send()` directly, so the shared error handler and
  Telegram error-reporting hook stay effective.
- Contributions target the `staging` branch (per README), which auto-deploys to a Vercel staging
  build via `.github/workflows/build-staging.yml`; `main`/`fly/deploy` pushes auto-deploy to
  Fly.io via `.github/workflows/deploy.yml`.
