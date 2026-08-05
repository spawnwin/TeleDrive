# Златник — Telegram Mini App для учёта расходов

Бот учёта расходов в стиле **Liquid Glass** (тёмная тема по умолчанию, переключение).  
Название — от **златника**, золотой монеты Древней Руси.

## Возможности

- Mini App в Telegram
- Тёмная / светлая тема
- Расходы: добавление и удаление
- Категории: добавление, редактирование, удаление
- Сводка за день / месяц / 7 дней

## Быстрый старт

```bash
cd expense-bot
cp .env.example .env
npm install
npm run build -w web
npm run start -w bot
```

Локально без Telegram: `ALLOW_DEV_AUTH=1`.

Публично: `./scripts/run-public.sh`  
Бот: [@Caura_bot](https://t.me/Caura_bot)
