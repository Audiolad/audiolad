# DECISIONS.md

Журнал архитектурных и продуктовых решений.

Формат записи: дата, решение, контекст, кто принял.

---

## 2026-09-27 — Music Analyzer Lab v0.1 остаётся вне каталога

**Контекст:** нужна закрытая ручная проверка пакета listening v0.5, без Music Passport и без моделей в Next.js.

**Решение:**

1. Консоль только для ролей `owner` и `admin` (`platform-access`), путь `/music-analyzer`, без ссылки в публичной навигации.
2. Данные лаборатории — отдельные `music_lab_*` таблицы и приватный bucket `music-analyzer-lab`. Каталог, SEO и Бизнес не пишутся.
3. Слепой ключ похожести не входит в git. Публичный пакет импортируется отдельно. Карта A/B загружается один раз серверной командой из локального файла в `music_lab_blind_assignments`. После завершения в результатах видны подписи CLAP и OpenL3, не сырые коды и не пути файлов.
4. Повторный импорт пакета не удаляет человеческие ответы и не требует ключа.

**Принято:** задание на черновой PR. Миграция не применяется к production, пока PR не принят отдельно.

---

## 2026-09-27 — Business Player identity, assignment and technical health

**Контекст:** после A1 нужен reliability-слой Player до Proof of Play и playback attribution.

**Решение:**

1. Player — logical identity, owned by Organization (не device-location, без `zone_id` на Player).
2. Assignment — отдельная сущность; один active assignment на Player; несколько Players на Zone разрешены.
3. Technical health derived from server `last_heartbeat_at` (thresholds в одной функции `business_player_derived_health`).
4. Heartbeat loss ≠ music stopped; Player Health ≠ Playback Health ≠ Business UX Home state.
5. Machine credential: 64-hex opaque from `gen_random_uuid()` entropy; core `sha256` hash only in DB (no pgcrypto); plaintext once on create/rotate.
6. Health projection uses `statement_timestamp()`; heartbeat writes use `clock_timestamp()`.

**Принято:** владелец продукта + архитектор (задание Foundation PR A2).

---

## 2026-09-27 — Business physical-space canonical terminology

**Контекст:** нужен production-domain фундамент «Аудиолада Бизнес» до Player, Proof of Play и billing.

**Решение:**

- Каноническая цепочка: **Organization → Location → Zone**.
- Физические таблицы: `business_organizations`, `business_organization_members`, `business_locations`, `business_zones`.
- Не использовать `business_account` / `venue` как канонические имена в новой модели (отдельная нормализация зарезервированных полей позже).
- Owner только через membership `role = 'owner'`; без `owner_user_id`.
- Employee scope — отдельный слой (не organization-wide member в A1).

**Принято:** владелец продукта + архитектор (задание Foundation PR A1).

---


## 2026-09-13 — Guest Studio: globally free catalog music

**Контекст:** гостевой проект Студии уже изолирован `guest_session_id` и
имеет один trial MP3, но общедоступная Studio-free музыка была доступна
только после создания `auth.users`-entitlement.

**Решение:**

- Гость может прикреплять, загружать после reload, слушать и рендерить
  только published, listed music/release с `platform_reuse_allowed` и
  канонически free Studio-pricing.
- Это не entitlement: ссылка catalog asset хранит
  `catalog_guest_session_id`, полученный только из owning guest project.
  Авторский `catalog_access_user_id` и его `can_use_music_in_studio`
  путь не меняются.
- Каждый playback/hydration/render повторно проверяет session binding и
  `is_globally_free_studio_music`. Paid, unlisted, personal-entitlement
  и listener `user_practices` не открывают этот guest path.
- Каталог и render snapshot не выдают `audio_path`, storage path, signed
  URL либо principal; аудио по-прежнему приходит через same-origin stream
  proxy с Range.

**Принято:** владелец продукта (задание guest free Studio music).

---

## 2026-10-03 — Studio music license foundation (PR1)

**Контекст:** MVP «Музыка для медитаций в Студии» нуждается в постоянном
праве Studio-use отдельно от слушательского `user_practices`. Живая
проверка `music_usage_permission` после покупки отзывала бы доступ при
снятии разрешения / цены / публикации.

**Решение:**

- Новая таблица `studio_music_entitlements` на уровне публикации
  (`practices.id`). Альбом — одна строка на все `audio_items`.
- `music_usage_permission='platform_reuse_allowed'` только для **нового**
  acquire. Уже выданное право не зависит от поздних правок публикации.
- Слушательская покупка ≠ Studio. Studio-покупка ≠ listen / `user_practices`.
- Бесплатная музыка: при первом фактическом acquire создаётся постоянный
  grant `free` без заказа.
- Авторское право: live `author_members` (owner/editor), без обязательной
  owner-строки.
- Studio price (PR1–PR3) = `2 × resolve_practice_effective_price`, снимок в
  `orders`. PR3.1 adds independent `studio_music_pricing_mode`.
- `orders.order_kind='studio_music_license'`. Pending unique scoped by
  `order_kind`. Отдельный RPC, не `create_practice_order`.
- Tochka fulfill идемпотентно пишет entitlement и не пишет `user_practices`.
- Оплаченный Studio license — каноническая продажа музыки (finance /
  commission) без подделки `user_practices`.
- Авто-revoke по refund для listen нет; добавлен такой же минимальный hook
  `revoked_at` для Studio (refund/admin).
- `revoke_studio_music_entitlement_for_order` отзывает **только** строку
  с `order_id = p_order_id`. Поздний revoke заказа A не трогает новую
  покупку B, `grant_source='free'` и live owner/editor.
- UNIQUE `(order_id) WHERE order_id IS NOT NULL` + grant/fulfill: повтор
  fulfill отозванного заказа A не создаёт новый active grant. Новый
  законный заказ B после revoke A — можно.
- Не трогать Studio UI, overlay, attach, full-track playback, FFmpeg worker.

**Принято:** владелец продукта (задание PR1 foundation + blocking revoke/replay fix).

---

## 2026-09-10 — Studio music catalog browse (PR2)

**Контекст:** После foundation нужна витрина «Музыка для медитаций» внутри
уже смонтированной Студии: просмотр, превью-клип и серверная Studio-цена.
Покупка, attach в проект и полное воспроизведение остаются следующими PR.

**Решение:**

- Music-add в `StudioEditorShell`: chooser «С устройства» | «Каталог
  АудиоЛада». Device path не меняется. Overlay — fullscreen внутри shell,
  без смены маршрута и без remount.
- `GET /api/studio/music/catalog?filter=all|mine|free` и
  `GET /api/studio/music/preview`. Не использовать `/api/catalog` и
  `/api/catalog/play`.
- **all/free:** published, `deleted_at` null, music/release,
  `platform_reuse_allowed`, commercially accessible, **только listed**.
  Гость видит Вся/Бесплатная и может слушать разрешённые превью. «Моя»
  скрыта; `mine` требует auth (401).
- **mine:** active `studio_music_entitlements` или live `author_members`.
  Без повторной проверки status/permission/listed. `user_practices` не
  является Studio-владением. Автор видит свою музыку без opt-in.
- Цена только на сервере: `resolve_practice_effective_price(..., checkout)`
  затем `studioLicenseAmountMinor` (×2).
- Превью: `buildPracticePreviewClip`, только MPEG-клип. Authz: публичная
  витрина ИЛИ authenticated `can_use_music_in_studio`.

**Принято:** владелец продукта (задание PR2 Studio catalog browse).

---

## 2026-09-10 — Studio music free acquire + paid checkout (PR3)

**Контекст:** После витрины PR2 пользователь должен получить бесплатную
музыку и купить платную Studio-лицензию, не создавая listen-доступ и не
меняя finance.

**Решение:**

- Free: `POST /api/studio/music/acquire` → `acquire_free_studio_music`.
  Без order / payment / ledger. Идемпотентно. UI сразу показывает
  «Доступно в Студии».
- Paid: thin `POST /api/checkout/studio-music` =
  auth → `create_studio_music_order` → reload pending order →
  `startTochkaCheckoutForPendingOrder`. Canonical `paymentLinkId` = orderId.
  Сумма только с серверного заказа (`2 ×` listener checkout). Client
  `expectedAmountMinor` только для гонки `price_changed`.
- Overlay сохраняет дизайн PR2. CTA: «Получить бесплатно» /
  «Купить для Студии за {studio price}» / loading / «Доступно в Студии» /
  «Ваша музыка». Повторная покупка при entitlement запрещена.
- Возврат Tochka идёт в существующий `/checkout/result` +
  `/api/checkout/status`. Redirect сам по себе не доказательство оплаты.
  Для `studio_music_license` CTA ведёт в Студию, не в Аудиотеку / listen.
- Не писать `user_practices`. Не менять 70/30, finance tables, payout,
  `music_usage_permission`, AuthorProductForm, attach, FFmpeg.

**Принято:** владелец продукта (задание PR3 Studio acquire + checkout).

---

## 2026-09-10 — Independent Studio music pricing + list catalog (PR3.1)

**Контекст:** Нейрокомпозиторам нужна независимая цена права использования
в Студии (B) от цены прослушивания (A). Канонический пример: слушать
бесплатно, Студия 600 ₽. Витрина PR3 с огромными 2-колоночными карточками
не показывает несколько релизов сразу.

**Решение:**

- Режимы `studio_music_pricing_mode`: `free` | `auto_2x_listener` | `fixed`.
  `studio_music_price_minor` только для `fixed`.
- Backfill: текущая бесплатная публикация → Studio `free`; платная →
  `auto_2x_listener`. Существующие цены и entitlements не меняются.
- Один серверный resolver `resolve_studio_music_acquisition` для витрины,
  free acquire, paid order и `price_changed`. UI не решает бесплатность.
- Free acquire гейтится Studio-free, не `practices.is_free`.
- AUTO = 2 × текущий listener checkout effective (акции сначала на
  listener). FIXED игнорирует listener promotions.
- Кабинет: блок «Использование в Студии АудиоЛада» только при
  `platform_reuse_allowed`. Для бесплатного прослушивания AUTO не
  предлагается. Paid→free при AUTO требует явный выбор.
- Фильтр «Бесплатно для Студии» = Studio-free. Desktop — вертикальный
  список строк; mobile — одна колонка компактных карточек.
- Finance 70/30, `platform_absorbs`, ceil-author не меняются.
  `user_practices` не пишется. Entitlements постоянны.

**Принято:** владелец продукта (задание PR3.1 independent pricing + list).

---

## 2026-08-31 — Product Gallery for Music / release

**Контекст:** Phase 1B закрывала витрину для `release` и `post`. Музыкальным
альбомам нужна та же витрина, что у практики/курса/аудиокниги: до 30
дополнительных 1:1 слайдов в кабинете, каталоге и PDP. Отдельные обложки
треков остаются своей функцией и не становятся слайдами автоматически.

**Решение:**

- Расширить `isProductGalleryClass` / `isProductGalleryEligible` на
  `release` (включая legacy `product_kind=music`). `post` / `audio_post`
  по-прежнему не eligible.
- Новая таблица, bucket, API и миграция не нужны: `publication_gallery_slides`
  уже FK на `practices.id` без фильтра класса.
- Кабинет, author gallery API, catalog DTO и публичный PDP используют ту же
  инфраструктуру. Главная обложка релиза остаётся на `practices`.
- Не менять `PRODUCT_KIND.MUSIC`, `publication_class=release`,
  `music_usage_permission`, Studio reuse и track covers.

**Принято:** владелец продукта (задание «витрина для Музыки»).

---

## 2026-08-28 — Analytics heavy RPC protection

**Контекст:** один клиент (~400–500/мин) вызывал `POST /api/analytics/session/link` и `POST /api/analytics/signup/complete` на каждом `onAuthStateChange`, включая `TOKEN_REFRESHED`. `SIGNED_IN` делал link + signup/complete, а signup RPC снова вызывал link. Тяжёлые UPDATE + `pg_advisory_xact_lock` → 55P03 → пул PostgREST (10) → PGRST003 → 504 на несвязанных RPC.

**Решение:**

- Frontend: link/signup только на реальный anonymous → authenticated переход. `TOKEN_REFRESHED` не вызывает RPC. `SIGNED_IN` канонически идёт только в signup/complete. In-flight + completed dedupe на пару session+user.
- Server: process-local rate limit (`checkAnalyticsRateLimit`), in-flight/success cache и circuit breaker **до** RPC. AbortController timeout, без `Promise.race`.
- IP cap: `getTrustedClientIp` = X-Real-IP (`$remote_addr`) иначе правый XFF. Cloudflare не перед origin. Cap keyed by the single connecting client / egress, not a shared proxy edge. JWT `sub` — только non-critical discriminator, не authz.
- SQL: уже принадлежащая пользователю сессия возвращается сразу; advisory lock только если first-touch ещё нет.
- Track retry: ограниченный backoff + jitter; PGRST003/55P03/503/504 не ретраятся в tight loop.

Не менять: personal materials SAVE/activate, upload, nginx, отдельные DB pools, rollback `0bb70eca`.

**Принято:** владелец продукта (задание P0/P1 analytics RPC protection).

---

## 2026-08-25 — Editorial publish stamps listed_at

**Контекст:** `/playlists/catalog` показывает только строки с `listed_at IS NOT NULL`. Публикация редакционного плейлиста писала `visibility` + `slug` + `published_at`, поэтому новый editorial playlist появлялся в старом блоке «Плейлисты АудиоЛада» и не попадал в витрину.

**Решение:**

- При `PATCH /api/playlists/[id]` на переход в `visibility=public`, если `owner_type=platform` и `is_editorial=true`, писать `listed_at = listed_at ?? published_at` (первая постановка в витрину; republish не сдвигает newest).
- User-owned / non-editorial publish `listed_at` не трогает.
- Unpublish не пишет `listed_at`: по-прежнему чистит триггер `playlists_clear_listed_at_when_unlisted`.
- One-shot backfill `20260825166000_editorial_playlist_listed_at_backfill.sql` для уже опубликованных platform editorial с `listed_at IS NULL`. User-owned не бэкфиллить.
- Listing-запросы, DTO и client body не менять: `listed_at` по-прежнему не клиентское поле.

**Принято:** владелец продукта (задание на editorial listed_at).

---

## 2026-08-25 — Каталог плейлистов: отдельный listing-поток

**Контекст:** продуктовый каталог (`/catalog`) построен вокруг универсальной карточки продуктов (`kind`: practice / music / audio_post / program). Нужна витрина плейлистов без превращения плейлиста в новый kind продукта и без поломки личного редактора `/playlists`.

**Решение:**

- Продукты остаются `class: "product"` + `kind`.
- Плейлисты — отдельная сущность `class: "playlist"` и отдельный listing-поток.
- Карточка API: `PlaylistListingItem` (без `user_id`, `owner_type`, `created_by`, `cover_path`, `direction_id`, `playlist_items`, entitlement).
- Существующая таблица `playlists` расширяется только полями витрины: `items_count`, `duration_seconds`, `saves_count`, `listed_at`.
- Сохранения плейлистов — `playlist_saves`, отдельно от `library_saves`. Save ≠ entitlement.
- Маршрут витрины: `/playlists/catalog`. `/playlists` и `/playlists/[id]` не мигрировать.
- Stage 1: контракт + модель + миграция. Без страницы, карточки, фильтров, play-кнопок, SEO.
- Stage 2: `GET /api/playlists/catalog` + серверная `/playlists/catalog` через тот же listing-слой. В выдаче только listed public published. `/playlists/catalog` публичный; личный редактор остаётся private. UI карточки/сетки нет.
- Stage 5B: сохранённые публичные плейлисты — отдельная private библиотека `/playlists/saved` на `playlist_saves`. Не смешивать с `library_saves`, `/my-practices` и product catalog. Новый пункт нижней навигации не создавать.
- `listed_at` не выставляется publish flow. `POST/PATCH /api/playlists` (user и editorial) пишут только `visibility` + `slug` + `published_at`. Триггер `playlists_clear_listed_at_when_unlisted` только обнуляет `listed_at`. Существующие public playlists остаются unlisted. Кто ставит `listed_at` в витрину — отдельный продуктовый выбор, в Stage 1–5B не реализуется.

**Принято:** владелец проекта (задания Stage 1 и Stage 2).

---

## 2026-08-26 — Course Content Foundation, Phase 2A PR1

**Контекст:** у курса уже есть `publication_class=course`, но нет модели
содержимого и слишком широкий listen-доступ: бесплатный опубликованный
курс открывался по `canListen` / `is_free` как практика.

**Решение:**

- Модель `Course → Lesson → LessonBlock`. Section / Module нет.
  Таблицы `course_lessons`, `course_lesson_blocks`, `publication_files`,
  `course_completion_ctas`. Parent только явный `publication_class=course`.
- Доступ к содержимому: `canAccessCourseContent` рядом с
  `resolveProductAccess`. Разрешено только entitlement
  (`user_practices`, включая `free_claim` и `purchase`), author member
  или platform admin (`isPlatformAdmin` / `admin_panel.access`).
  `canListen` из-за `is_free` / `free` / `guest_promo` недостаточно.
  `reason: admin` у `resolveProductAccess` по-прежнему значит
  `access_source=admin`; helper также принимает реального platform admin.
- Listen signed audio / треки / catalog play full session для course
  требуют helper. Free-by-link других классов не меняется. Catalog
  `?preview=1` не обходит курс. Preview-окно витрины для курса — только
  если оно уже задано и это не тело урока.
- RLS без public SELECT и без learner SELECT. Bucket `publication-files`
  private. CTA независим от `promo_*`. `audio_items` не мигрируются.
- Вне scope этого PR: кабинет курса, `/learn`, learner API с payload
  урока/блока/файла, progress, homework, quizzes, drip, certificates.

**Принято:** владелец и архитектор (задание Phase 2A PR1 Course Content
Foundation).

---

## 2026-08-26 — Author Course Builder, Phase 2A PR2

**Контекст:** схема уроков/блоков уже есть, но автор не мог собирать
курс в кабинете. Публикация курса всё ещё требовала плоский
`audio_items` как у практики.

**Решение:**

- Конструктор только при явном `publication_class=course`. Список
  уроков + один открытый редактор урока. Блоки text / audio / file.
- Мутации проверяют цепочку: автор может менять публикацию, класс
  course, `lesson.publication_id`, `block.lesson_id`.
- Аудио блока — существующий `audio_items` + upload pipeline.
  PDF — `publication_files` + private `publication-files`.
- CTA только в `course_completion_ctas`.
- Новое правило публикации только если `published_at` IS NULL:
  ≥1 урок и ≥1 блок. Черновик без уроков можно сохранить.
  Плоское аудио не требуется, если у курса есть любой блок.
- Новый `publication_class=course` не создаёт пустой слот
  `audio_items` («Аудио 1»). Practice / audiobook / release / post
  без изменений. Существующие course `audio_items` не мигрируются
  и не удаляются.
- «Рекомендации перед прослушиванием» и «общая обложка для всех
  треков» скрыты у курса; у практики остаются. Audiobook не меняли.
- Mobile Course Builder: один флаг `mobileEditorOpen` — список XOR
  редактор; desktop по-прежнему list + editor рядом.

**Вне scope:** `/learn`, learner API, progress, Section/Module,
homework, quizzes, drip, certificates. PDP / CatalogCard / offer /
free_claim / purchase не менялись.

**Принято:** владелец и архитектор (задание Phase 2A PR2 Author Course
Builder).

---

## 2026-08-25 — Author Cabinet foundation, Phase 1

**Контекст:** кабинет должен создавать новые классы публикаций, не ломая
старые черновики и витрину Phase 0. Отдельные таблицы Course / Audiobook
ещё не нужны.

**Решение:**

- В `practices` добавляется nullable `publication_class` с CHECK
  `practice|course|audiobook|release|post`. Старые строки не обновляются.
- `product_kind` остаётся legacy shadow для publish RPC и старых форм.
- Create/update API принимают явный `publication_class` и ветку кабинета
  `product|music|post`.
- Мастер создания: Продукт → практика/курс/аудиокнига; Музыка → `release`;
  Аудиопост → `post`.
- Adapter читает `publication_class` раньше `product_kind`. Format не
  определяет course/audiobook. Post без offer.
- Section / Lesson / Chapter / gallery editor не входят в Phase 1.

**Принято:** владелец и архитектор (задание Phase 1 Author Cabinet).

---

## 2026-08-25 — Product Gallery, Phase 1B

**Контекст:** у `CatalogCard` уже есть `cover + gallery[]`, но слайды
некуда было сохранять. PR #74 предлагал универсальную галерею на все
классы и PATCH `{ order }` на коллекции — это откатывает Phase 1
`publication_class` и не подходит.

**Решение:**

- Одна таблица `publication_gallery_slides` (FK `practices.id`), без
  колонки класса и без backfill.
- Eligibility: только `practice` / `course` / `audiobook` через
  `isProductGalleryEligible` рядом с `resolvePublicationClass`.
  `release` / `post` (включая legacy music / audio_post) всегда
  `gallery: []` и 403 на author API.
- Cover остаётся на `practices`, не становится слайдом.
- Author API: GET/POST collection, PATCH `/reorder` батчем
  `{ slides: [{ id, position }] }`, PATCH/DELETE `[slideId]`.
  Коллекционный PATCH `{ order }` не используется.
- Кабинет: секция «Галерея продукта» только у eligible классов,
  native HTML5 drag-and-drop, без второго редактора обложки.

**Принято:** владелец и архитектор (задание Phase 1B Product Gallery).

---

## 2026-08-25 — Catalog Listing Freeze v2, Phase 0

**Контекст:** новый каталог не должен зависеть от legacy-модели
`practices` / `product_kind` / `format` / `program` / `price` / `is_free`.
Нужен READ-контракт и витрина, без SQL-миграций новых сущностей.

**Решение:**

- Frontend нового каталога читает только `CatalogCard` (`class`, `access`
  через `default_offer` / `viewer`, `summary`, `gallery`).
- Legacy adapter временно маппит `practice → practice`, `music → release`,
  `audio_post → post`. Семь аудиосессий остаются `practice`, не course.
- «Подарки» = `default_offer.access=free` + `free_claim`. «Продукты» =
  paid offer. Post не получает offer и может слушаться без grant.
- Цена в DTO только как `amount_minor` + `currency` (RUB, копейки).
- `gallery` — витрина слайдов 1:1 (до 30), не сущность контента.
- Course / Audiobook / Offer / Grant / прогресс / редактор галереи —
  не создаются в Phase 0.

**Принято:** владелец и архитектор (утверждённый Catalog Listing Freeze v2).

---

## 2026-08-23 — MAX Mini App этап 3B: вход существующего аккаунта

**Контекст:** этап 3A дал серверный `POST /link`, но без UI. Нужен вход
уже существующего аккаунта АудиоЛада внутри MAX-оболочки и явная связка.

**Решение:**

- Только существующий аккаунт: `signInWithPassword` на абсолютный apex
  Supabase URL, затем `POST /api/max/session/link` с сырым `initData`.
- Регистрации, каталога, nginx-маршрутов `/auth/v1` на max-хосте нет.
- Cookie `Domain` не меняется; сессия host-only на `max.audiolad.ru`.
- Первый link только после явного успешного пароля в этом потоке.
  Старая cookie + `linked=false` не авто-связывает.
- `linked=true` без сессии — повторный вход, не «новая связка».
- Сессия не выпускается из одного MAX id. Конфликты 409 без auto-relink.

**Принято:** владелец проекта (задание этапа 3B).

---

## 2026-08-22 — MAX Mini App этап 2: touch external_identities

**Контекст:** после серверной HMAC-проверки `initData` нужен устойчивый
внешний идентификатор MAX без создания пользователя АудиоЛада и без входа.

**Решение:**

- Таблица `public.external_identities`; запись только через SECURITY DEFINER
  RPC `touch_external_identity`, исполняемый как `service_role`.
- Этап 2: `provider='max'`, `provider_user_id` = текстовый MAX id,
  `user_id` / `linked_at` не выставляются.
- Повторный touch того же MAX id обновляет только `last_verified_at` и
  `updated_at`.
- API: `{ ok: true, linked }` только после успешного persist; 4xx HMAC без
  записи; 5xx если HMAC ок, а storage недоступен.
- Верификатор остаётся чистым (без Supabase). Не логировать PII.

**Принято:** владелец проекта (задание этапа 2).

---

## 2026-07-30 — Многопроектность кабинета автора

**Контекст:** один аккаунт должен управлять несколькими публичными авторскими брендами (проектами), без параллельной сущности.

**Решение:**

- Проект = существующая строка `authors` + доступ через `author_members` (N:M).
- Лимит owned-проектов на аккаунте: `profiles.author_project_limit_override ?? (author_premium_enabled → 3) ?? 1`.
- Создание только через RPC `create_author_project` с серверной проверкой лимита и advisory lock.
- Выбор текущего проекта: `?author=<slug>` + cookie `audiolad_author_project`.
- В UI термин «Проект»; публично — автор продукта.
- Существующие три проекта Сергея не дублировать; лимит аккаунта = 5 (override).

**Принято:** владелец проекта (единое задание после аудита).

---

## 2026-08-05 — Аудиопост и универсальная внутренняя рекомендация

**Контекст:** нужны короткие evergreen-аудиопубликации для продвижения Школы и других продуктов без отдельной платформы.

**Решение:**

- Добавить `product_kind = audio_post` на `practices` (как music), без отдельной таблицы и без `/post/...`.
- URL MVP: `/practice/{authorSlug}/{productSlug}`; публичная метка «Аудиопост».
- Аудиопост всегда бесплатный; один audio_item (publish readiness + UX, не жёсткий DB count CHECK).
- Универсальные поля `promo_*` на `practices` для ручной рекомендации «следующий шаг»; на MVP UI только у audio_post.
- Коммерческий free-product gate не считает `audio_post`.
- Unlisted (`published` + `is_catalog_listed=false`): noindex, скрыт из каталога/поиска/страницы автора/sitemap; audio_post остаётся listenable по прямой ссылке.

**Принято:** владелец проекта (по результатам диагностики и утверждённого ТЗ).

---

## 2026-07-29 — Музыка как product_kind на practices

**Контекст:** нужен MVP типа контента «Музыка» без параллельной платформы.

**Решение:**

- Переиспользовать `practices` + `audio_items`; отдельную сущность альбома не создавать.
- Добавить `product_kind` (`practice` | `music`) и `music_usage_permission` (`listen_only` | `platform_reuse_allowed`).
- Трек/альбом определять по числу `audio_items`.
- URL `/practice/...` сохранить; SEO-хабы и статьи ограничить `product_kind = practice`.
- `product_kind` неизменяем после первой публикации (`published_at`).

**Принято:** владелец проекта (по результатам технического аудита).

---

## 2026-07-05 — Self-hosted Supabase на Timeweb Cloud

**Контекст:** проекту нужна база данных и аутентификация.

**Решение:** использовать self-hosted Supabase через Docker на сервере Timeweb Cloud. Облачный supabase.com не использовать как рабочую базу.

**Принято:** владелец проекта.

---

## 2026-07-05 — Прокси сессий через proxy.ts

**Контекст:** необходимо обновление сессии Supabase на сервере.

**Решение:** реализовать через `proxy.ts` в корне проекта и `src/lib/supabase/proxy.ts` (механизм Next.js вместо `middleware.ts`).

**Принято:** архитектор.

---

## 2026-07-08 — Маршруты аутентификации /auth/sign-in и /auth/sign-up

**Контекст:** нужны страницы входа и регистрации.

**Решение:** маршруты `/auth/sign-in` и `/auth/sign-up` с клиентскими формами и браузерным Supabase-клиентом.

**Принято:** архитектор. Зафиксировано в коммитах `010f54b`, `1c1400a`.

---

## 2026-07-09 — Каталог практик из базы

**Контекст:** каталог должен показывать реальные практики.

**Решение:** `/catalog` загружает опубликованные записи из таблицы practices через Supabase REST API в server component.

**Принято:** архитектор. Зафиксировано в коммите `944c6d9`.

---

## 2026-07-10 — AGENTS.md как главная инструкция

**Контекст:** нужен единый документ для всех исполнителей (ИИ и разработчиков).

**Решение:** `AGENTS.md` в корне проекта — обязательная точка входа. Версия 1.0 утверждена.

**Принято:** владелец проекта и архитектор.

---

## 2026-07-10 — Структура документации в docs/

**Контекст:** проекту нужна постоянная документация.

**Решение:** создать папку `docs/` с 10 документами по назначению (см. `AGENTS.md`, раздел 10).

**Принято:** архитектор.

---

## 2026-07-10 — MAX как канал привлечения и точка входа

**Контекст:** «АудиоЛад» планирует привлекать пользователей через экосистему MAX — рекламу, бота, бесплатные аудиоматериалы в сообщениях и мини-приложение.

**Решение:** MAX рассматривается не только как рекламный канал, но и как потенциальная точка входа и среда использования «АудиоЛада» через бот и мини-приложение. В перспективе — автоматическое создание или вход в аккаунт через подтверждённые данные пользователя MAX.

**Статус:** зафиксировано как направление. Реализация не начата. API, таблицы и схема авторизации не определены.

**Принято:** владелец проекта и архитектор.

---

## 2026-07-15 — Пользовательские плейлисты: practice_id + private/public

**Контекст:** следующий продуктовый этап после Аудиотеки и плеера — пользовательские подборки.

**Решение:**

- В плейлист добавляется целый аудиопродукт через `practice_id` (не отдельные `audio_item_id`).
- Плейлист не предоставляет entitlement и не заменяет `user_practices` / `resolveProductAccess`.
- Сразу закладываются режимы `private` и `public`.
- Приватный плейлист видит только владелец; чужой UUID в будущем отдаёт нейтральный 404.
- Публичный плейлист (первый вариант) может содержать только бесплатные опубликованные catalog-listed продукты, доступные любому посетителю без личного entitlement.
- Публичность плейлиста не открывает платные/закрытые материалы.
- Схема и RLS — PR1 (`20260715270000_create_playlists.sql`); UI/API, публикация и Play All между продуктами — следующие PR.
- Согласованность полей: `private` всегда с `slug IS NULL` и `published_at IS NULL`; `public` обязан иметь непустой уникальный slug; у `public` `published_at` может оставаться NULL до серверной публикации.
- Содержимое публичного плейлиста схемой не проверяется; publish gate — API/RPC.
- Режим `unlisted` зарезервирован как возможное будущее расширение (доступ по ссылке без каталога); в текущей схеме и MVP не реализован.
- Мутации с проверками доступа — через API routes/RPC.
- Маршруты: `/playlists/[id]` (владелец), `/p/[slug]` (публичный просмотр).

**Принято:** владелец проекта и архитектор (по результатам диагностического аудита).

---

## 2026-07-10 — Российские способы регистрации и авторизации

**Статус:** требует юридической и технической проверки перед реализацией.

**Контекст:** сервис ориентирован в том числе на пользователей из России. Необходимо определить допустимые способы регистрации и входа с учётом законодательства и технических возможностей.

**Решение:**

- Сервис ориентирован в том числе на пользователей из России.
- Иностранные OAuth-провайдеры не должны становиться единственным или основным способом регистрации.
- Рассматриваются MAX, российский номер телефона, Яндекс ID, VK ID и другие допустимые российские способы идентификации.
- Обычная регистрация по email требует отдельной проверки с точки зрения законодательства и выбранного почтового провайдера.
- Нельзя считать простой запрет нескольких доменов полноценным юридическим решением.
- Окончательное решение принимается после изучения актуального законодательства и консультации профильного специалиста.

**Реализация:** интеграция пока не реализована. Конкретный набор способов регистрации не утверждён.

**Принято:** владелец проекта и архитектор (предварительное направление).

## ADR: Single playback ledger + usage_kind (A3)

Date: 2026-09-27

Context: B2B online playback evidence must attribute Track → Player → Zone → Location → Organization without corrupting consumer listening analytics. Full Proof of Play / offline / Rights / Money stay later layers.

Decision:

1. Keep one durable ledger: `playback_usage_facts` (no second B2B ledger).
2. Discriminator `usage_kind` ∈ {consumer, business}; never infer from `user_id`.
3. Canonical snapshot columns: organization_id / location_id / zone_id / player_id (no destructive FK).
4. Legacy business_account_id / venue_id remain unused reserved NULL.
5. A3 = online Playback Evidence only; royalty_eligible_ms and billing_period_start stay NULL.
6. Reuse `apply_playback_usage_heartbeat` media-time acceptance via B2B wrapper auth + context upsert.
7. Existing consumer admin/author readers filter `usage_kind = 'consumer'`.
8. Time: `occurred_at` is canonical playback event time; online A3 sets it from server sample-processing time. `created_at` is ledger write time. Do not treat occurred_at as a forever-universal synonym of server wall-clock time. Do not accept raw client timestamps in A3. Future offline-sync may write historical `occurred_at` only from a server-validated reconstructed Player timeline. No fake offline=false flag in A3.
9. Reassignment boundary: when live attribution (org/location/zone/player) changes on an existing B2B context, the first sample under the new assignment is a media-time baseline (`accepted_ms = 0`); historical facts keep the old snapshot; `sample_seq` stays monotonic; a new playback_session_id is not required.


## ADR: Rights Grant is legal source of truth (A4)

Date: 2026-09-27

Context: B2B needs structured music rights facts before Location eligibility. Studio licensing, author terms, and `music_usage_permission` already exist but are not a B2B Rights Passport.

Decision:

1. Rights Grant (`music_rights_grants`) is the legal source of truth. Rights Passport Basic is a projection/RPC over grants — never a hand-set `licensed=true` column.
2. Creator/Author ≠ Rightsholder. `music_rightsholders` has no required `author_id`.
3. Recording ≠ Composition: `rights_layer` ∈ {recording, composition}; do not collapse into `all_rights`.
4. Territory-aware: `territory_scope` worldwide|countries + `music_rights_grant_countries` include/exclude. Not RU-hardcoded; not a lone `is_global` boolean.
5. Versioned history via `version` + `supersedes_grant_id` (unique successor; same Track/layer/use_type; version = predecessor + 1). Do not rewrite substantive legal fields of non-draft grants. Non-draft DELETE and territory mutations are rejected; draft remains editable until verify.
6. Lifecycle: INSERT only draft|verified; transitions `draft → verified`; `verified → superseded|revoked`; terminal superseded/revoked. `verified_at` immutable after leaving draft. Territory must be complete/coherent before verification; territory rows cannot re-parent into/out of non-draft grants.
7. No automatic B2B rights from existing publication / Studio permission / entitlements. Existing music Track without structured grants → Passport `REVIEW_REQUIRED` (not “Track not found”). Missing/non-music audio_item raises `audio_item_not_found` / `audio_item_not_music`.
8. A4 stops at Rightsholder → Grant → Passport. Country/Location Eligibility is A5. No Money / Analyzer / Business UI.
9. `audio_item_id` is historical reference without destructive FK to `audio_items` (legal history survives Track deletion). Write path validates music Track existence.
10. Raw rights tables: RLS on; anon/authenticated no SELECT/INSERT/UPDATE/DELETE; service_role ALL. Passport EXECUTE service_role only.

## ADR: Rights Eligibility is computed, fail-closed (A5)

Date: 2026-09-28

Context: Aural Engine must answer whether Track X may play at Location Y / Zone Z at time T for use U without parsing contracts itself. A4 grants alone are not Location eligibility.

Decision:

1. Country Rights Profile (`music_country_rights_profiles` + rules) is the versioned global legal/right context SoT. Location Rights Context (`business_location_rights_contexts` + use statuses) is the versioned application of a profile version to a concrete Location (snapshots `country_code` / `business_category` from A1).
2. Eligibility Decision is computed (`resolve_business_track_eligibility`, engine `rights_eligibility_v1`), not a hand-set `licensed` / `eligible` boolean and not a persistent high-volume ledger.
3. Four states: ELIGIBLE | INELIGIBLE | CONDITIONAL | UNKNOWN. UNKNOWN never defaults to ELIGIBLE. INELIGIBLE only from explicit negatives (e.g. `service_status=unsupported`). Missing profile/context/rule/grants → UNKNOWN. Client requirement known but unmet → CONDITIONAL (not ELIGIBLE).
4. Historical reproducibility via profile/context `activated_at`/`ceased_at` and A4 grant `ceased_at` (server-set on verified→superseded|revoked). `updated_at` is not a legal cessation timestamp.
5. Reuse A4 `use_type` vocabulary. No country-if in the engine. No production legal country seeds in migration. No Studio auto-map, Analyzer, Aural, or economics scope in A5.
6. Security: RLS on; anon/authenticated no raw access; RPC EXECUTE service_role only.
