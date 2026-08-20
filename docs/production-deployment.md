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

Hashed `/_next/static/*` files are also copied into:

```text
/var/www/audiolad-deploy/shared/next-static/
```

Nginx serves that overlay first so Safari/PWA clients with a previous HTML document still get 200 for old CSS/JS hashes after cutover. Overlay files older than 14 days are pruned on deploy.

## Команда деплоя

Запускайте **deploy-код целевого SHA**, а не скрипты из mutable checkout
`/var/www/audiolad-clean` и не symlink `/var/www/audiolad-deploy/current`.
`canonical_fetch_main` делает только `git fetch` и **не** обновляет HEAD
worktree — поэтому controlling checkout систематически отстаёт от
`origin/main`. Dirty/staged файлы не блокируют deploy (только warning):
release по-прежнему собирается через `git archive`.

Не используйте `git reset --hard` для этого checkout. Не запускайте
`/var/www/audiolad-deploy/current/deploy/scripts/deploy.sh` — CLI
readiness через symlink `/current` не должен быть путём деплоя.

Безопасная Timeweb-команда (только git objects, HEAD не меняется):

```bash
sudo env GIT_WORKDIR=/var/www/audiolad-clean bash -c '
  set -euo pipefail
  git -C "$GIT_WORKDIR" fetch origin main
  git -C "$GIT_WORKDIR" show "$1:deploy/scripts/run-from-target-sha.sh" | bash -s -- "$1"
' bash <commit-sha>
```

Это извлекает `deploy/scripts` целевого SHA в
`/var/www/audiolad-deploy/shared/deploy-scripts/<full-sha>/` и exec-ит
тот `deploy.sh`. Policy gates, flock `/run/audiolad-deploy.lock`,
ancestry и zero-downtime cutover остаются внутри `deploy.sh`.

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
