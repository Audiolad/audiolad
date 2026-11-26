# Автоматическая оркестрация bulk-миграции music-masters

Статус: **готово к однократной настройке на VPS**. Первый массовый execute — только
после письменного согласования владельца. Глобальный `MUSIC_MASTERS_UPLOAD_PROVIDER`
не меняется.

Оркестратор выполняет **одну партию** (по умолчанию 25 masters, concurrency 1)
каждые **5 минут** через systemd timer. Состояние хранится в
`/var/www/audiolad-deploy/shared/music-storage-bulk-orchestrator.json` и
переживает перезагрузку.

Этапы **независимы** (отдельное разрешение и отдельный timer):

| Этап | Timer unit | Env file |
|------|------------|----------|
| copy | `audiolad-music-storage-bulk-copy.timer` | `/etc/audiolad/music-storage-bulk-copy.env` |
| cutover | `audiolad-music-storage-bulk-cutover.timer` | `/etc/audiolad/music-storage-bulk-cutover.env` |
| release-local | `audiolad-music-storage-bulk-release-local.timer` | `/etc/audiolad/music-storage-bulk-release-local.env` |

Базовая логика copy/cutover/release-local — в
`docs/runbooks/music-masters-bulk-migration.md`.

## Защиты (сохранены)

- Host guards (диск, load)
- S3 quota guard на copy
- Exclusive lock bulk execute
- Повтор transient с backoff (в `music_storage_copies`)
- Пропуск `verified` / ожидание backoff для `failed`
- SHA-256 и размер — в `copyPilotAsset` / `cutoverPilotAsset`
- **Deploy safety:** tick пропускается, если занят `/run/audiolad-deploy.lock`

## Однократная установка (VPS)

```bash
# 1. Скрипты (после деплоя с оркестратором)
sudo install -m 0755 /var/www/audiolad-deploy/current/deploy/scripts/audiolad-music-storage-bulk-orchestrator.sh /usr/local/lib/audiolad/
sudo install -m 0755 /var/www/audiolad-deploy/current/deploy/scripts/audiolad-music-storage-bulk-ctl.sh /usr/local/lib/audiolad/

# 2. systemd units
sudo cp /var/www/audiolad-deploy/current/deploy/systemd/audiolad-music-storage-bulk-*.timer /etc/systemd/system/
sudo cp /var/www/audiolad-deploy/current/deploy/systemd/audiolad-music-storage-bulk-*.service /etc/systemd/system/
sudo systemctl daemon-reload

# 3. Env (пример copy — НЕ включать execute-флаги до согласования)
sudo install -d -m 0750 /etc/audiolad
sudo cp /var/www/audiolad-deploy/current/deploy/etc/audiolad/music-storage-bulk-copy.env.example /etc/audiolad/music-storage-bulk-copy.env
sudo chmod 0600 /etc/audiolad/music-storage-bulk-copy.env
# Вручную добавить AUDIOLAD_MUSIC_STORAGE_BULK=1 только после approval.
```

Timers **не включать** до команды `start` (см. ниже).

## Управление (одна команда)

```bash
sudo /usr/local/lib/audiolad/audiolad-music-storage-bulk-ctl.sh status copy
sudo /usr/local/lib/audiolad/audiolad-music-storage-bulk-ctl.sh start copy
sudo /usr/local/lib/audiolad/audiolad-music-storage-bulk-ctl.sh pause copy
sudo /usr/local/lib/audiolad/audiolad-music-storage-bulk-ctl.sh resume copy
sudo /usr/local/lib/audiolad/audiolad-music-storage-bulk-ctl.sh stop copy
```

После **`start copy`** (и только с `AUDIOLAD_MUSIC_STORAGE_BULK=1` в env):

```bash
sudo systemctl enable --now audiolad-music-storage-bulk-copy.timer
```

Проверка timer:

```bash
systemctl status audiolad-music-storage-bulk-copy.timer
journalctl -u audiolad-music-storage-bulk-copy.service -n 30
```

`stop` останавливает автоматизацию; рекомендуется также `systemctl disable --now audiolad-music-storage-bulk-copy.timer`.

## Прогресс и отчёты

```bash
cd /var/www/audiolad-deploy/current
NODE_ENV=production npm run music-storage:report
NODE_ENV=production npm run music-storage:bulk -- --stage copy --progress-only
```

Журнал оркестратора: поле `journal` в state JSON + alert log
`/var/www/audiolad-deploy/shared/music-storage-bulk-alerts.log` при `halted`.

## GitHub Actions (production Environment)

Workflow **Production Deploy** → `workflow_dispatch`:

| confirm | Действие |
|---------|----------|
| `OPS_MUSIC_STORAGE_BULK_STATUS` | JSON status + totals |
| `OPS_MUSIC_STORAGE_BULK_START_COPY` | `start copy` + enable copy timer |
| `OPS_MUSIC_STORAGE_BULK_PAUSE` | pause |
| `OPS_MUSIC_STORAGE_BULK_STOP` | stop + disable timers |

Запускать **только с default branch `main`** (environment protection).

## Deploy во время миграции

- Пока идёт deploy, tick **no-op** (deploy lock).
- После cutover на новый `current` скрипты подхватываются из нового релиза;
  state в `shared/` общий.
- Перед крупным deploy можно `pause`; после — `resume`.

## Cutover / release-local

Повторить установку env для соответствующего этапа, `ctl start <stage>`, включить
**только** нужный timer. Cutover требует `AUDIOLAD_MUSIC_STORAGE_CUTOVER=1`;
release-local — `AUDIOLAD_MUSIC_STORAGE_RELEASE_LOCAL=1`.