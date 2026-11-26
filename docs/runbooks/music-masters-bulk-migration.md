# Массовая миграция music-masters в Timeweb S3

Статус: **инструменты подготовлены**, production-запуск **только после письменного
согласования**. Потоковые файлы (`asset_role = stream`) остаются в Supabase.

Этапы разделены намеренно:

| Этап | Назначение | Глобальный флаг |
|------|------------|-----------------|
| **copy** | Shadow copy + SHA-256, `storage_provider` не меняется | `AUDIOLAD_MUSIC_STORAGE_BULK=1` |
| **cutover** | Переключение `storage_provider` на `timeweb_s3` | `AUDIOLAD_MUSIC_STORAGE_BULK=1` **и** `AUDIOLAD_MUSIC_STORAGE_CUTOVER=1` |
| **release-local** | Удаление дубликата в Supabase Storage после cutover | + `AUDIOLAD_MUSIC_STORAGE_RELEASE_LOCAL=1` |

Новые загрузки в S3 — **отдельно** через `MUSIC_MASTERS_UPLOAD_PROVIDER=timeweb_s3`
(см. `music-masters-timeweb-s3-pilot.md`). Bulk-скрипт это **не** включает.

## Предпосылки

- Пилот copy/cutover/rollback успешен.
- Миграция `20271126130000_music_storage_source_released.sql` применена (restamp; SQL неизменён).
- `TIMEWEB_S3_*` в `shared/.env.production`.
- Резервная копия БД.
- Диск: при **≥ 88%** copy-пакеты **паузятся** (настраивается), при **≥ 90%** — стоп-фактор.

## Команды (production, из `current`)

### Прогресс без изменений

```bash
cd /var/www/audiolad-deploy/current
npm run music-storage:bulk -- --stage copy --progress-only
npm run music-storage:report
```

### Dry-run пакета (copy)

```bash
npm run music-storage:bulk -- --stage copy --batch-size 25 --concurrency 1
```

Утверждённые стартовые параметры: **`--batch-size 25`**, **`--concurrency 1`**
(значения по умолчанию в CLI).

## Окружение на production

Запуск **только** из `cd /var/www/audiolad-deploy/current` (симлинк
`.env.local` → `shared/.env.production`). CLI вызывает `loadEnvConfig` из
`@next/env` до обращения к Supabase/S3 (`scripts/load-production-env.mts`).

## Параллельные процессы

На execute действует **файловый exclusive lock** (по умолчанию
`/tmp/audiolad-music-storage-bulk.lock`, override:
`AUDIOLAD_MUSIC_STORAGE_BULK_LOCK`). Второй процесс получит
`bulk_migration_already_running`. При аварийном завершении lock снимается;
если PID в lock-файле уже не жив, lock переинициализируется.

`SIGINT`/`SIGTERM` — освобождают lock; незавершённая копия остаётся в статусе
`copying` и станет повторно eligible через **15 минут** (или
`AUDIOLAD_MUSIC_STORAGE_COPYING_STALE_MS`).

## Ёмкость бакета S3

Перед copy (dry-run и execute) оценивается `ledgerBytes + batchBytes` против
`TIMEWEB_S3_MUSIC_MASTERS_QUOTA_BYTES` (default **100 GiB**). При превышении —
`paused`, `s3_quota_exceeded`.

## release-local и восстановление

`release-local` выполняет **полную** повторную загрузку локального и S3
объекта и сверку SHA-256 **непосредственно перед** удалением Supabase-копии.

После `release-local` canonical provider остаётся `timeweb_s3`. Восстановить
локальную копию (для rollback и аварийного доступа) без cutover:

```bash
npm run music-storage:pilot -- --mode rehydrate-local --asset-id <uuid> --execute
# + AUDIOLAD_MUSIC_STORAGE_PILOT=1
```

Эта операция скачивает из S3, загружает в Supabase Storage по тому же пути,
проверяет SHA-256 и сбрасывает `source_released_at` в ledger.

### Выполнить пакет copy

```bash
AUDIOLAD_MUSIC_STORAGE_BULK=1 \
npm run music-storage:bulk -- \
  --stage copy \
  --batch-size 25 \
  --concurrency 1 \
  --execute
```

Повторный запуск **продолжает** с необработанных: `verified` пропускается,
`failed` — с backoff по `attempt_count`, зависший `copying` > 1 ч — повтор.

Продолжение после явной точки:

```bash
npm run music-storage:bulk -- --stage copy --after-asset-id <uuid> --execute ...
```

### Cutover (после 100% verified копий или поэтапно)

Dry-run:

```bash
npm run music-storage:bulk -- --stage cutover --batch-size 10
```

Execute (двойной предохранитель):

```bash
AUDIOLAD_MUSIC_STORAGE_BULK=1 \
AUDIOLAD_MUSIC_STORAGE_CUTOVER=1 \
npm run music-storage:bulk -- \
  --stage cutover \
  --batch-size 10 \
  --concurrency 1 \
  --execute
```

После каждого рабочего окна проверить Студию: preview, скачивание **WAV-мастера**,
транскод, паспорт, Shazam, **создание видео** (ffmpeg читает master).

### Release local Supabase (только после стабилизации cutover)

Dry-run:

```bash
npm run music-storage:bulk -- --stage release-local --batch-size 10
```

Execute:

```bash
AUDIOLAD_MUSIC_STORAGE_BULK=1 \
AUDIOLAD_MUSIC_STORAGE_RELEASE_LOCAL=1 \
npm run music-storage:bulk -- \
  --stage release-local \
  --batch-size 10 \
  --execute
```

Удаляется **только** объект `supabase_file` по тому же `storage_path`;
строка asset остаётся на `timeweb_s3`. `music_storage_copies.source_released_at`
фиксирует факт.

## Ограничения нагрузки

Скрипт перед пакетом:

- читает `df` и load average;
- **пауза** при used ≥ `diskPausePercent` (по умолчанию 88%) или мало свободных GiB;
- **критическая** пауза при ≥ 90%;
- для copy проверяет место под 2× крупнейший файл в пакете + 512 MiB буфер.

Параметры:

```bash
--disk-pause-percent 87 --min-free-gb 20
```

## Статусы `music_storage_copies`

| Статус | Поведение bulk copy | cutover | release-local |
|--------|---------------------|---------|---------------|
| (нет строки) | копировать | — | — |
| verified | пропуск | допустим cutover | — |
| failed | retry с backoff | — | — |
| copying | ждать или retry после 1 ч | — | — |
| cutover | пропуск | уже на S3 | допустим release |
| rolled_back | reconcile → verified если S3 совпадает | после verified | — |

## Новые загрузки на S3 (не bulk)

После успешной волны cutover и чеклиста совместимости:

1. Временно задать `MUSIC_MASTERS_UPLOAD_PROVIDER=timeweb_s3` в env.
2. `pm2 reload` web + `audiolad-music-transcode-worker` + `audiolad-music-analyzer-worker`.
3. Загрузить WAV/OGG из Студии, проверить CORS PUT, finalize, transcode, скачивание.
4. При ошибке — убрать переменную и reload.

## Мониторинг

- `npm run music-storage:report` — `bulkMigration` с процентами copy/cutover.
- `music_storage_daily_metrics` — ошибки S3.
- `audiolad-disk-health.timer`.

## Стоп-факторы

- нет одобрения на этап;
- рост 5xx S3;
- диск ≥ 90%;
- расхождение SHA-256;
- массовые ошибки транскода/Студии после cutover-пакета.