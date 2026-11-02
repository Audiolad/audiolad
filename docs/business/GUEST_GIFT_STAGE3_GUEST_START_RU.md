# Этап 3: гостевой старт Business

Статус: реализация в репозитории, миграции NOT APPLIED. Реальные Auth, БД и production не использовались. Владелец подтвердил объём 02.11.2026 («Да, делай дальше до готовой кнопки»).

## Кнопка и поток

При выключенном `AUDIOLAD_BUSINESS_GUEST_AUTH_ENABLED` исходные ссылки ведут на регистрацию. При включённом флаге и сетевом секрете длиной минимум 32 байта CTA открывает встроенное подтверждение: 7 дней полного доступа, 3 дня grace, затем 799 ₽ в месяц за точку по желанию, без карты и автосписаний. Числа берутся из общих констант. Показаны действующие условия Business и политика ПДн; checkbox изначально выключен. Без явного `accepted: true` сервер отказывает.

Браузер хранит UUID v4 операции в sessionStorage и вызывает POST `/api/business/guest-start`. Сервер проверяет метод, JSON, лимит 4096 байт, Origin и Sec-Fetch-Site. Origin допускает только coffee/business HTTPS; localhost:3000 доступен только вне production. Поток тела ограничен до декодирования. Неизвестные поля игнорируются, идентификатор пользователя из запроса не используется.

Подписанный обычный пользователь получает `/` без создания гостя и без сетевого расхода. Готовый анонимный пользователь получает тот же ответ. При незавершённом старте сохраняется текущий Auth user, повтор не выпускает второй ticket и не создаёт второго пользователя. Для нового старта сервер резервирует сетевую попытку атомарным RPC, выпускает одноразовый ticket этапа 1 и вызывает штатный SSR `signInAnonymously`. Ошибки после Auth сохраняют сессию для повторного bootstrap; ошибки ограничителя закрывают выдачу.

SQL-транзакция требует реальный `auth.users.is_anonymous`, сериализует user/key, создаёт одну организацию, owner membership, точку cafe и default zone. Страна RU и Europe/Moscow совпадают с дефолтами wizard; вызывается `business_ensure_location_rights_context`. Контактных полей нет, название по умолчанию «Моя кофейня». Неподдержанный rights context по-прежнему закрывает права на музыку.

Подарок содержит `email_hash = NULL`, user_id, `business_new_client`, `trial`; начало задаёт БД, длительность приходит из `BUSINESS_GIFT_MS / 1000`. Уникальность user/kind и email/kind сохранена. Конфликт не меняет даты. Готовая операция возвращает прежние IDs и created=false; другой пользователь с тем же ключом получает отказ. После готовности ticket в metadata очищается best effort. В браузер возвращается только `{ok:true, redirect:"/"}`; ticket, токены, user_id и хеши в JSON не выходят. Логи обработчика содержат только постоянные коды.

На coffee-хосте `/` исторически переписывается в `/business-app/guest/coffee`. Для готового анонимного гостя эта страница теперь загружает настоящий `BusinessWorkspace` с подарком. Обычные email-пользователи и прежнее демо сохраняют прежний маршрут. business.audiolad.ru как общий вход не переделывается.

## Доступ и совместимость

`businessAccessPrincipal` разрешает гостя только при флаге и `is_anonymous === true`; для email по-прежнему нужно подтверждение. Гость читает grant только по своему user_id, без email closure, paid lookup, активации подарка и access_grant_events. Общая политика сохраняет режим trial (подарок), player, endsAt, playbackUntil и grace. Workspace API использует тот же principal; `signWorkspaceAudio` менять не потребовалось: он получает уже проверенный actor и сохраняет manifest/eligibility gate.

SQL-аудит всех ссылок на access_grants: определения находятся в `20270120120000`, платёжное использование resolver в `20270205130000`, аналитическая миграция `20260725200000` содержит имя события, а не чтение таблицы. Тело `resolve_access_grant` взято из последнего определения `20270120120000` и дополнено только ранним возвратом по user_id для NULL. `insert_access_grant` вызывает его без изменений. NULL не совпадает с email-хешем и не вставляется в access_grant_identities. Подтверждённая email identity того же user_id продолжает находить старый grant. Платёжные таблицы, старые 30-дневные подарки и оплаченные периоды не менялись.

## Конфигурация

| Имя | По умолчанию | Секрет | Назначение |
| --- | --- | --- | --- |
| AUDIOLAD_BUSINESS_GUEST_AUTH_ENABLED | off, только `1` включает | нет | Единый флаг hook, старта и гостевого чтения |
| AUDIOLAD_BUSINESS_GUEST_START_NETWORK_LIMIT | 3, clamp 1..1000 | нет | Попытки на сетевой ключ |
| AUDIOLAD_BUSINESS_GUEST_START_WINDOW_HOURS | 24, clamp 1..168 | нет | Скользящее окно |
| AUDIOLAD_BUSINESS_GUEST_NETWORK_HASH_SECRET | отсутствует | да | Отдельный HMAC-секрет минимум 32 байта, иначе fail closed |
| AUDIOLAD_BUSINESS_GUEST_TICKET_SECRET | отсутствует | да | Ticket этапа 1, минимум 32 байта |
| AUDIOLAD_AUTH_HOOK_SECRET | отсутствует | да | Подпись before-user-created (существующий verify-standard-webhook) |
| SUPABASE_SERVICE_ROLE_KEY | отсутствует | да | Только серверный доступ к новым таблицам/RPC |
| NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY | существующие | ключ publishable | Штатный SSR клиент |

Сетевой IP берётся только через `trusted-client-ip`, IPv4 сохраняется как адрес, IPv6 нормализуется до /64 перед HMAC с отдельным domain separator. В таблицу идёт только hex64, сырой IP не сохраняется и не логируется. У hits expires_at = now()+48 часов. Истёкшие строки удаляются при следующей резервации этого хеша; глобальная уборка здесь не добавлена. Окно больше 48 часов нельзя считать полностью обеспеченным после удаления истёкших hits: до отдельного согласования срока хранения оператору следует оставлять 24 часа (максимум 48). Это ограничение заданного сочетания конфигурации 168 часов и хранения 48 часов.

## Human Gate: сессия и открытые риски

Гости используют **ту же общую Supabase session cookie, что email-пользователи**, через неизменённый `cookie-domain.ts`. Это сознательное отклонение этапа 3 от архитектурной отдельной `__Host-` HttpOnly host-only cookie. Существующая cookie общая для поддоменов и доступна браузерному SDK; обещать её HttpOnly нельзя. Она устанавливается сразу после Auth, до готовности bootstrap, чтобы повтор продолжал того же пользователя. Изоляция сессии и сроки idle/absolute из архитектуры этим PR не реализованы. Принятие этого риска перед включением остаётся Human Gate Сергея.

Открытый риск price resolver этапа 1 не исправлялся: изменения платежей запрещены объёмом. Anonymous JWT имеет роль authenticated и общую сессию основного сайта. До production требуется закрыть этот риск отдельным согласованным изменением и проверить эффективные RLS/RPC на одноразовой БД. Поле network_hash в ready-операциях также не имеет автоматического удаления через 48 часов: глобальная политика очистки должна быть согласована и реализована до обещания этого срока хранения. Потерянная cookie после создания Auth или одновременные первые запросы из разных вкладок могут оставить orphan user; ключ операции не позволяет второму пользователю получить ещё один подарок по тому же ключу. Очистка orphan users не реализована.

Факт согласия проверяется сервером до создания Auth; ready-операция хранит время запуска, но отдельного версионированного журнала юридических согласий здесь нет. Подтверждение не записывает платёжное принятие оферты и не разрешает рассылки.

## Что не сделано

Привязки MAX/VK/email, слияния, платежи/checkout, напоминания, PWA handoff, очистка orphan anonymous users, глобальная уборка сетевых записей и access_grant_events для гостей относятся к следующим этапам. Поля pending/failed предусмотрены схемой; запись ready создаётся атомарно с заведением, до неё восстановление идёт по текущей Auth-сессии. Атмосфера остаётся в существующем механизме настроек; новый перенос настроек/принятий между аккаунтами не добавлен.

## Проверки и продолжение

Добавлены `test:business-guest-start` и `test:business-guest-principal` в package.json и Business PR validation. Первый покрывает транспорт, согласие, UUID, сессию, лимиты, ошибки, повтор после bootstrap failure, безопасный ответ, конфигурацию и HMAC. Второй использует настоящий peek-reader с query fake: NULL grant, отсутствие nullable email edges, user-only lookup, подарок и grace, прежний запрет неподтверждённой почты. Старые unit fixtures адаптированы к nullable типу без изменения ожиданий.

`business_guest_start_stage3_smoke.sql` подключён к disposable Migrations Real Compile после stage 1. В BEGIN/ROLLBACK проверяются ACL, лимит 3+отказ, другая сеть, domain inserts, NULL gift, идемпотентность/неизменность дат, конфликт ключа, запрет обычному пользователю, email resolver со старым 30-дневным подарком и RLS собственного/чужого домена. Реальные конкуренция транзакций и GoTrue не эмулируются этим smoke.

Проверки оператора (box, nice -n 10): `test:business-guest-start`, `test:business-guest-principal`, `test:business-guest-auth-hook`, `test:business-guest-coffee`, `test:business-guest-atmosphere`, `test:business-guest-shell`, `test:business-venue-licence`, migration plan unit, compile workflow unit, duplicate versions, `tsc --noEmit`, eslint изменённых файлов – зелёные. Snapshot `anonymous-rls-audit` пересоздан штатным скриптом, в diff только два GRANT service_role.

Изолированный CI-стенд (`business-guest-auth-stand.yml`: реальные GoTrue v2.189.0, PostgREST v12.2.12, Postgres 15, без прод-данных) дополнен сценариями этапа 3: гостевой старт через тот же `handleBusinessGuestStart` и те же service-role RPC, одна точка и подарок 7 дней с NULL email_hash, очистка ticket в metadata, повтор без расхода лимита, лимит 3 на сеть + 429 без создания пользователя, другая сеть, настраиваемый лимит, flag off 404 и чужой Origin 403, RLS гостя (только своя организация, RPC и таблицы этапа 3 закрыты, вторая точка запрещена), bootstrap отказывает зарегистрированному пользователю. Cookie-слой Next (SSR) стенд не эмулирует – его проверяет шаг 5 checklist.

## Checklist включения для Сергея

1. Проверить diff и бэкап БД. Закрыть прежний риск price resolver и принять описанное отклонение cookie до production.
2. На изолированной копии применить сначала `20270211120000_business_guest_auth_stage1.sql`, затем `20270212120000_business_guest_start_stage3.sql`; проверить повторное применение и disposable smoke. В рабочей БД применять только вручную после отдельного разрешения и бэкапа.
3. Проверить версию self-hosted GoTrue и работу hook. `GOTRUE_EXTERNAL_ANONYMOUS_USERS_ENABLED=true`, before-user-created уже указывает на `/api/auth/hooks/before-user-created` с проверкой подписи и consume ticket. Включение anonymous без работающего hook недопустимо.
4. Настроить отдельные network/ticket/hook секреты и серверный service role, не публикуя значения. Оставить лимит 3 и окно 24 часа. Сначала проверить выключенный флаг: исходные ссылки регистрации, endpoint 404, hook отклоняет anonymous; обычная регистрация работает.
5. Развернуть проверенный код штатным процессом оператора, затем выставить `AUDIOLAD_BUSINESS_GUEST_AUTH_ENABLED=1` на стенде. Проверить checkbox, один старт, реальные cookies, одну организацию/точку/зону и один gift с DB временем, metadata cleanup, повтор запроса, ошибку bootstrap и восстановление с тем же user_id, исчерпание сетевого лимита и регистрацию как fallback.
6. В браузере coffee проверить `/` с полным workspace и фактическую выдачу разрешённых аудиоссылок, сохранение позиции, границы подарка/grace. Проверить email gift/paid без регрессии, business login без редизайна и RLS гостя против чужих строк. Не обещать autoplay до жеста пользователя.
7. Проверить публичный anonymous endpoint без ticket, replay и flag off на реальном GoTrue стенда. Сохранить обезличенный результат. Production включать только после отдельного решения Сергея.
8. Откат: флаг off возвращает CTA на регистрацию и hook запрещает новое anonymous создание; выключить anonymous sign-ins в GoTrue. Уже выданные строки/сессии не удалять. Не выполнять DROP и не возвращать NOT NULL поверх гостевых grants. Флаг off закрывает гостевые read paths, но не отзывает уже выданные Auth-сессии на основном сайте; это требует отдельного управления сессиями.

## Файлы

Полный список изменённых файлов приводится ниже; значения окружения не читались.

- `.github/workflows/business-pr-validation.yml`
- `.github/workflows/database-migrations-compile-isolated.yml`
- `docs/business/GUEST_GIFT_STAGE3_GUEST_START_RU.md`
- `package.json`
- `scripts/business-guest-principal-unit.mts`
- `scripts/business-guest-shell-unit.tsx`
- `scripts/business-guest-start-unit.mts`
- `scripts/business-venue-licence-access-unit.mts`
- `scripts/database-migrations-compile-isolated.mjs`
- `scripts/database-migrations-plan-unit.mjs`
- `src/app/api/business/guest-start/route.ts`
- `src/app/api/business/workspace/state/route.ts`
- `src/app/business-app/guest/coffee/page.tsx`
- `src/app/business-app/layout.tsx`
- `src/components/business-app/BusinessDomainProvider.tsx`
- `src/components/business-app/BusinessGuestStartCta.tsx`
- `src/components/business-app/BusinessGuestStatus.tsx`
- `src/components/business-app/sound/BusinessSoundStudio.tsx`
- `src/components/business-app/sound/GuestCoffeeGiftCta.tsx`
- `src/components/business-app/workspace/BusinessWorkspace.tsx`
- `src/lib/access-grants/memory-store.ts`
- `src/lib/access-grants/peek-closure.ts`
- `src/lib/access-grants/peek-reader.server.ts`
- `src/lib/access-grants/peek.server.ts`
- `src/lib/access-grants/policy.ts`
- `src/lib/access-grants/principal.server.ts`
- `src/lib/access-grants/principal.ts`
- `src/lib/access-grants/supabase-store.ts`
- `src/lib/business-app/onboarding-preview.server.ts`
- `src/lib/business-app/point-device.server.ts`
- `src/lib/business-app/proxy-policy.ts`
- `src/lib/business-guest/copy.ts`
- `src/lib/business-guest/network-key.ts`
- `src/lib/business-guest/start-config.ts`
- `src/lib/business-guest/start.ts`
- `src/lib/business-workspace/load.server.ts`
- `supabase/migrations/20270212120000_business_guest_start_stage3.sql`
- `supabase/tests/business_guest_start_stage3_smoke.sql`
