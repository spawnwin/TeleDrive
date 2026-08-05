# Аура — Telegram Mini App для учёта расходов

Красивый бот в стиле **iOS 26 Liquid Glass**: открывается как приложение в Telegram, считает траты, хранит всё **на сервере** (SQLite).

## Название

**Аура** — короткое, спокойное, запоминающееся. В BotFather можно взять `@AuraBudgetBot` / `@AuraSpendBot`.

Альтернативы, если имя занято: *Люмен*, *Сфера*, *Ритм*, *Ясно*.

## Возможности

- Кнопка **«Открыть Ауру»** → Telegram Mini App
- Liquid Glass UI: полупрозрачные панели, blur, блики, плавающий dock
- Быстрое добавление расхода
- Сводка за сегодня / месяц, график 7 дней
- Данные на сервере, привязка к Telegram-аккаунту (`initData` HMAC)

## Быстрый старт

```bash
cd expense-bot
cp .env.example .env
# BOT_TOKEN от @BotFather
# WEBAPP_URL — публичный HTTPS URL
npm install
npm run build -w web
npm run start -w bot
```

Локальный UI без Telegram: `ALLOW_DEV_AUTH=1`.

## Хранение данных

Все расходы пишутся в SQLite на сервере (`expense-bot/data/expenses.db`), не в localStorage.
Каждый пользователь идентифицируется по Telegram ID из проверенного `initData`.

## Настройка @BotFather

1. `/newbot` → токен в `.env`
2. Menu Button → URL = `WEBAPP_URL`
3. `/setdomain` → домен без `https://`
4. `/start` → **Открыть Ауру**

HTTPS локально:

```bash
npx cloudflared tunnel --url http://localhost:3000
```
