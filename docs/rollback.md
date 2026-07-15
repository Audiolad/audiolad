# Откат production-релиза

## Быстрый откат

```bash
/var/www/audiolad-deploy/scripts/rollback.sh "причина отката"
```

## Что делает rollback

1. Проверяет наличие `previous`.
2. Атомарно переключает `current` на `previous`.
3. Перезагружает PM2 без пересборки.
4. Проверяет `/api/health/build`.
5. Запускает браузерный smoke-тест.
6. Пишет событие в журнал.

## Что rollback не делает

- не пересобирает старую версию;
- не откатывает базу данных;
- не удаляет проблемный релиз;
- не создаёт второй PM2-процесс на том же порту.

## Ручная проверка после отката

```bash
/var/www/audiolad-deploy/scripts/release-info.sh
curl -sS https://audiolad.ru/api/health/build
/var/www/audiolad-deploy/scripts/smoke-test.sh https://audiolad.ru
```

## Диагностика проблемного релиза

Проблемный релиз остаётся в:

```text
/var/www/audiolad-deploy/releases/
```

Смотрите:

```text
/var/www/audiolad-deploy/logs/rollback-*.log
/root/.pm2/logs/audiolad-error.log
```

## ChunkLoadError

Если в логах есть `ChunkLoadError`:

1. убедитесь, что `current` указывает на релиз с существующим `.next/BUILD_ID`;
2. не пересобирайте `.next` в активном `current`;
3. выполните `rollback.sh`, если новый релиз уже переключён;
4. попросите пользователя сделать hard refresh.

## Клиентская React-ошибка

Если HTML приходит нормально, а через 1–3 секунды появляется `This page couldn't load`:

1. откройте DevTools Console;
2. найдите **первую** `pageerror`;
3. не ориентируйтесь только на HTTP 200;
4. запустите `smoke-test.sh`;
5. при подтверждении проблемы выполните `rollback.sh`.

## Возврат вперёд

После исправления кода снова используйте:

```bash
/var/www/audiolad-deploy/scripts/deploy.sh
```

Не переключайте `current` вручную без проверки health и smoke.
