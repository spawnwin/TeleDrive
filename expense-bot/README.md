# Кошелёк — Telegram Mini App для учёта расходов

Красивый бот с мини-приложением: открывается прямо в Telegram, считает траты по категориям, показывает день / месяц / неделю.

## Возможности

- Кнопка **«Открыть Кошелёк»** в боте → Telegram Mini App
- Быстрое добавление расхода (сумма, категория, комментарий)
- Сводка за сегодня и месяц
- Категории: еда, транспорт, дом, покупки, здоровье, развлечения, связь, другое
- График за 7 дней
- Данные привязаны к Telegram-аккаунту (проверка `initData`)
- SQLite-хранилище

## Быстрый старт

```bash
cd expense-bot
cp .env.example .env
# Укажите BOT_TOKEN от @BotFather
# WEBAPP_URL — публичный HTTPS URL (ngrok / cloudflared / ваш домен)
# Для локального UI без Telegram: ALLOW_DEV_AUTH=1

npm install
npm run build -w web
npm run dev -w bot
```

В другом терминале для hot-reload фронта:

```bash
npm run dev -w web
```

Прод-режим (бот + API + статика из `web/dist`):

```bash
npm run build
ALLOW_DEV_AUTH=0 npm start
```

## Настройка бота в @BotFather

1. `/newbot` — создайте бота, скопируйте токен в `.env` → `BOT_TOKEN`
2. `/setmenubutton` или Bot Settings → Menu Button → Configure menu button  
   URL = ваш `WEBAPP_URL` (должен быть HTTPS)
3. `/setdomain` — домен Mini App (без `https://`)
4. Откройте бота → `/start` → кнопка **Открыть Кошелёк**

Локально для HTTPS можно использовать:

```bash
npx cloudflared tunnel --url http://localhost:3000
# или
ngrok http 3000
```

Подставьте выданный URL в `WEBAPP_URL` и в Menu Button бота.

## API

| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/api/health` | healthcheck |
| GET | `/api/me` | профиль + категории |
| GET | `/api/expenses` | список расходов |
| POST | `/api/expenses` | `{ amount, category, note? }` |
| DELETE | `/api/expenses/:id` | удалить |
| GET | `/api/stats` | сегодня / месяц / категории / 7 дней |

Заголовок: `X-Telegram-Init-Data: <initData из WebApp>`.

## Структура

```
expense-bot/
├── bot/          # Grammy-бот + Express API + SQLite
├── web/          # Vite + React Mini App
├── data/         # expenses.db (создаётся автоматически)
└── .env.example
```

## Дизайн

Бренд **Кошелёк**, шрифты Fraunces + Manrope, бирюзовая атмосфера с мягкими градиентами и лёгкими анимациями — интерфейс заточен под экран Telegram.
