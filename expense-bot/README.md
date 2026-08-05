# Златник — Telegram Mini App для учёта расходов

Бот учёта расходов в стиле **iOS 26 Liquid Glass**. Название — от **златника**, первой золотой монеты Древней Руси (X–XI вв.).

Данные хранятся **на сервере** (SQLite).

## Название

**Златник** — древнерусская золотая монета. Коротко, связано с деньгами, звучит по-старинному.

В BotFather: `@ZlatnikBot` / `@ZlatnikSpendBot`.

Запасные старинные варианты: *Гривна*, *Куна*, *Денга*, *Казна*.

## Возможности

- Кнопка **«Открыть Златник»** → Telegram Mini App
- Liquid Glass UI с золотистым акцентом
- Быстрое добавление расхода
- Сводка за сегодня / месяц, график 7 дней
- Хранение на сервере, привязка к Telegram-аккаунту

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

## Публичный запуск (Telegram)

```bash
cd expense-bot
# В .env: BOT_TOKEN=... от @BotFather
./scripts/run-public.sh
```

Скрипт поднимет HTTPS-туннель Cloudflare и бота. Затем открой бота в Telegram → `/start` → **Открыть Златник**.

Сейчас бот: [@Caura_bot](https://t.me/Caura_bot)

## Хранение данных

Все расходы — в SQLite на сервере (`expense-bot/data/expenses.db`), не в localStorage.
Пользователь определяется по Telegram ID из проверенного `initData`.

## Настройка @BotFather

1. `/newbot` → токен в `.env`
2. Menu Button → URL = `WEBAPP_URL`
3. `/setdomain` → домен без `https://`
4. `/start` → **Открыть Златник**
