# План включения: владелец платформы модерирует собственных артистов (8d9cd0af, P0)

Миграция `supabase/migrations/20270107120000_business_owner_self_moderation.sql`. Она меняет только функции:
- добавляет внутреннюю функцию `business_moderation_owner_self_allowed()`. Клиенты не могут её вызвать (REVOKE для PUBLIC/anon/authenticated/service_role);
- пересоздаёт `moderator_business_verification_action` и `moderator_business_suspend_product`. В каждой изменена только одна проверка self-moderation, остальное тело совпадает с 20270101120000 байт в байт (это проверяет тест).

Таблицы, строки, RLS, гранты, журнал, обязательные причины, `business_onboarding_is_moderator` и запрет согласий в режиме сопровождения (20270105120000) не меняются. Миграция идемпотентна: CI применяет её дважды.

**Кто считается владельцем платформы.** Используется существующая функция `public.is_platform_owner(uid)`: RBAC `platform_user_roles.role_code = 'owner'` или legacy `profiles.role = 'platform_owner'`. Новых ролей нет. В prod на 17.10.2026 (запрос только на чтение) такой пользователь один, `e5d273d0…`. Он же владелец (`author_members.role = 'owner'`) пространств «Джаз Релакс» и «Аурафон».

**Исключение действует только вне режима сопровождения.** Если у владельца есть открытая сессия сопровождения или запрос несёт support proof, модерация своих заявок и продуктов запрещена. Правило то же, что у запрета согласий. Модерация чужих заявок работает как раньше.

## 0. Условия
- Сергей отдельно одобрил merge и применение этой миграции.
- PR зелёный в CI, независимое ревью PASS ровно на мёржимом SHA.
- Миграции 20270101120000–20270105120000 уже применены в prod (проверено только чтением 17.10.2026).

## 1. Бэкап (сразу перед применением)
Хост prod `72.56.232.160`, контейнер `supabase-db`.
```
TS=$(date -u +%Y%m%dT%H%M%SZ)
F=/root/backups/audiolad-postgres-before-8d9cd0af-owner-selfmod-$TS.dump
docker exec supabase-db pg_dump -U postgres -d postgres -Fc > $F
docker exec supabase-db pg_dumpall -U postgres --globals-only > /root/backups/globals-before-8d9cd0af-owner-selfmod-$TS.sql
sha256sum $F > $F.sha256; ls -la $F
docker exec -i supabase-db pg_restore -l < $F | head   # TOC > 5000 записей, есть TABLE DATA
```
Дополнительно сохранить текущие определения обеих функций (для отката есть отдельный скрипт, это ещё одна страховка):
```
docker exec -i supabase-db psql -X -U postgres -d postgres -At -c "SELECT pg_get_functiondef(p.oid) FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.proname IN ('moderator_business_verification_action','moderator_business_suspend_product')" > /root/backups/fn-before-8d9cd0af-owner-selfmod-$TS.sql
```
Ожидаемые md5 определений до применения (prod, 17.10.2026): `moderator_business_verification_action` 58ebd90a…a424, `moderator_business_suspend_product` ce4a8856…e71fe00.

## 2. Применение
Штатный путь: деплой после merge. Пайплайн применяет pending-миграции, ровно одну новую версию, `20270107120000`. Ручной вариант: `docker exec -i supabase-db psql -X -U postgres -d postgres -v ON_ERROR_STOP=1 -1 < supabase/migrations/20270107120000_business_owner_self_moderation.sql` с последующей записью версии в `supabase_migrations.schema_migrations` тем же способом, как это делает deploy-скрипт.

## 3. Проверка после применения (только чтение)
```
BEGIN READ ONLY;
SELECT version FROM supabase_migrations.schema_migrations WHERE version = '20270107120000';
SELECT proname, proacl FROM pg_proc WHERE pronamespace='public'::regnamespace
  AND proname IN ('moderator_business_verification_action','moderator_business_suspend_product','business_moderation_owner_self_allowed');
-- RPC: authenticated=X сохранён; helper: без EXECUTE для authenticated/anon/service_role
SELECT pg_get_functiondef('public.moderator_business_suspend_product(uuid,uuid,text)'::regprocedure) LIKE '%business_moderation_owner_self_allowed%';
ROLLBACK;
```

## 4. Smoke: Сергей модерирует продукт «Джаз Релакс»
Важно: в prod сейчас нет опубликованных документов программы (`business_program_document_versions` пуста). Поэтому никто, включая Сергея, пока не может отправить заявку на проверку, и в очереди заявок пусто. Публикация документов — отдельное решение (юридический контур, PR #890). Эта задача её не включает.

Предлагаются два шага. Оба выполняются только с отдельного OK Сергея.

**4a. Проверка без следов в БД (рекомендуется, сразу после применения).** Всё выполняется в транзакции, которая заканчивается ROLLBACK. Запросы идут от имени Сергея (`auth.uid()` = его id). В базе ничего не остаётся.
```
BEGIN;
SELECT set_config('request.jwt.claim.role','authenticated',true), set_config('request.jwt.claim.sub','e5d273d0-9b4d-4e0e-836a-bdcf0332b9bb',true);
SET LOCAL ROLE authenticated;
-- PASS: свой продукт «Джаз Релакс» — «Вечерний джаз»
SELECT public.moderator_business_suspend_product('25e8ff95-43da-4244-913d-b2aa82ea4046', NULL, 'smoke 8d9cd0af (rollback)');
-- ожидание: возвращается uuid (до миграции: business_self_moderation_forbidden)
ROLLBACK;
```
Затем убедиться, что после ROLLBACK записи нет: `SELECT count(*) FROM business_onboarding_suspensions` = 0.

**4b. Проверка в интерфейсе.** Сергей заходит в `/admin` и открывает вкладку «Бизнес: проверка правообладателей» (`/admin/business-verification`). Ожидается: страница открывается, в очереди написано «Сейчас нет заявок, ожидающих решения», есть форма «Приостановить продукт в АудиоЛад Бизнес» со списком продуктов, включая «Джаз Релакс — …».
- Приостановка через форму создаёт необратимую запись: append-only, механизма снятия нет, продукт больше нельзя будет подключить к Бизнесу. Поэтому в smoke форму **не отправляем**. Достаточно 4a и того, что страница открывается.
- После публикации документов программы полный сценарий такой: Сергей отправляет заявку по треку «Джаз Релакс» → видит её в очереди с меткой «Ваш собственный аккаунт» → «Запросить уточнение» с причиной → исправляет и отправляет снова → «Подтвердить» с привязкой к правообладателю `Петров Сергей Сергеевич (Аурафон)` → в журнале решений запись с пометкой «сам владелец аккаунта».
- Отрицательная проверка (по желанию, на staging или тестовом админе): обычный админ видит свою заявку с пометкой «Решение по ней принимает другой модератор», кнопок нет, и RPC отвечает `business_self_moderation_forbidden`.

## 5. Откат
- Ошибка во время применения: транзакция откатывается целиком.
- Откат после применения (только с OK Сергея): `docs/business/owner-self-moderation-8d9cd0af-rollback.sql` возвращает обе функции к 20270101120000 байт в байт и удаляет helper. Данные не трогаются: журнал и приостановки, записанные за это время, остаются. Это проверено в CI (откат → владелец снова получает `business_self_moderation_forbidden` → повторное применение снова разрешает).
- После отката версия `20270107120000` остаётся в `supabase_migrations.schema_migrations`, поэтому штатный deploy исключение **не** вернёт. Повторное включение (только с OK Сергея): повторить шаг 1 (бэкап) и вручную применить тот же файл миграции одной транзакцией: `docker exec -i supabase-db psql -X -U postgres -d postgres -v ON_ERROR_STOP=1 -1 < supabase/migrations/20270107120000_business_owner_self_moderation.sql`. Миграция идемпотентна, версию повторно не записываем. Затем шаг 3.
- UI-раздел без миграции (или после отката) безопасен: при попытке модерировать своё он покажет ошибку «Модерировать собственную заявку может только владелец платформы…», потому что решает БД.
- Крайний случай: восстановление из бэкапа шага 1.
