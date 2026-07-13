# Database Baseline Validation

Отчёт о проверке baseline DDL проекта «АудиоЛад».  
Дата валидации: 2026-07-12 (тесты на БД), финализация отчёта: 2026-07-13.

---

## 1. Цель

Подготовить и проверить воспроизводимый baseline DDL, достаточный для развёртывания **новой пустой** базы данных, совместимой с текущим приложением АудиоЛад, без переноса production-данных.

Baseline должен отражать **фактическое текущее состояние** production-схемы, а не целевую будущую архитектуру.

---

## 2. Ограничения безопасности

| Ограничение | Соблюдено |
|-------------|-----------|
| Production-база (`postgres`) не изменялась | ✅ |
| Baseline применялся только к `audiolad_baseline_test` | ✅ |
| Пользовательские данные production не экспортировались в seed | ✅ |
| Существующие миграции в `supabase/migrations/` не изменялись | ✅ |
| Код приложения не изменялся | ✅ |
| PM2-процесс `audiolad` (production) не затрагивался | ✅ |

Baseline **не применялся повторно** при финализации этого отчёта.

---

## 3. Созданные baseline-файлы

Каталог: `supabase/baseline/`

| # | Файл | Назначение |
|---|------|------------|
| 1 | `0001_core_schema.sql` | 6 таблиц `public`, ключи, индексы, комментарии |
| 2 | `0002_functions_and_triggers.sql` | Функции grant/validate/signup, триггер `on_auth_user_created` |
| 3 | `0003_rls_and_policies.sql` | ENABLE RLS, политики, GRANT/REVOKE |
| 4 | `0004_storage.sql` | Bucket `practice-audio` и SELECT-политика |
| 5 | `0005_required_seed.sql` | Минимальный системный seed (автор, практики, starter bundle) |
| 6 | `README.md` | Назначение, порядок применения, предупреждения |

Все 6 файлов созданы и завершены. Пересоздание не выполнялось.

---

## 4. Тестовое окружение

| Параметр | Значение |
|----------|----------|
| Тестовая БД | `audiolad_baseline_test` |
| Контейнер | `supabase-db` (self-hosted Supabase PostgreSQL) |
| Production БД | `postgres` — **не использовалась** для применения baseline |
| Prerequisite-схемы | `auth`, `storage`, `extensions` (schema-only, без данных) |

### Импорт prerequisite-схем

Перед baseline выполнен schema-only экспорт схем `auth`, `storage`, `extensions` из окружения Supabase и импорт в `audiolad_baseline_test`.

**Предупреждение при импорте:** в конце дампа зафиксирована ошибка `function public.handle_new_user() does not exist` — ожидаемо, так как дамп auth-схемы ссылался на триггер до применения `0002_functions_and_triggers.sql`. После применения baseline-файлов по порядку триггер создан успешно.

---

## 5. Применение baseline

Все 5 SQL-файлов применены **успешно**, в порядке:

1. `0001_core_schema.sql` — COMMIT
2. `0002_functions_and_triggers.sql` — COMMIT (триггер `on_auth_user_created` создан)
3. `0003_rls_and_policies.sql` — COMMIT
4. `0004_storage.sql` — COMMIT (bucket `practice-audio` + политика)
5. `0005_required_seed.sql` — COMMIT (1 автор, 5 практик, 3 starter entries)

Повторное применение baseline при финализации отчёта **не выполнялось**.

---

## 6. Сравнение с production

Сравнение выполнено между production (`postgres`) и `audiolad_baseline_test` после применения baseline.

### Сводная статистика (совпадение)

| Объект | Production | Test DB |
|--------|------------|---------|
| Таблицы `public` | 6 | 6 |
| Колонки | 42 | 42 |
| Constraints | 41 | 41 |
| Индексы | 13 | 13 |
| Функции `public` | 3 | 3 |
| Триггеры `public` | 2 | 2 |
| Триггер `on_auth_user_created` | 1 | 1 |
| RLS-политики `public` | 7 | 7 |
| Bucket `practice-audio` | 1 | 1 |

### Детальное сравнение колонок

Построчное сравнение `information_schema.columns` для схемы `public` — **без расхождений**.

### Оговорки

Полное бинарное совпадение **не утверждается** для:

- владельцев объектов (`OWNER`);
- части системных комментариев PostgreSQL;
- environment-specific деталей Storage (дополнительные таблицы/триггеры схемы `storage`, не используемые приложением напрямую);
- production-данных (в тестовой БД только seed из `0005`).

---

## 7. Проверка регистрации и триггеров

Тест выполнен на `audiolad_baseline_test` в транзакции с `ROLLBACK`:

1. `INSERT INTO auth.users (...)` — имитация регистрации.
2. Триггер `on_auth_user_created` → `handle_new_user()`.
3. Результат:
   - `profiles`: **1** запись для нового пользователя;
   - `user_practices`: **3** starter grants (`access_source = 'starter'`).

Production-данные не изменялись. Тестовые записи откатаны `ROLLBACK`.

---

## 8. Проверка seed

| Этап | Результат |
|------|-----------|
| Первое выполнение `0005_required_seed.sql` | 1 автор, 5 практик, 3 starter entries |
| Повторное выполнение | `INSERT 0 0` по всем блокам (`ON CONFLICT DO NOTHING`) |
| Дубли | не созданы (counts остались 1 / 5 / 3) |

---

## 9. Проверка entitlement и библиотеки

Тест на `audiolad_baseline_test` (с `ROLLBACK`):

| Проверка | Результат |
|----------|-----------|
| `grant_active_starter_practices()` вызван дважды для одного `user_id` | 3 строки в `user_practices`, дублей нет |
| Первый/второй вызов функции | `0` вставок (уже выдано триггером или `ON CONFLICT DO NOTHING`) |
| Изоляция библиотеки | пользователь A видит **3** своих записи; пользователь B видит **3** своих записи |

Отдельной таблицы «библиотека» нет — библиотека = активные строки `user_practices`.

---

## 10. Проверка RLS

| Сценарий | Ожидание | Результат |
|----------|----------|-----------|
| `anon` SELECT `practices` | только published | **5** строк |
| `anon` SELECT `profiles` | запрещено | **0** строк |
| `authenticated` INSERT чужой `user_practices` | запрещено | `permission denied for table user_practices` |
| Библиотека по `auth.uid()` | только свои записи | каждый пользователь видит **3** записи |

Политики не ослаблялись для прохождения тестов.

---

## 11. Проверка проекта

Выполнено из `/var/www/audiolad` (2026-07-13):

| Команда | Результат |
|---------|-----------|
| `npm run lint` | ✅ успешно (exit code 0) |
| `npm run build` | ✅ успешно (exit code 0, Next.js 16.2.10) |

`npm run start` после сборки **не запускался**.

---

## 12. Известные ограничения

- Baseline предназначен **только для пустых баз**; повторное применение к существующей production-базе вызовет конфликты объектов.
- `purchases.user_id` в фактической схеме **не имеет FK** на `auth.users`; baseline намеренно отражает это состояние (риск задокументирован, не исправлен).
- Starter bundle зависит от **конкретных slug**: `elixir-molodosti`, `klyuch-k-izobiliyu`, `kod-prityazheniya`.
- Seed фиксирует UUID автора и практик для воспроизводимости; **аудиофайлы Storage не включены**.
- Storage может содержать environment-specific объекты (дополнительные таблицы Supabase Storage, системные триггеры).
- Схемы `auth` и `storage` — **prerequisite-инфраструктура Supabase**; baseline не заменяет полный стек Supabase.
- `validate_starter_practice()` не проверяет `price = 0`, тогда как `grant_active_starter_practices()` проверяет — как в production.

---

## 13. Совместимость существующих миграций

Старые миграции **не изменялись**. Карта совместимости:

| Миграция | Учтена baseline | Можно запускать после baseline | Причина |
|----------|----------------:|-------------------------------:|---------|
| `20260710115506_create_user_library.sql` | ✅ полностью | ❌ | Таблицы, функции, триггер validate уже созданы baseline |
| `20260710122053_configure_starter_practices.sql` | ✅ заменена seed | ❌ | Starter bundle уже в `0005_required_seed.sql`; повторный INSERT упадёт на occupied sort_order |
| `20260710123015_backfill_starter_practices.sql` | ❌ | ❌ | Data backfill для существующих пользователей; на новой базе без пользователей неприменима |
| `20260710123518_require_zero_price_for_starter_grants.sql` | ✅ (grant func) | ⚠️ частично | `CREATE OR REPLACE` функции безопасен, но избыточен |
| `20260710125301_grant_starter_practices_on_signup.sql` | ✅ полностью | ⚠️ частично | `REPLACE handle_new_user` безопасен; pre-checks на существующий триггер избыточны |
| `20260711071529_create_private_practice_audio_bucket.sql` | ✅ (`0004_storage.sql`) | ❌ | Bucket и политика уже созданы; миграция упадёт на `already exists` |

---

## 14. Итог

### Можно ли теперь восстановить совместимую базу из Git?

**частично**

**Что стало возможным:**

- Baseline-файлы в `supabase/baseline/` воспроизводят схему `public`, функции, триггеры, RLS, storage bucket и минимальный seed.
- На изолированной тестовой БД с prerequisite-схемами Supabase схема **структурно совпадает** с production по проверенным метрикам.

**Что всё ещё требуется отдельно:**

- Развёрнутый стек Supabase (схемы `auth`, `storage`, роли `anon`/`authenticated`/`service_role`, `auth.uid()`).
- Импорт prerequisite-схем **до** baseline (не входит в baseline-файлы).
- Существующие миграции `supabase/migrations/` **не запускать повторно** на базе после baseline без карты совместимости.
- Аудиофайлы в Storage, production-пользователи и история покупок **не восстанавливаются** из Git.

Полный ответ «да» возможен только после review baseline, коммита и проверки в полностью изолированном staging с чистым Supabase-окружением.

---

## 15. Следующие безопасные шаги

Рекомендации (без выполнения в рамках этой задачи):

1. **Review baseline** — архитектор/владелец проверяют `supabase/baseline/*` и этот отчёт.
2. **Отдельный чистый коммит** — только baseline + validation doc (не смешивать с посторонними изменениями).
3. **Staging в изолированном окружении** — полный прогон: чистый Supabase → prerequisites → baseline → smoke-тесты приложения.
4. **Запрет применения baseline к production** — зафиксировать в runbook; production уже содержит все объекты.
5. **Будущие изменения** — только инкрементальными миграциями в `supabase/migrations/`, не правкой baseline задним числом.

---

*Связанные документы: `DATABASE_SCHEMA.md`, `supabase/baseline/README.md`.*
