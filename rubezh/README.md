# Рубеж: Тыл Победы (Vertical Slice)

Idle-стратегия о тыловом узле снабжения. Android-клиент на Expo + сервер Node.js.

**Лендинг с кнопкой скачать:** http://135.106.173.99/

Художественный продукт: без реальных координат, частей и сцен жестокости.

## Структура

```
rubezh/
  client/   # Expo React Native (портрет)
  server/   # Fastify + SQLite economy
  docs/     # GDD и баланс
```

## Быстрый старт

### Сервер

```bash
cd rubezh/server
npm install
npm start
# http://0.0.0.0:8787
```

Smoke-тест:

```bash
npm run smoke
```

### Клиент

```bash
cd rubezh/client
npm install
EXPO_PUBLIC_API_URL=http://127.0.0.1:8787 npm start
```

На устройстве откройте вкладку **Карта** и укажите `http://<IP-сервера>:8787`.

## Сборка APK

Готовый debug APK (после сборки в этой среде):

`rubezh/dist/rubezh-tyl-pobedy-debug.apk`

### Скрипт

```bash
# нужен Android SDK (ANDROID_HOME)
chmod +x rubezh/scripts/build-apk.sh
./rubezh/scripts/build-apk.sh
```

### Вариант A — EAS

```bash
cd rubezh/client
npx eas-cli build -p android --profile preview
```

### Вариант B — локальный Gradle

```bash
cd rubezh/client
npx expo prebuild --platform android
cd android
./gradlew assembleDebug
# APK: android/app/build/outputs/apk/debug/app-debug.apk
```

На устройстве укажите IP сервера на вкладке **Карта** (`http://IP:8787`). Emulator: `http://10.0.2.2:8787`.

## Игровой цикл

1. Принять заявку → отправить колонну → получить награду
2. Улучшить здания (10 типов, включая связь/инженерию/учёбу)
3. Назначить специалистов и технику
4. Запускать операции с карты (расчёт успеха на сервере)
5. Включать автосбор, забирать достижения, покупать пакеты за знаки
6. Читать сюжетные главы и повышать устойчивость района

## API

| Метод | Путь |
|-------|------|
| POST | `/v1/auth/guest` |
| GET | `/v1/base` |
| POST | `/v1/buildings/:id/upgrade` |
| POST | `/v1/buildings/:id/collect` |
| POST | `/v1/requests/:id/start` |
| POST | `/v1/requests/:id/claim` |
| POST | `/v1/offline/claim` |
| POST | `/v1/specialists/:id/assign` |
| POST | `/v1/quests/:id/claim` |

Заголовок: `X-User-Id`.
