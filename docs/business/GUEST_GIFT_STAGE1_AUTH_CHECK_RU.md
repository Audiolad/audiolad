# Этап 1: anonymous Auth, hook и RLS

Дата: 02.11.2026. Задача `253821e0`, PR 1. Основание – утверждённая архитектура `GUEST_GIFT_7_DAYS_ARCHITECTURE_RU.md`, разделы 2, 3, 8, 9, 11 и 13.

Результат – изолированный код допуска, unit-тесты и проект миграции. Это **не разрешение включать гостевой старт**: тесты здесь не исполнены, совместимость живого Auth и полная изоляция гостя от основного сайта ещё не доказаны. Сеть, production и файлы окружения не использовались. В начале рабочее дерево было чистым.

## Проверенный контракт hook

HTTP-обработчик выделен в `src/lib/auth/hooks/before-user-created.ts` с явными зависимостями для тестов. Route остаётся точкой подключения существующего валидатора email, проверки Standard Webhooks и новой server-only обёртки.

`AUDIOLAD_BUSINESS_GUEST_AUTH_ENABLED` включается только точным значением `1`. При отсутствии флага или любом другом значении исполняется прежняя email-ветка: прежняя проверка провайдера, нормализация email, валидатор и сообщения. Новая проверка и БД не вызываются. Существующий `AUDIOLAD_AUTH_HOOK_SECRET` по-прежнему обязателен для всего hook.

При включённом флаге новый путь обрабатывает только `user.is_anonymous === true`, без email и телефона, с отсутствующим или anonymous-провайдером. Это поля **подписанного Auth webhook**, не пользовательский JSON на публичном маршруте приложения. Если установленный Auth передаёт другой формат, старт должен завершаться отказом; расширять условия на основании клиентских metadata нельзя.

Билет передаётся в `user.user_metadata.business_guest_ticket`. Это транспорт bearer capability, а не доверие к metadata: сами по себе `is_guest`, назначение или nonce в metadata прав не дают. Все отказы нового пути одинаковы: `Invalid signup request.`. Секреты, билет и причины проверки не журналируются. Ошибка БД закрывает допуск.

## Билет и одноразовость

`ticket.ts` содержит функции без env и IO; время, секрет и nonce передаются явно. `ticket.server.ts` помечен `server-only`, генерирует nonce криптографическим генератором и сохраняет только его SHA-256 в БД.

Формат: base64url JSON и HMAC-SHA256 от точного кодированного тела. Поля: версия 1, назначение `business_guest_start`, случайный nonce 32 байта, `iat`, `exp`. TTL – 120 секунд. Проверяются размер, кодировка, версия, назначение, формат nonce, целые timestamps, отсутствие будущего выпуска, точная длительность и истечение. Подпись сравнивается за постоянное время. `AUDIOLAD_BUSINESS_GUEST_TICKET_SECRET` обязателен, минимум 32 байта, без встроенного значения. Он должен отличаться от секрета webhook; значение создаёт оператор и хранит только в окружении сервера.

Подписи и TTL недостаточно: действующий билет можно повторить. Таблица `business_guest_auth_tickets` не имеет клиентских политик и закрыта для PUBLIC, anon и authenticated. Вставка разрешена только service_role. RPC `consume_business_guest_auth_ticket` также доступен только service_role. Он выполняет один `DELETE ... WHERE expires_at > statement_timestamp() RETURNING`, поэтому конкурентные транзакции не смогут успешно погасить одну строку дважды. Повтор доставки hook отклоняется; это намеренная потеря доступности ради защиты от повторного создания. При неудаче Auth после consume нужен новый разрешённый сервером старт, а не восстановление билета.

Публичный Auth endpoint не умеет подписывать и регистрировать билеты. Изменение metadata, копирование назначения и выдуманный nonce не проходят одновременно HMAC и consume. Украденный действующий билет является capability: поэтому будущий серверный старт обязан держать его и Auth credentials на сервере, не возвращать браузеру и не записывать в логи. После создания следует удалить билет из сохранённых Auth metadata серверным способом; эта интеграция ещё не реализована. Не следует считать HMAC шифрованием.

Выдающий модуль сейчас никто не вызывает. Нет нового HTTP endpoint, Server Action, кнопки, вызова signInAnonymously, выдачи подарка или организации. Следующий этап должен поставить перед issuer проверки Origin/CSRF, согласий, частоты, idempotency и текущей сессии. Остатки просроченных непогашенных билетов не открывают доступ; перед выпуском нужен ограниченный регламент их удаления. Автоочистка этим PR не включается.

## Статический аудит RLS/RPC

Статический аудит читает baseline и историю migrations. `scripts/anonymous-rls-audit-unit.mjs` сопоставляет с `scripts/fixtures/anonymous-rls-audit.snapshot.json` только инвентарь объявлений: CREATE POLICY, явные GRANT EXECUTE/ALL ON FUNCTION (включая ALL FUNCTIONS IN SCHEMA), GRANT на таблицы (включая ALL TABLES IN SCHEMA) для anon, authenticated или PUBLIC и ALTER DEFAULT PRIVILEGES. Список исходников и хеши файлов в snapshot больше не входят. Исторические объявления сохраняются, включая впоследствии заменённые политики и отозванные гранты.

Тест сигнализирует об изменении извлечённых объявлений этой поверхности прав. Новая миграция без таких объявлений или изменение только тела функции не требует обновления snapshot. Это regex-инвентарь, а не интерпретатор PostgreSQL: он не вычисляет эффективные ACL, перегрузки, RLS OR/AND и транзитивный граф SECURITY DEFINER. Изменения тел функций, REVOKE, ALTER POLICY, включения RLS и динамически построенного SQL отдельно не контролируются. Объявления в строковых литералах могут давать ложные совпадения. Поэтому успешный snapshot не доказывает изоляцию гостя.

После ручного review поверхность фиксируется явно: `ANONYMOUS_RLS_AUDIT_UPDATE=1 node scripts/anonymous-rls-audit-unit.mjs`, изменение fixture включается в diff PR. Автоматически обновлять snapshot в CI нельзя. Fixture пересоздан этой командой после review и проверяется в CI (1271 объявление). Эффективные права после replay требуют отдельных SQL-проверок и живого плана ниже.

В таблицах ниже «широкий» означает отсутствие требования к роли, членству или владению у вызывающего. Публичный SELECT часто является намеренным. Проверка только наличия `auth.uid()` не отличает постоянного пользователя от anonymous authenticated. Проверки владельца/членства в других RPC не следует путать с простым EXECUTE-грантом.

| Область / политики | Доступ анонимного authenticated | Риск / результат |
| --- | --- | --- |
| Основной: `Public can read authors`, `Public can read active topics`, `Public can read author topics`, `Public can read visible author contacts`, `Public can read appreciation settings` | Общее чтение, для contacts/settings действуют условия публикации | Низкий: публичные данные, не авторские права |
| Основной: `Public can read published practices`, `Anyone can select public playlists`, `Anyone can select public playlist items`, `Public can read topics of listed playlists` | Опубликованные/разрешённые записи по действующим фильтрам | Низкий: существующая публичная витрина, не всё аудио |
| Основной: `Public can read listed practice SEO usage items`, `Public can read listed practice SEO FAQ items`, `Public can read verified listed related products`, `Public can read listed practice related listens` | Публичная SEO-связность | Низкий: условия публикации остаются |
| Основной: `practice_price_promotions_public_select`, `Visible listener comments`, `public_content_revision_select`, `platform_promo_read` | Публичные акции, видимые комментарии, ревизия и баннер | Низкий для чтения; RPC персональных акций рассмотрены отдельно |
| Основной: `Public can read published classical composers`, `Public can read published classical works`, `classica_public_works_select` | Опубликованный классический каталог | Низкий: нет права администрирования |
| Storage: `Public can read practice covers`, `Public can read author assets` | Обложки и публичные ресурсы автора | Низкий; private audio имеет отдельную проверку entitlement |
| Админка: `platform_permissions_select_authenticated`, `platform_roles_select_authenticated`, `platform_role_permissions_select_authenticated` | `USING (true)`, любой authenticated читает справочники RBAC | Низкий информационный риск: раскрывает устройство прав, но не выдаёт их. Строки назначения ролей ограничены own/staff |
| Основной: own profile/library/purchases/saves/progress policies | Свои строки доступны и гостю, потому что у него настоящий UID | Средний: гость технически получает обычные возможности собственного аккаунта. Это не изоляция Business от основного сайта |
| Авторский кабинет: author_members, staff/permission и support-proof проверки | Один JWT гостя не создаёт членство автора | Не найден автоматический переход в автора/админа из metadata. `profiles.role` защищён отдельным триггером от клиентской смены |
| Business: organization/location/zone/player policies | Требуется собственное членство/владение; SPA дополнительно проверяет pilot allowlist | Чужие организации не открываются просто из-за authenticated. Получение собственного membership через bootstrap – отдельный риск ниже |
| Business onboarding/storage evidence, Studio project policies | Проверки специализированных helpers, членства или серверного пути | Не считать широкими по одному EXECUTE или имени политики; не заменять эти проверки общим guest-флагом |

Широкие RPC и helpers по существующим явным грантам (сигнатуры и исходные объявления перечислены в snapshot):

| Функции public | Область | Риск для гостя |
| --- | --- | --- |
| `create_business_organization_with_location` | Business | **Обход лимитов старта:** любой UID создаёт организацию, owner membership, Location и Zone. Проект миграции запрещает вызов анониму. Будущему серверному старту нужен отдельный узкий атомарный контракт |
| `claim_free_practice`, `claim_promo_practice`, `remove_library_practice`, `upsert_private_audio_item_progress`, `unlink_analytics_identity`, `record_platform_signup_completed`, `upsert_analytics_session` | Основной | Проверка своего UID и условий объекта, без роли автора. Гость сможет работать со своей библиотекой/прогрессом/аналитикой. Это расширение поверхности относительно Business-only сессии; перед выдачей JWT браузеру нужна отдельная политика доступа |
| `claim_personal_material`, `get_claimed_personal_material`, `list_claimed_personal_materials`, `get_personal_material_progress`, `upsert_personal_material_progress` | Основной | Требуются токен материала либо собственный claim. Не произвольное чтение чужого материала, но guest UID удовлетворяет проверке входа |
| `allocate_unique_author_slug`, `slugify_author_display_name`, `resolve_author_topic_limit`, `resolve_author_project_capacity_package` | Авторский кабинет | Низкий: подсказки/лимиты/преобразования, не выдача авторского membership |
| `author_access_allows_content_mutations`, `author_access_allows_paid_products`, `assert_author_content_mutations_allowed`, `assert_author_paid_products_allowed` | Авторский кабинет | Низкий: предикаты статуса. ASSERT проверяет состояние объекта, сам по себе не доказывает полномочия вызывающего |
| `author_can_bypass_product_moderation`, `author_has_published_free_product_for_commercial_gate`, `author_has_accepted_current_terms`, `practice_has_paid_purchase`, `practice_is_content_locked_after_sale` | Авторский кабинет / основной | Информационный риск: boolean по переданному ID, в том числе о непубличном состоянии. Не выдаёт контент и не меняет роль |
| `has_platform_permission`, `is_platform_admin`, `is_platform_owner`, `is_direction_editor`, `is_any_direction_editor`, `is_playlist_collaborator`, `is_business_organization_member`, `is_business_organization_owner` | Админка / авторы / Business | Информационный риск: предикаты по переданному пользователю/объекту. Положительный ответ о другом пользователе не переносит права на вызывающего |
| `get_public_promo_page`, `get_public_quick_offer`, `resolve_author_slug_redirect`, `resolve_author_partner_code`, `practice_is_publicly_available`, `is_public_listed_practice`, `practice_accepts_listener_comments`, `practice_listener_comment_public_avatar` | Основной / авторы | Низкий: публичные данные или проверка их видимости; не равнозначно доступу к private audio |
| `classify_analytics_bot`, `classify_acquisition_source_class`, `sanitize_checkout_origin_path`, `sanitize_analytics_utm_value`, `normalize_purchase_surface`, `valid_practice_seo_secondary_queries` | Основной | Низкий: вычисления над аргументами, без выдачи прав |
| `is_studio_music_publication`, `has_studio_music_entitlement`, `can_use_music_in_studio`, `can_acquire_studio_music`, `can_acquire_studio_music_by_id`, `music_item_effective_publish_duration_seconds`, `music_item_has_validated_active_delivery` | Авторский кабинет / Studio | Предикаты объекта/entitlement, часть принимает чужой UID. Возможна проверка факта entitlement, но не автоматическое приобретение |
| `business_player_derived_health`, `business_spa_offline_cache_max`, `business_spa_offline_grants_cited`, `business_unified_agreement_active` | Business | Низкий: параметры, состояние договора, вычисления. Сами не выдают организацию или аудио |
| `record_business_player_heartbeat`, `apply_business_playback_usage_heartbeat` (повторный GRANT), `apply_business_point_usage_sample`, point-session RPC | Business | Требуют отдельный device credential/token, не членство пользователя. Анонимный JWT без credential не даёт управление чужим устройством. Point usage проверяет hash токена, отсутствие отзыва, активное устройство и соответствие текущего назначения организации/точке; A3 helper доступен только service_role |
| `report_business_point_now_playing` (20270228120000, сигнатура расширена в 20270229120000) | Business | Как `report_business_point_player`: GRANT EXECUTE для anon, authenticated и service_role. SECURITY DEFINER; нужен 64-символьный токен зала, проверка хеша и `revoked_at IS NULL`. Пишет только последнее положение, длительность, очередь (не больше 20 идентификаторов, без NULL, позиция 0–86400000 мс) и число уникальных треков впереди `queue_ahead_count` (0–100000) в `business_player_now_playing` для своего устройства, организации и зала. Миграция 20270229120000 удаляет пятиаргументную функцию и создаёт одну шестиаргументную с `p_queue_ahead integer DEFAULT 0`, заново выдаёт те же GRANT и делает NOTIFY pgrst. У таблицы включён RLS, у PUBLIC, anon и authenticated отозваны все права. Это не история и не Proof of Play. Анонимный JWT без токена зала писать не может |
| `create_business_subscription_order`, `apply_business_subscription_for_order` (повторный GRANT, 20270226140000) | Business | Checkout только authenticated/service_role, проверка владельца и принятия оферты; сумма 79900 × активные точки и неизменяемый снимок организации. Fulfilment только service_role, проверка успешного платежа, сумма снимка и идемпотентность по order_id; одно продление +30 дней |
| `activate_business_pilot_location` | Business | Только authenticated: PUBLIC и anon отозваны. SECURITY DEFINER проверяет auth.uid() и is_business_organization_owner; блокировка организации сериализует активацию. С 20270227120000 opt-in не нужен: лимит общий для всех организаций (`business_venue_slot_settings`, сейчас 3), слоты только по порядку. Чужая организация недоступна |
| `business_venue_slot_limit` | Business | Низкий: authenticated/service_role, anon и PUBLIC отозваны. Возвращает только число слотов; для authenticated требуется членство в организации (is_business_organization_member). Ничего не пишет |
| `business_venue_slot_limit_internal`, `business_venue_paid_until`, `create_business_subscription_order`, `apply_business_subscription_for_order` (повторный GRANT, 20270227120000) | Business | `…_internal` и `business_venue_paid_until` только service_role. Checkout/fulfilment – прежние права; сумма по-прежнему 79900 × активные точки, без флага пилота |
| `business_spa_program_composition`, `business_spa_program_manifest`, `business_spa_set_program_items`, `business_spa_exclude_program_item` | Business | Не широкие: проверяют `has_business_pilot_access`, включающий membership и allowlist. Включены для исключения ложного вывода по GRANT |
| `rename_business_organization` | Business | Низкий: SECURITY DEFINER, `anon` и PUBLIC отозваны. Вызывающий должен быть владельцем организации (`is_business_organization_owner`), режим поддержки запрещён. Меняет только название своей организации, длина 1–120, без `<>` и управляющих символов. Миграция 20270216120000 не применена. |
| `accept_business_offer_edition`, `business_offer_edition_acceptances_for_caller`, `record_business_offer_edition_acceptance` | Business | Низкий: SECURITY DEFINER, `anon` и PUBLIC отозваны. Принять можно только опубликованную редакцию договора-оферты (версия и хэш из `business_offer_editions`) и только для своего аккаунта владельца (`auth.uid()`, роль `owner`), режим поддержки запрещён. Чтение – только свои строки. Запись от имени гостя (`record_…`, явный `p_user_id`) доступна только `service_role` после серверного старта подарка. |
| `resolve_practice_effective_price`, `resolve_studio_music_acquisition` | Основной / Studio | **Открытый риск:** принимают явный `p_user_id` без проверки равенства вызывающему; price resolver вызывает внутренний bind персональной акции. Это существующая поверхность, доступная и анонимному authenticated. Нельзя считать её чистым read-only helper |

Последняя строка – блокер утверждения «любой anonymous JWT безопасен во всём проекте». Прямой `bind_practice_price_promotion_starts` закрыт REVOKE, но доступ через resolver требует отдельной защиты. Рекомендуется проверять субъект/серверную роль на публичной границе resolver и не доверять переданному UID; отдельно сохранить допустимый публичный расчёт цены. Платежи и расчёт цены по условиям задания не изменялись. Предложение запрета анонимного вызова на уровне БД оставлено SQL-комментарием в новой миграции для отдельного согласования; это **не применённая защита**. До решения риска и живого теста нельзя включать флаг даже после применения остальной миграции.

Аудит не утверждает, что snapshot сам доказывает отсутствие утечек. Реестр исторических грантов шире текущих действующих ACL, а SECURITY DEFINER требует проверки тела и вызываемых функций. Наличие обычных owner/role guards не равно запрету anonymous на собственные операции. В дальнейшей изолированной проверке нужны реальные JWT двух владельцев и гостя.

## Профиль и проект миграции

`public.profiles.email` и `full_name` nullable в baseline; последующие изученные изменения не вводят NOT NULL для них. Актуальный `handle_new_user` задан `20260717151000_email_sync_and_profile.sql`: пустые имена становятся NULL, роль жёстко listener. Его AFTER INSERT почтовый sync возвращает NULL при отсутствии email, поэтому контакт и preferences не создаются. Но `grant_active_starter_practices(NEW.id)` вызывается безусловно и создаёт лишнюю библиотеку для Business-гостя.

`20270211120000_business_guest_auth_stage1.sql` новее последней исходной миграции `20270210170000`. Он содержит закрытую таблицу билетов, consume RPC, helper чтения Auth-owned `is_anonymous`, отказ anonymous в прежнем bootstrap и раннюю ветку триггера профиля. Для anonymous создаётся listener с NULL email/имени без starter grants; прежнее тело обычной регистрации, проверка контракта starter v1 и её выдачи сохранены. `to_jsonb(NEW)` читает настоящее поле Auth, не metadata; это также позволяет компиляцию с исторической минимальной Auth-фикстурой. Отсутствующее поле трактуется как false, поэтому реальное наличие `auth.users.is_anonymous` обязательно проверить на стенде.

Таблица билетов – не таблица гостевых подписок. Gift, существующие сроки, access_grants, договоры и платежи не изменены. Миграция **нигде не применялась**. Её комментарий содержит отдельный нерешённый вопрос price resolver. Общего запрета гостю всех RPC основного сайта пока нет.

SQL smoke подключён к существующему disposable migration compiler и paths его workflow. В BEGIN … ROLLBACK он проверяет отсутствие SELECT/INSERT/UPDATE/DELETE на tickets и EXECUTE на consume у authenticated и anon; однократный consume выполняется под `SET LOCAL ROLE service_role`. Обычный подтверждённый владелец создаётся в Auth, затем под его JWT и ролью authenticated вызывается штатный bootstrap. После RESET ROLE привилегированная проверка подтверждает наличие профиля, организации, owner membership, location и zone.

Под JWT гостя и ролью authenticated проверяются nullable-профиль, отказ в bootstrap и невидимость существующих строк владельца в profiles, business_organizations, business_organization_members, business_locations и business_zones (если таблица существует). UPDATE и DELETE каждой строки должны затронуть ноль строк либо получить insufficient_privilege. Привилегированная проверка также подтверждает отсутствие стартовых практик и почтового контакта гостя. Минимальная Auth-фикстура дополняется `is_anonymous` и `email_confirmed_at` через ADD COLUMN IF NOT EXISTS только внутри smoke-транзакции с ROLLBACK. Это не изменение рабочей Auth-схемы и не моделирование GoTrue. Последовательный consume smoke не проверяет реальную конкурентность; unit использует имитацию атомарного хранилища для двух одновременных доставок.

Миграция допускает повторное применение к уже созданным ею объектам: CREATE TABLE IF NOT EXISTS и CREATE OR REPLACE FUNCTION. Клиентских политик таблицы tickets она не создаёт. Тела `handle_new_user` и `create_business_organization_with_location` в этом исправлении сохранены.

## Проверки и ограничения

Добавлены `test:business-guest-auth-hook` и `test:anonymous-rls-audit`, оба подключены к Business PR validation. Unit-тест использует настоящую проверку подписи webhook и общий обработчик hook с изолированной зависимостью consume. Проверяются флаг, валидный билет, просрочка, будущая дата, другое назначение с корректной HMAC, подделка, отсутствие/короткий секрет, отсутствие билета, неподписанные metadata, replay, конкурентный повтор, отказ БД и прежняя успешная/ошибочная email-ветка. Существующие проверки регистрации не удалялись.

Codex-автор работал без npm/node_modules. Перед коммитом на отдельной машине проверяющего запущены: `test:business-guest-auth-hook`, `test:anonymous-rls-audit`, `database-migrations-plan-unit`, `duplicate-migration-versions-unit`, `migration-audit-unit`, `database-migrations-compile-workflow-unit`, `email-policy-unit`, `sign-up-policy-unit`, `business-domain-core-sql-unit`, `tsc --noEmit` и eslint по изменённым файлам – всё зелёное. Полный replay миграций и SQL smoke выполняет CI (Database Migrations Real Compile) на одноразовом Postgres. Браузерный сценарий не выполнялся, работающий стенд не поднимался.

Исправлено при проверке: в проекте миграции `create_business_organization_with_location` сначала была переписана со старой версии из `20261201120000` и теряла вызов `business_ensure_location_rights_context` и поле `rights_context_id` (регресс миграции `20270122120000`). Теперь тело взято из `20270122120000` без изменений, добавлен только запрет для анонимного пользователя. В `database-migrations-plan-unit` добавлена новая версия `20270211120000` в ожидаемые списки.

После исправлений REQUEST_CHANGES fixture пересоздан командой выше; на машине проверяющего снова прошли `test:anonymous-rls-audit`, `test:business-guest-auth-hook`, `database-migrations-plan-unit` и `tsc --noEmit`. В CI зелёные Audiolad Business Validation и Database Migrations Real Compile (smoke с реальным владельцем применён на одноразовом Postgres). Не проверялись: повторное применение миграции, SQL consume просроченного билета и реальная конкуренция транзакций (конкурентный unit использует имитацию хранилища), браузерный сценарий. Подключений к реальным БД не было.

Не проверены: версия и настройки self-hosted GoTrue/Auth, фактическое включение hook, anonymous sign-ins, точный payload anonymous webhook, его повторные доставки, реальный профиль/ограничения установленной БД, шифрование/refresh Business-сессии, адаптеры внешнего входа VK/MAX. Последние относятся к последующим отдельным работам и не объявлены готовыми этим PR.

## Human Gate и живая проверка

До любых включений человек должен:

1. Разобрать открытый риск price resolver и права гостя на основном сайте. Подготовить отдельное разрешённое изменение, сохранив платежи и обычную регистрацию.
2. Проверить diff миграции и разрешить её применение сначала только в одноразовой изолированной БД. Ничего в production не применять автоматически.
3. Проверить установленную версию Auth и разрешить anonymous sign-ins только на изолированном стенде.
4. Создать отдельный env-секрет билета и разрешить точное значение флага `1` только на стенде; проверить закрытый отказ без секрета и при флаге off.
5. Проверить и при необходимости включить `before-user-created` в Auth-конфиге с отдельным секретом Standard Webhooks. Без работающего hook публичный anonymous endpoint не защищён этим кодом.

План проверки после этих разрешений, без выполнения в этом PR:

1. Запустить CI unit, прежние sign-up/email tests, lint/build и полный disposable migration compile со smoke. Проверить действующие `pg_policies`, ACL/дефолтные privileges и перегрузки RPC после replay, сопоставить с snapshot.
2. Зафиксировать версию образа Auth и обезличенный формат anonymous hook. Обычный email signup проверить с флагом off и on. Не допускать отключения email-политики.
3. Через локальный серверный harness выпустить билет, вызвать настоящий anonymous Auth только сервером. Проверить один UID, anonymous claim, listener-профиль без имени/email, отсутствие стартовых практик и побочных почтовых записей. Не выдавать билет/JWT браузеру.
4. Вызвать публичный Auth endpoint без билета, с неподписанными metadata, подделкой, другим назначением, истёкшим билетом. Все попытки должны отказать без появления Auth-пользователя. При выключенном флаге anonymous также всегда отказывает.
5. Послать два конкурентных создания с одним билетом и повторить доставку webhook. Максимум одно создание успешно. Остановить доступ к ticket storage и проверить отказ; после ошибки выпуска/consume не открывать запасной путь.
6. JWT гостя и двух обычных владельцев проверить прямыми REST/RPC запросами: чужие profile/library/organizations/locations, author_members, RBAC назначения, admin и private audio. Отдельно проверить собственные RPC основного сайта, персональные акции и устранение открытого риска resolver. Никакая проверка только через UI не заменяет прямые запросы.
7. Проверить отсутствие новых организаций через старый bootstrap у anonymous и сохранение обычного bootstrap у постоянного владельца. Убедиться, что отсутствие членства не позволяет читать SPA manifest и менять точку.
8. Снова выключить флаг, проверить отказ новых anonymous и прежний email signup. Сохранить обезличенные результаты без билетов, JWT, секретов и контактных данных. Отдельно согласовать продолжение сессий/refresh и внешний вход; production остаётся за новым Human Gate.

Точка продолжения: review кода и проекта SQL, затем запуск перечисленных CI-проверок в подготовленной среде; до живого Auth сначала закрыть риск resolver и получить разрешения выше.

## Изменённые файлы и diff

Полный список:

- `src/app/api/auth/hooks/before-user-created/route.ts`
- `src/lib/auth/hooks/before-user-created.ts`
- `src/lib/auth/business-guest/ticket.ts`
- `src/lib/auth/business-guest/authorize.ts`
- `src/lib/auth/business-guest/ticket.server.ts`
- `scripts/business-guest-auth-hook-unit.mts`
- `scripts/anonymous-rls-audit-unit.mjs`
- `scripts/database-migrations-plan-unit.mjs`
- `scripts/fixtures/anonymous-rls-audit.snapshot.json`
- `supabase/migrations/20270211120000_business_guest_auth_stage1.sql`
- `supabase/tests/business_guest_auth_stage1_smoke.sql`
- `scripts/database-migrations-compile-isolated.mjs`
- `.github/workflows/database-migrations-compile-isolated.yml`
- `.github/workflows/business-pr-validation.yml`
- `package.json`
- `docs/business/GUEST_GIFT_STAGE1_AUTH_CHECK_RU.md`

Diff проверен, включая новые файлы; `git diff --check` пройден. Коммиты не создавались. Изменений `package-lock.json`, production-конфигов, deploy и окружения нет. Главные остающиеся риски – реальный контракт GoTrue, эффективные RLS/ACL и публичная граница price resolver. Следующий точный шаг указан перед этим списком.
