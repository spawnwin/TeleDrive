# EYE XI

Браузерный футбольный менеджер в духе классического 11x11 — кабинет, команда, игроки, матчи, тактика, кубки — с современной подачей.

## Стек

- Статический клиент (HTML/CSS/JS)
- Node HTTP API + Prisma/SQLite
- Онлайн-кубки и товарищеские матчи

## Локально

```bash
cd server
npm install
npx prisma generate
npx prisma db push
npm start
```

Открыть http://localhost:9140/

Админ по умолчанию: `admin` / `eyeadmin`
