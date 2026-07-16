# SESSION_LOG.md

Лог рабочих сессий проекта «АудиоЛад».

---

## Сессия — 16 июля 2026 (плейлисты PR4 reorder ↑↓ deploy)

**Сделано:**

- Review: temp position → `max(position)+1` + overflow `reorder_conflict`; deadlock → 409.
- Commit PR4: `d4b9860f44a9283d26dcacb77fd5a480e2c841b3`.
- Backup: `postgres-pre-playlists-pr4-20260716-044937.dump`.
- Migration applied: `20260716140000_move_playlist_item.sql`.
- Deploy release `20260716-045024-d4b9860` (previous `20260716-042225-cbd4db1`).
- Production SQL/API/UI smoke PASS; fixtures cleanup OK.
- Push не выполнялся.
- Post-deploy docs: этот коммит.

**Следующий шаг:** `/p/[slug]` (публичная страница). Не DnD / Play All без отдельного задания.

---

## Сессия — 16 июля 2026 (плейлисты PR4 reorder ↑↓ + закрытие PR3.3 docs)

**Этап A (закоммичено, push нет):**

- Post-deploy docs PR3.3: `8301c0304621fb3d46ad1b0d8a74235a7ae80265`
- Production smoke helpers PR3.3: `4f49a8b29c810e08d1dd28d6c4cd818a8fd3f52e`

**Этап B PR4:** см. сессию deploy выше (`d4b9860`).

---

## Сессия — 16 июля 2026 (плейлисты PR3.3 covers deploy)

**Сделано:**

- Post-deploy docs PR3.2: `d79c96b`.
- Commit PR3.3: `2ae47d6`; anon EXECUTE fix: `cbd4db1`.
- Backup: `postgres-pre-playlists-pr3-3-20260716-042158.dump`.
- Migrations applied: `20260716120000_playlist_covers.sql`, `20260716121000_playlist_cover_path_cas.sql`.
- Private bucket `playlist-covers` создан; browser Storage policies отсутствуют.
- Deploy release `20260716-042225-cbd4db1` (previous `20260716-035511-fafe6a5`).
- Production SQL/API/UI smoke PASS; тестовые данные/objects очищены.
- Push не выполнялся.

**Следующий шаг:** reorder кнопками ↑↓.

---

## Сессия — 16 июля 2026 (плейлисты PR3.3 covers — commit pending deploy)

**Сделано (до deploy):**

- Security review: mosaic RPC → SECURITY DEFINER; CAS `replace_playlist_cover_path`; убран browser Storage SELECT; path validation; sharp limits.
- Migrations: `20260716120000_playlist_covers.sql`, `20260716121000_playlist_cover_path_cas.sql`.
- Test smokes PASS на `audiolad_playlists_pr3_test` + `playlist-covers-test`.

**Следующий шаг после commit:** backup → production migration/bucket → deploy → smoke.

---

## Сессия — 16 июля 2026 (плейлисты PR3.2 production deploy)

**Сделано:**

- Commit PR3.2: `fafe6a56ca5e17038777d37ef3447ddd42ecbde7`.
- Backup: `postgres-pre-playlists-pr3-2-20260716-035511.dump`.
- Deploy release `20260716-035511-fafe6a5` (previous `20260715-204408-24616e7`).
- Migration не требовалась.
- Production API/UI smoke PASS; тестовые данные очищены.
- Push не выполнялся.

**Следующий шаг:** PR3.3 — custom и automatic covers.

---

## Сессия — 16 июля 2026 (плейлисты PR3.2 detail + закрытие PR3.1 docs)

**Сделано:**

- Этап A: docs `11eb5c0`, production SQL smoke `1daa7d2`.
- PR3.2 в рабочей копии (без commit/push/deploy): `/playlists/[id]`, delete item API, кликабельные карточки списка.
- Production не менялся.

**Следующий шаг:** review → commit PR3.2 → deploy → затем reorder.

---

## Сессия — 15 июля 2026 (плейлисты PR3.1 review → deploy)

**Сделано:**

- Точечное ревью RPC: remove из public после drift; `updated_at` через `clock_timestamp()`; preflight gates/limits до mutate.
- Commit PR3.1: `24616e7e2ec5fb85211fce9a6f5dc9a413d2c09c`.
- Backup: `postgres-pre-playlists-pr3-20260715-204130.dump`.
- Migration RPC применена к production; SQL smoke PASS.
- Deploy release `20260715-204408-24616e7` (previous `20260715-200910-c470e23`).
- HTTP/API/UI smoke PASS; тестовые пользователи удалены.
- Push не выполнялся.

**Следующий шаг:** commit post-deploy docs → страница `/playlists/[id]`.

---

## Сессия — 15 июля 2026 (плейлисты PR3.1 + закрытие PR2 docs)

**Сделано:**

- Этап A: docs commit `c508080` (`docs: record playlists PR2 production deploy`); smoke helper commit `10171f3` (`test: add playlists production CRUD smoke helper`).
- PR3.1 в рабочей копии (без commit/push/deploy/prod migrate):
  - migration `20260715280000_playlist_membership_rpc.sql` (`set_practice_playlist_membership`);
  - `GET/PUT /api/playlists/membership`;
  - `AddToPlaylistSheet` + меню `···` в Аудиотеке;
  - SQL smoke на `audiolad_playlists_pr3_test`; validation smoke.
- Production не изменялся (RPC на prod отсутствует).

**Следующий шаг:** review → commit PR3.1 → apply migration на test/prod → deploy → затем `/playlists/[id]`.

---

## Сессия — 15 июля 2026 (плейлисты PR2 deploy)

**Сделано:**

- PR2 закоммичен: `c470e23`.
- Backup БД, миграция PR1 применена к production, SQL smoke PASS.
- Deploy release `20260715-200910-c470e23`; previous `20260715-190051-35f01ac`.
- API CRUD smoke + UI mobile smoke PASS; тестовые пользователи удалены.
- Пуш не выполнялся; PR3 не начат.

**Следующий шаг:** PR3 — добавление материалов из Аудиотеки.

---

## Сессия — 15 июля 2026 (плейлисты PR2)

**Сделано:**

- PR1 закоммичен отдельно (схема + RLS + docs), без push и без production migrate.
- PR2: `/playlists` на реальных данных; API create/rename/delete/visibility; modal создания; `/playlists/new` → redirect; счётчик в профиле.
- Плеер и Аудиотека не менялись; PR2 не закоммичен.

**Следующий шаг:** ревью PR2 → PR3 добавление из Аудиотеки (после применения миграции к prod по подтверждению).

---

## Сессия — 15 июля 2026 (плейлисты PR1)

**Сделано:**

- Диагностический аудит раздела «Плейлисты» (ранее в чате).
- Подготовлена миграция `supabase/migrations/20260715270000_create_playlists.sql` (таблицы, constraints, indexes, RLS private/public).
- Усилены CHECK: `playlists_visibility_slug_consistency_check`, `playlists_visibility_published_at_consistency_check`; smoke-тесты расширены.
- Smoke-тест RLS: `supabase/tests/playlists_pr1_rls_smoke.sql` на изолированной БД.
- Точечно обновлены `docs/DATABASE.md`, `DECISIONS.md`, `PROJECT_STATE.md`, `ARCHITECTURE.md`, `NEXT_STEPS.md`.
- Production БД и плеер не изменялись; коммит не создавался.
- `unlisted` зафиксирован в документации как будущее расширение, в SQL не добавлен.

**Следующий шаг:** ревью миграции → применение к production по отдельному подтверждению → PR2 CRUD UI/API.

---

## Сессия 1 — 10 июля 2026

**Участники:** Сергей (владелец), Орий / ChatGPT (архитектор), Cursor (исполнитель).

**Сделано:**

- Подключён Cursor как технический исполнитель.
- Выполнена безопасная инвентаризация проекта `/var/www/audiolad`.
- Создан и утверждён `AGENTS.md` версии 1.0.
- Создана папка `docs/` с 10 документами проекта.

**Не сделано:**

- Изменения в коде приложения.
- Коммиты.
- Задача с редиректом после регистрации.

**Следующая задача:** редирект после регистрации на `/auth/sign-in?registered=1` с сообщением об успехе.

---

## Сессия 2 — 10 июля 2026

**Участники:** Сергей (владелец), Орий / ChatGPT (архитектор), Cursor (исполнитель).

**Сделано:**

- Реализован редирект после успешной регистрации на `/auth/sign-in?registered=1`.
- Добавлено информационное сообщение на странице входа при параметре `registered=1`.
- `npm run lint` — успешно.
- `npm run build` — успешно (потребовалась обёртка `Suspense` для `useSearchParams`).
- PM2-процесс `audiolad` перезапущен с подтверждения владельца.
- Production проверен вручную: редирект, сообщение, вход и переход на `/profile` работают.
- Создан первый осознанный коммит и выполнен push в `origin/main`.
- Настроен SSH deploy key для GitHub.

**Не сделано:**

- Подключение профиля к Supabase.

**Следующая задача:** связать страницу профиля с сессией и данными Supabase.

---

## Сессия 3 — 10 июля 2026

**Участники:** Сергей (владелец), Орий / ChatGPT (архитектор), Cursor (исполнитель).

**Сделано:**

- Проведён аудит Supabase REST и таблицы `public.profiles`.
- Добавлен Nginx `location /rest/v1/` для проксирования PostgREST через Kong.
- Резервная копия Nginx-конфигурации перенесена в `/etc/nginx/backups/`.
- Подключены `/profile` и `/profile/edit` к Supabase (чтение user + profiles, сохранение `full_name` и metadata).
- `npm run lint` — успешно.
- `npm run build` — успешно.
- PM2-процесс `audiolad` перезапущен с подтверждения владельца.
- Production проверен вручную: реальное имя, email, сохранение имени и фамилии, сообщение об успешном обновлении.

**Не сделано:**

- Коммит изменений профиля и документации.
- Защита приватных маршрутов.

**Следующая задача:** добавить защиту приватных маршрутов.
