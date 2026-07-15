# Self-hosted Uptime Kuma для «АудиоЛад»

## Важно

- Панель **не должна** быть открыта публично без HTTPS и пароля.
- Контейнер слушает только `127.0.0.1:3002`.
- Автоматический rollback **не** привязан к Uptime Kuma.

## Установка

```bash
cd /var/www/audiolad/deploy/monitoring
docker compose up -d
```

Первичная настройка:

1. Откройте `http://127.0.0.1:3002` через SSH tunnel.
2. Создайте локального admin-пользователя.
3. Добавьте мониторы:

| Monitor | URL | Interval | Keyword |
|---------|-----|----------|---------|
| Home | `https://audiolad.ru/` | 60s | `Аудио, которое помогает вернуться к себе` |
| Health | `https://audiolad.ru/api/health/build` | 60s | `"status":"ok"` |
| Catalog | `https://audiolad.ru/catalog` | 60s | `Каталог` |
| SSL | Certificate monitor for `audiolad.ru` | daily | n/a |

## SSH tunnel пример

```bash
ssh -L 3002:127.0.0.1:3002 root@72.56.232.160
```

## Уведомления

Настройте Telegram / email / webhook внутри Uptime Kuma.

Для deploy alerts используйте отдельно:

```text
DEPLOY_ALERT_WEBHOOK_URL
DEPLOY_ALERT_EMAIL
```

## Проверка конфликтов

Перед запуском убедитесь, что порт `3002` свободен и контейнер не конфликтует с Supabase Docker.

```bash
sudo ss -ltnp | grep 3002
docker ps
```
