# Self-hosted Uptime Kuma для «АудиоЛад»

## Важно

- Панель **не должна** быть открыта публично без HTTPS и пароля.
- Контейнер слушает только `127.0.0.1:3003` (порт `3002` на сервере может быть занят orphan-процессом).
- Автоматический rollback **не** привязан к Uptime Kuma.

## Установка

```bash
cd /var/www/audiolad/deploy/monitoring
docker compose config
docker compose up -d
```

Первичная настройка:

1. Откройте `http://127.0.0.1:3003` через SSH tunnel.
2. Создайте локального admin-пользователя.
3. Добавьте мониторы:

| Monitor | Type | URL / Target | Interval | Retries | Expected |
|---------|------|--------------|----------|---------|----------|
| Home | HTTP(s) keyword | `https://audiolad.ru/` | 60s | 2–3 | 200, keyword `Аудио, которое помогает вернуться к себе` |
| Health | HTTP(s) keyword | `https://audiolad.ru/api/health/build` | 60s | 2–3 | 200, keyword `"status":"ok"` |
| Catalog | HTTP(s) keyword | `https://audiolad.ru/catalog` | 60s | 2–3 | 200, keyword `Каталог` |
| SSL | Certificate | `audiolad.ru` | daily | 2–3 | warning 30d, down 14d |
| WWW canonical | HTTP(s) | `https://www.audiolad.ru/monitoring-check` | 60s | 2–3 | 301 → `https://audiolad.ru/monitoring-check` |
| DNS A | DNS | `audiolad.ru` A | daily | 2–3 | `72.56.232.160` |
| DNS AAAA | DNS | `audiolad.ru` AAAA | daily | 2–3 | `2a03:6f00:a::2:d2d1` |

Uptime Kuma не умеет надёжно принудить IPv6 из контейнера. Для IPv6 HTTPS используйте отдельный systemd timer ниже.

## SSH tunnel пример

```bash
ssh -L 3003:127.0.0.1:3003 root@72.56.232.160
```

## IPv6 health-watch (systemd)

Observation-only check каждые 5 минут через `curl -6`:

```bash
sudo install -m 755 /var/www/audiolad/deploy/monitoring/ipv6-health-check.sh \
  /usr/local/bin/audiolad-ipv6-health-check.sh

sudo cp /var/www/audiolad/deploy/monitoring/systemd/audiolad-ipv6-health.service \
  /etc/systemd/system/
sudo cp /var/www/audiolad/deploy/monitoring/systemd/audiolad-ipv6-health.timer \
  /etc/systemd/system/

sudo systemctl daemon-reload
sudo systemctl enable --now audiolad-ipv6-health.timer
```

Логи:

```bash
journalctl -t audiolad-ipv6-health --since today
```

## Уведомления

Настройте Telegram / email / webhook внутри Uptime Kuma.

Для deploy alerts используйте отдельно:

```text
DEPLOY_ALERT_WEBHOOK_URL
DEPLOY_ALERT_EMAIL
```

## Проверка конфликтов

Перед запуском убедитесь, что порт `3003` свободен и контейнер не конфликтует с Supabase Docker.

```bash
sudo ss -ltnp | grep 3003
docker ps
```
