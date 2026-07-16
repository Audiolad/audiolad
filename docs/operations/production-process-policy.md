# Production process policy — audiolad.ru

Операционные правила для production-сервера Timeweb (`72.56.232.160`).

## Production-приложение

- **Единственный** рабочий экземпляр Next.js — процесс PM2 `audiolad`.
- Команда: `npm start` → `next start` на порту **3000**.
- Рабочая директория PM2: `/var/www/audiolad-deploy/current`.
- Git-репозиторий для разработки/deploy: `/var/www/audiolad` (не запускать dev-сервер на prod).

## Запрещено на production

| Действие | Почему |
|----------|--------|
| `npm run dev` / `next dev` | Dev-сервер + hot reload, лишняя память и CPU |
| Playwright / Chromium / E2E | Один Chrome ~7 GB RAM; два экземпляра исчерпали 16 GB (инцидент 2026-07-16) |
| Ручной `npm start` на :3000 вне PM2 | Дублирование production-процесса |
| `scripts/*production-smoke.sh` с UI | Запускают Playwright — только локально/CI |
| Параллельный `npm run build` | Высокий расход RAM |

Guards в коде блокируют dev/playwright/start вне PM2. Маркер сервера: `/var/www/audiolad-deploy/PRODUCTION_SERVER`.

## Разрешено на production

| Действие | Когда |
|----------|-------|
| `deploy/scripts/deploy.sh` | Release-based deploy |
| HTTP smoke | `scripts/production-smoke-http.mjs` (без браузера) |
| `scripts/check-server-health.sh` | Ручная или cron-диагностика |
| `npm run build` внутри deploy | Один build на новый release в `releases/` |

## Deploy smoke (после изменений 2026-07-16)

Pipeline `deploy/scripts/smoke-test.sh` вызывает **только HTTP** smoke:

```bash
node scripts/production-smoke-http.mjs
```

Проверяет: `/api/health/build`, `/`, `/catalog`, `/privacy`.

Браузерный `scripts/production-smoke.mjs` — только локально или CI (`AUDIOLAD_ALLOW_PLAYWRIGHT=1` на non-prod).

## Перед deploy

```bash
free -h                    # RAM и swap
bash scripts/check-server-health.sh
pm2 status
```

Не деплоить при RAM > 80% или swap > 50%.

## После deploy

```bash
pm2 status
curl -fsS http://127.0.0.1:3000/api/health/build
bash scripts/check-server-health.sh
ss -tlnp | grep ':3000'    # один listener
```

## Диагностика (безопасные команды)

```bash
# Состояние сервера
bash scripts/check-server-health.sh
uptime && free -h
pm2 describe audiolad

# Процессы (без kill)
ps aux | grep -E 'next|chrome|playwright' | grep -v grep
ss -tlnp | grep ':3000'

# OOM в прошлой сессии
journalctl -b -1 | grep -i 'oom\|Out of memory' | tail -20
```

## При росте RAM

1. `bash scripts/check-server-health.sh` — exit 2 = критично.
2. Найти `chrome-headless`, `next dev`, лишние `next-server`.
3. Завершать **только** процессы с известным PID и не PM2 production.
4. Не запускать Playwright для «проверки».

## Reboot

| Тип | Когда |
|-----|-------|
| **Soft reboot** | Сервисы отвечают, нужен плановый перезапуск; RAM < 70% |
| **Hard reboot** | SSH/Cursor не отвечают, swap thrashing, systemd timeout, сайт недоступен > 5 мин |

Soft reboot **не сработал** при инциденте 2026-07-16 из-за исчерпания памяти (`systemd-logind: Connection timed out`).

## OOM — быстрая проверка

```bash
journalctl --since "today" | grep -iE 'oom-kill|Out of memory|Killed process'
dmesg -T | grep -i oom | tail -10
```

Признаки: `chrome-headless`, `Free swap = 0kB`, `Under memory pressure` в journald.

## Override (только осознанно)

На production-сервере для отладки (не для routine):

```bash
export AUDIOLAD_ALLOW_DEV=1        # разрешить npm run dev
export AUDIOLAD_ALLOW_PLAYWRIGHT=1 # разрешить E2E
export AUDIOLAD_ALLOW_START=1      # разрешить ручной npm start
```

## Playwright browsers

- Кэш: `/root/.cache/ms-playwright` или `PLAYWRIGHT_BROWSERS_PATH`.
- `.playwright-browsers/` в git workdir — в `.gitignore`, **не коммитить** (~646 MB).
- Не удалять кэш без необходимости; на prod Playwright не запускать.

## Рекомендации по инфраструктуре

- RAM **32 GB** или вынос Supabase/E2E на отдельный сервер — снижает риск повторения OOM.
- E2E и feature-smoke — **CI или локальная машина**, не production.
