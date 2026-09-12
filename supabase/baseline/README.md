# АудиоЛад — baseline DDL

## Назначение

Каталог `supabase/baseline/` содержит **исходную точку схемы** для развёртывания **новой пустой** базы данных, совместимой с текущим приложением АудиоЛад.

Baseline отражает **фактическое production-состояние** на момент экспорта (2026-07-12), а не целевую будущую архитектуру.

## ⚠️ Критическое предупреждение

```
BASELINE FOR EMPTY DATABASES ONLY.
DO NOT APPLY TO THE EXISTING PRODUCTION DATABASE.
```

- Production-база (`postgres` на self-hosted Supabase) **уже содержит** все объекты baseline.
- Повторное применение к production вызовет ошибки (`relation already exists`, конфликты политик и триггеров).
- Baseline **не заменяет** существующие файлы в `supabase/migrations/`.
- Обычные изменения схемы после baseline оформляются **отдельными инкрементальными миграциями**.

## Файлы и порядок применения

| # | Файл | Содержание |
|---|------|------------|
| 1 | `0001_core_schema.sql` | Таблицы `authors`, `practices`, `profiles`, `purchases`, `user_practices`, `starter_practices`; ключи, индексы, комментарии |
| 2 | `0002_functions_and_triggers.sql` | `validate_starter_practice`, `grant_active_starter_practices`, `handle_new_user`, триггер `on_auth_user_created` |
| 3 | `0003_rls_and_policies.sql` | ENABLE RLS, политики, GRANT/REVOKE |
| 4 | `0004_storage.sql` | Bucket `practice-audio` и SELECT-политика на `storage.objects` |
| 5 | `0005_required_seed.sql` | Минимальный seed: 1 автор, 5 практик, 3 starter entries |

### Предварительные требования окружения

Baseline предполагает **полноценный Supabase PostgreSQL**, а не «голый» PostgreSQL:

- схема `auth` с таблицей `auth.users` (для FK `profiles`, `user_practices` и триггера регистрации);
- схема `storage` с таблицами `storage.buckets`, `storage.objects` (для `0004_storage.sql`);
- роли `anon`, `authenticated`, `service_role`;
- функция `auth.uid()` (JWT claims).

## Применение на новой пустой базе

```bash
# Пример: отдельная тестовая БД (НЕ production postgres)
createdb audiolad_baseline_test

# Скопировать Supabase prerequisite-схемы (auth, storage) без данных
pg_dump --schema-only -n auth -n storage -n extensions -d <source> \
  | psql -d audiolad_baseline_test

# Применить baseline по порядку
psql -d audiolad_baseline_test -f supabase/baseline/0001_core_schema.sql
psql -d audiolad_baseline_test -f supabase/baseline/0002_functions_and_triggers.sql
psql -d audiolad_baseline_test -f supabase/baseline/0003_rls_and_policies.sql
psql -d audiolad_baseline_test -f supabase/baseline/0004_storage.sql
psql -d audiolad_baseline_test -f supabase/baseline/0005_required_seed.sql
```

## Связь с `supabase/migrations/`

| Миграция | Статус относительно baseline |
|----------|------------------------------|
| `20260710115506_create_user_library.sql` | **Полностью включена** в baseline (`user_practices`, `starter_practices`, функции grant/validate) |
| `20260710122053_configure_starter_practices.sql` | **Заменена** seed-файлом `0005_required_seed.sql` |
| `20260710123015_backfill_starter_practices.sql` | **Не применять** на новой базе (data backfill для существующих пользователей) |
| `20260710123518_require_zero_price_for_starter_grants.sql` | **Включена** в baseline (`grant_active_starter_practices` с `price = 0`) |
| `20260710125301_grant_starter_practices_on_signup.sql` | **Включена** в baseline (`handle_new_user`, триггер) |
| `20260711071529_create_private_practice_audio_bucket.sql` | **Включена** в baseline (`0004_storage.sql`) |

На новой базе после baseline **не запускать** миграции, объекты которых уже созданы, без отдельного плана совместимости.

### Disposable CI replay

`.github/workflows/database-migrations-compile-isolated.yml` is a separate,
path-scoped compile check. It uses the official disposable
`supabase/postgres` image on the GitHub runner only; it has no production
database URL, credentials, or persistent storage.

The service is initialized with the image's upstream default `postgres`
database and `supabase_admin` role; the local-only driver then creates
`audiolad_migration_compile_isolated` after the service is healthy. The check
first installs the documented Supabase prerequisites (`auth.users`,
`storage.buckets`, `storage.objects`, roles, and `auth.uid()`), then applies
`0001`–`0005`. It registers these six baseline-equivalent versions in
`supabase_migrations.schema_migrations` without executing them:

- `20260710115506_create_user_library.sql`
- `20260710122053_configure_starter_practices.sql`
- `20260710123015_backfill_starter_practices.sql`
- `20260710123518_require_zero_price_for_starter_grants.sql`
- `20260710125301_grant_starter_practices_on_signup.sql`
- `20260711071529_create_private_practice_audio_bucket.sql`

All remaining migrations are executed lexically through the target version;
the driver obtains that ordered pending set through
`database-migrations-plan.mjs` and fails if it encounters any unplanned
history state. Before `20260714180000_unified_audio_product_foundation.sql`,
the driver installs one documented legacy-data fixture: its own post-check
requires `first-audio-course` to have the exact legacy `audio_url`, while the
earlier seed creates that row with a null URL and a `990` price. Its
post-check requires that same row to have a `99` price. The fixture provides
both historical preconditions; the migration itself is still executed. This
exception list and fixture are limited to the baseline compatibility map
above: no migration SQL is silently skipped.

Before `20260721103000_personal_materials_optional_last_name.sql`, the driver
also asserts that its real ten-argument draft-update function exists and its
mistaken eleven-argument COMMENT identity does not. It creates only that
eleven-argument no-op overload so the historical `COMMENT ON FUNCTION` can
compile; the migration continues to define and validate the real function.

## Известные архитектурные особенности (не исправляются baseline)

- `purchases.user_id` **без FK** на `auth.users` — как в production.
- `authors` / `practices` имеют широкие GRANT, но RLS ограничивает фактический доступ.
- `starter_practices` без client-политик — доступ только через service role / SECURITY DEFINER.
- Seed фиксирует UUID практик и автора для воспроизводимости; аудиофайл в Storage **не** включён.

## Документация валидации

Результаты проверки baseline на пустой тестовой базе: `DATABASE_BASELINE_VALIDATION.md` (корень проекта).
