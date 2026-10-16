# Подключение правообладателя: PR-1 / 8d9cd0af

Миграция `20270101120000_business_rightsholder_onboarding.sql` расширяет схему.
В этой сессии она не применялась к реальной БД. UI и существующие миграции не меняются.

## Модель

- `business_rightsholder_accounts`: PK `owner_user_id` (auth user), общий для всех пространств, где он реальный owner в `author_members`. Editor и support impersonation не подходят. `rightsholder_id` устанавливает только модератор при approve: существующий активный `music_rightsholders` либо новый person/organization.
- `business_rightsholder_verifications`: опубликованный музыкальный продукт и опубликованный трек внутри него, AI-сервис, название и прямая HTTPS-ссылка. Suno: строго `https://suno.com/s/<id>` или `/song/<id>`. Other требует уточнения. Одна незавершённая/подтверждённая/ограниченная/отозванная заявка на owner; после rejected разрешена новая. Restricted/revoked нельзя обойти новой заявкой.
- `business_verification_evidence`: неизменяемые резервирования файлов (generation, paid_period), MIME JPG/PNG/PDF, 1–10 MiB, SHA-256. Для отправки нужны ровно два существующих объекта, по одному каждого вида; проверяются принадлежность, MIME и размер из Storage metadata. Старые файлы сохраняются при дозагрузке.
- `business_program_document_versions`: два обязательных ключа `business_program_terms` и `business_music_rights_declaration`, version, sha256 content_hash, текст/HTTPS URL, published_at, is_current. Одна current-версия на ключ. Публикация и смена current доступны только service_role (плюс владелец БД); опубликованные поля неизменяемы. **Миграция не вставляет ни одной версии.**
- `business_legal_consents`: две отдельные записи на каждую отправку/повторную отправку заявки и на каждый opt-in продукта. Содержат user, owner account, rightsholder на момент согласия (до approve — NULL), ключ/версию/hash документа, точный текст каждой UI-галочки, серверный timestamptz, nullable IP/UA, контекст, продукт, заявку, снимки доказательств и треков. История не перепривязывается после approve. UPDATE/DELETE/TRUNCATE запрещены триггером, клиентский INSERT также запрещён.
- `business_product_optins`: отдельное событие для каждого продукта с двумя consent IDs и полным снимком опубликованных треков (id/title/position/code). Повторный opt-in — новое событие с новыми согласиями, а не перезапись истории.
- `business_rightsholder_moderation_audit`: append-only действия с actor, причиной, предыдущим/новым статусом и rightsholder.
- `business_onboarding_suspensions`: append-only приостановка продукта либо конкретного трека с actor/причиной, без изменения аккаунта. Блокирует новый opt-in затронутого продукта; другие продукты доступны. Применение этих записей в продуктовых API/интерфейсе — следующий PR.

Исторические product/track UUID не имеют каскадных FK к каталогу. Аккаунты, доказательства, согласия и аудит не исчезают при удалении продукта. Серверные `timestamptz` хранят абсолютный момент времени; при выдаче API сериализует UTC.

## RPC и переходы

1. `author_business_verification_draft(product, track, service, other, title, url)` создаёт draft; owner берётся из `auth.uid()`, не из параметра.
2. `author_business_evidence_reserve(verification, kind, mime, bytes, sha256)` возвращает запись и приватный путь `owner/verification/evidence`. Загрузить файл нужно через Storage API в bucket `business-rightsholder-evidence`; overwrite/delete не разрешены.
3. `author_business_verification_submit(verification, evidence_ids, accept_terms, confirm_rights, terms_version, rights_version, ip?, ua?)`: draft/needs_info → submitted. Обе boolean должны явно равняться true, без defaults. Версии должны совпадать с показанными пользователю current-версиями.
4. `moderator_business_verification_action`: submitted → verified (approve), submitted → needs_info (request_info), submitted/needs_info → rejected (reject), verified → restricted (restrict), verified/restricted → revoked (revoke). Любому действию нужна непустая причина. Самомодерация запрещена. Модератор: существующие RBAC owner/admin или legacy profiles platform_owner/platform_admin; staff/editor/support сами по себе права не получают.
5. `author_business_product_optin(product_ids, accept_terms, confirm_rights, terms_version, rights_version, ip?, ua?)`: 1–100 собственных опубликованных музыкальных продуктов, в том числе из разных пространств. Транзакция целиком отклоняется при ошибке любого продукта. Только verified; restrict/revoke блокируют новые opt-in.
6. `moderator_business_suspend_product(product, track_or_null, reason)` фиксирует локальную приостановку; самомодерация запрещена.

Account row lock сериализует submit/модерацию/opt-in. Проверки каталога удерживают SHARE locks на продукте, owner membership и треках. Все SECURITY DEFINER функции имеют фиксированный search_path; внутренние helpers недоступны клиентам. Прямых клиентских INSERT/UPDATE/DELETE политик для новых таблиц нет, есть SELECT RLS owner/moderator. service_role публикует документы, но не получает прямых прав изменения заявок, согласий и аудита.

## Гейты и границы

Без двух current-документов с published_at не в будущем отправка и opt-in возвращают `business_program_documents_not_published`. Юридические тексты и версии публикуются отдельным решением после юриста. Изменение версии во время заполнения требует нового прочтения/согласия (`business_program_document_version_changed`).

Проверка аккаунта **не подтверждает права на каталог**. Opt-in не создаёт `music_rights_grants`, не устанавливает verified и не меняет `resolve_business_track_eligibility` или player manifest. UNKNOWN, отсутствие территории и ограничения профиля страны/RAO/VOIS продолжают проверяться существующим engine независимо от onboarding. Этот PR хранит opt-in/приостановки; подключение их к API/UI находится в PR-2.

Bucket приватный, 10 MiB, JPG/PNG/PDF; RLS только заявителю и модератору. Restrictive policies защищают его и при наличии старых широких permissive policies. service_role/владелец БД — доверенная административная граница Supabase. SHA-256 здесь — обязательный заявленный хеш: Postgres не читает байты из object storage. В PR-2 обработчик загрузки должен вычислять SHA-256 реальных байтов, проверять содержимое/MIME и передавать проверенные метаданные; IP/UA брать из доверенного HTTP-контекста. Подписанные URL и серверные upload endpoints не должны обходить эти ограничения.

## Проверка

`node scripts/business-rightsholder-onboarding-sql-unit.mjs` проверяет контракт без БД.
Для сценариев нужен явно указанный одноразовый контейнер, имя начинается с `audiolad-onboarding-test-`:

```bash
AUDIOLAD_REQUIRE_ONBOARDING_SQL=1 \
AUDIOLAD_ONBOARDING_TEST_CONTAINER=audiolad-onboarding-test-ci \
node scripts/business-rightsholder-onboarding-sql-unit.mjs
```

Runner не ищет supabase-db и не принимает production URL. Создаёт уникальную scratch DB, применяет A4/A5, новую миграцию дважды, проверяет rollback пустой схемы и повторное создание, запускает сценарии, затем удаляет только созданную scratch DB. Business CI поднимает отдельный postgres:16 без портов хоста и обязательно выполняет SQL-сценарии. Общие migration scripts включают контрактный тест.

## Бэкап и откат

Перед deploy на VPS, после проверки официальной истории миграций, оператор создаёт бэкап:

```bash
docker exec supabase-db pg_dump -U postgres -d postgres -Fc > /secure-backups/audiolad-before-20270101120000.dump
```

Проверить успешный exit code, ненулевой файл и читаемость через `pg_restore --list`; хранить защищённо вне контейнера. Обычный deploy применяет forward-only миграцию официальным docker-exec механизмом. Здесь deploy не выполняется.

Откат приложения совместим с расширенной схемой и не откатывает БД автоматически. При проблемах предпочтителен forward-fix. [Отдельный rollback SQL](rightsholder-onboarding-8d9cd0af-rollback.sql) — только для отдельного согласованного действия до запуска программы, после бэкапа. Он отказывается работать при наличии новых данных/файлов, удаляет только объекты этой миграции, без CASCADE и без изменения music_rightsholders/grants/eligibility. Не подключён к deploy и не правит migration history; после применения оператор отдельно согласует дальнейшую forward-миграцию, а не переписывает историю.

Точка продолжения: проверить обязательный PostgreSQL job на PR-1, провести независимое ревью миграции и RLS; затем PR-2 (API/UI и проверка байтов загрузок). До утверждения юристом документы не публиковать.
