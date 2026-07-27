# Развёртывание FUTBOL X

## Быстрая установка

На сервере под root:

```bash
curl -fsSL https://raw.githubusercontent.com/spawnwin/TeleDrive/claude/football-simulator-browser-52jqnc/football-simulator/deploy/install.sh -o /tmp/futbolx-install.sh
sudo bash /tmp/futbolx-install.sh --nginx
```

После установки игра доступна по `http://<адрес-сервера>:8080`.

Посмотреть, что скрипт сделает, ничего не меняя:

```bash
sudo bash /tmp/futbolx-install.sh --nginx --dry-run
```

## Что скрипт создаёт

| Путь | Назначение |
|------|-----------|
| `/opt/futbolx` | клон репозитория |
| `/opt/futbolx/football-simulator/server/data/` | база аккаунтов и сохранений |
| `/etc/systemd/system/futbolx.service` | служба |
| `/etc/nginx/sites-available/futbolx` + симлинк | отдельный `server`-блок на порту 8080 |
| системный пользователь `futbolx` | под ним работает служба |

## Что скрипт НЕ трогает

Ни один существующий файл не редактируется. Установщик только добавляет свои.
Конкретно:

- конфиг nginx по умолчанию и любые другие сайты не открываются на запись —
  добавляется отдельный `server`-блок на своём порту;
- перед `reload` выполняется `nginx -t`, и если проверка не прошла, симлинк
  снимается, а nginx не перезагружается — соседние сайты не пострадают;
- если `/opt/futbolx`, юнит или конфиг nginx уже существуют и созданы не этим
  установщиком, скрипт останавливается с ошибкой вместо перезаписи;
- порт 80 и 443 не занимаются.

Служба работает от непривилегированного пользователя с `ProtectSystem=strict`
и правом записи только в свою папку с базой.

## Параметры

| Флаг | Значение |
|------|----------|
| `--nginx` | добавить проксирование через nginx |
| `--port N` | порт Node-сервера (по умолчанию 8787, слушает только localhost) |
| `--nginx-port N` | внешний порт nginx (по умолчанию 8080) |
| `--branch ИМЯ` | другая ветка репозитория |
| `--dry-run` | показать план без изменений |

## Обновление

```bash
sudo bash /opt/futbolx/football-simulator/deploy/update.sh
```

Подтягивает свежий код ветки и перезапускает службу. База в `server/data`
не трогается.

## Обслуживание

```bash
systemctl status futbolx          # состояние
journalctl -u futbolx -f          # логи
systemctl restart futbolx         # перезапуск
```

## Удаление

```bash
systemctl disable --now futbolx
rm /etc/systemd/system/futbolx.service
rm -f /etc/nginx/sites-enabled/futbolx /etc/nginx/sites-available/futbolx
nginx -t && systemctl reload nginx
systemctl daemon-reload
rm -rf /opt/futbolx
userdel futbolx
```

## Перед выкладыванием в интернет

Сейчас всё работает по HTTP. Пароли уйдут по открытому каналу, поэтому для
публичного доступа нужен HTTPS: заведите домен и поставьте сертификат, например
через `certbot --nginx`, либо закройте сервис Caddy. Также в бэкенде нет
восстановления пароля по почте — учтите это, если пользователей будет больше
пары человек.
