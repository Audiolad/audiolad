# Безопасный production-деплой «АудиоЛад»

## Принцип

Production больше **не собирается** внутри активного каталога `current`.

Каждый релиз создаётся в отдельной папке:

```text
/var/www/audiolad-deploy/releases/YYYYMMDD-HHMMSS-<short-commit>/
```

Переключение выполняется только через символические ссылки:

```text
/var/www/audiolad-deploy/current   -> releases/<активный>
/var/www/audiolad-deploy/previous  -> releases/<предыдущий>
```

## Команда деплоя

```bash
/var/www/audiolad-deploy/scripts/deploy.sh
```

Или конкретный commit:

```bash
/var/www/audiolad-deploy/scripts/deploy.sh <commit-ish>
```

## Что делает deploy.sh

1. Проверяет диск и доступность Git.
2. Создаёт новый релиз из commit.
3. Подключает `shared/.env.production`.
4. Выполняет `npm ci`, `npm run lint`, `npm run build`.
5. Запускает кандидата на порту `3001`.
6. Проверяет `/api/health/build`.
7. Запускает браузерные smoke-тесты.
8. Атомарно переключает `current` и `previous`.
9. Перезагружает PM2.
10. Проверяет production и наблюдает 2 минуты.
11. При ошибке вызывает `rollback.sh`.

## Проверка активного релиза

```bash
/var/www/audiolad-deploy/scripts/release-info.sh
```

## Логи

```text
/var/www/audiolad-deploy/logs/
```

## Smoke-аккаунт

Задайте переменные окружения **только на сервере**, не в Git:

```text
AUDIOLAD_SMOKE_EMAIL
AUDIOLAD_SMOKE_PASSWORD
```

Для ручного smoke-теста:

```bash
export AUDIOLAD_SMOKE_EMAIL='...'
export AUDIOLAD_SMOKE_PASSWORD='...'
/var/www/audiolad-deploy/scripts/smoke-test.sh https://audiolad.ru
```

## Уведомления о неуспешном деплое

Опционально:

```text
DEPLOY_ALERT_WEBHOOK_URL
DEPLOY_ALERT_EMAIL
```

Если переменные не заданы, событие пишется в:

```text
/var/www/audiolad-deploy/logs/deploy-alerts.log
```

## Что нельзя делать

- `rm -rf .next` в `current`
- `npm run build` в `current`
- `pm2 restart` без прохождения smoke-теста кандидата
- деплой поверх работающего процесса без отдельной папки релиза

## После обновления

1. `release-info.sh`
2. `curl -sS https://audiolad.ru/api/health/build`
3. Открыть `/` в обычном и приватном окне
4. Проверить персональную главную под аккаунтом
5. Проверить `/catalog` и одну юридическую страницу
