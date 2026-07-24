# TOPICS.md — тематическая система «АудиоЛад»

Документ описывает платформенную систему тем (Stage A foundation).

Миграция: `supabase/migrations/20260717140000_topics_foundation.sql`

---

## Ownership

- Темы создаёт и управляет ими **платформа** (`platform_owner`, `platform_admin`, будущая редакционная роль).
- Авторы **только выбирают** активные темы из справочника для своих продуктов.
- Свободный ввод, пользовательские темы и auto-create по API **запрещены**.
- Изменения справочника до `/admin/topics`: SQL-миграции или service role.

---

## Identity

| Поле | Назначение |
|------|------------|
| `id` | UUID, связи в `practice_topics` |
| `key` | Стабильный системный идентификатор (API, analytics). **Не менять** после создания |
| `slug` | Публичный URL для будущих `/topics/[slug]`. MVP: совпадает с `key` |
| `title` | Отображаемое название; переименование без миграции связей |

---

## Lifecycle

| Состояние | Механизм |
|-----------|----------|
| Active | `is_active = true` |
| Hidden from home | `show_on_home = false` (остаётся в Каталоге) |
| Inactive | `is_active = false`; связи с продуктами **сохраняются** |
| Reorder | `sort_order` (шаг 10 в seed: 10, 20, …) |
| Rename | `UPDATE topics SET title = …` |
| Merge (future) | перенос `practice_topics` → deactivate source |

Физическое `DELETE` — только при отсутствии связей; не используется в admin UI.

---

## Visibility flags

- **`is_active`** — тема доступна для нового выбора и публичного чтения.
- **`show_on_home`** — тема может появиться в блоке Главной (плюс фильтр по count > 0 в app layer).

Каталог использует все `is_active = true` независимо от `show_on_home`.

---

## Limits

| Правило | MVP |
|---------|-----|
| Max topics per product | **3** (все авторы) |
| Draft | **0 тем** допустимо |
| Publish | **≥ 1 активная** тема (`publish_audio_product` v4) |
| Resolver (TS) | `resolveAuthorTopicLimit()` → `src/lib/topics/limits.ts` |
| Resolver (SQL) | `resolve_author_topic_limit(author_id)` |
| Join table CHECK | **Нет** жёсткого лимита на уровне схемы |

### Future

- Лимит из author plan: `free` / `commercial_standard` = 3; `premium` = 5–7; `premium_plus` = до 10.
- Premium увеличивает **слоты**, не автоматический **вес** в выдаче.
- Future: `is_primary`, `sort_order` на `practice_topics` для primary vs secondary тем.

---

## Database

### `public.topics`

Справочник платформенных тем.

### `public.practice_topics`

Many-to-many: `practices` ↔ `topics`. PK `(practice_id, topic_id)`.

Запись **только** через RPC `set_practice_topics(practice_id, topic_keys[])`.

---

## RLS

### `topics`

- SELECT (anon, authenticated): `is_active = true`
- SELECT (authenticated): inactive topics assigned to author's own products
- ALL (authenticated): `is_platform_staff()`

### `practice_topics`

- SELECT: published practices, entitled users, author members
- INSERT/UPDATE/DELETE: **нет** для anon/authenticated (только RPC SECURITY DEFINER)

---

## RPC

### `set_practice_topics`

- Author membership required
- Active keys only → иначе `topic_not_found`
- Count ≤ `resolve_author_topic_limit`
- Full replace assignment set
- Draft may pass `[]`

### `publish_audio_product` v4

- Requires ≥ 1 active topic before publish

---

## Server layer (TypeScript)

```
src/lib/topics/
  types.ts    — TopicRow, TopicOption, errors
  limits.ts   — resolveAuthorTopicLimit, assertions
  queries.ts  — listActiveTopics, listHomeTopics, getPracticeTopics, …
  sync.ts     — setPracticeTopics RPC wrapper
  errors.ts   — mapTopicRpcError
  index.ts    — public exports
```

---

## Home navigation (Stage C)

- Главная (guest и personal) загружает темы сервером через `loadHomeTopicsSafe()` → `listHomeTopicsWithCatalogCounts()`.
- Условия показа на Главной: `is_active`, `show_on_home`, минимум один published catalog-listed продукт.
- Сортировка: `sort_order ASC`, `title ASC` (в query layer этапа A).
- Компонент: `src/components/home/HomeTopicNavigation.tsx` — один источник для guest и personal.
- Ссылки: `/catalog?topic=<key>` (`topic.key`, не title/slug).
- `show_on_home` применяется **только** на Главной; Каталог показывает все active темы с продуктами.
- Legacy `?need=` больше **не создаётся** внутренними ссылками Главной.
- Каталог временно поддерживает старые внешние `?need=` через `resolveCatalogTopicSearchParam()` (`src/lib/catalog/topic-filter.ts`).
- При ошибке загрузки тем блок скрывается; Главная не падает.

---

## Author product form (Stage D)

- Кабинет автора: create/edit (`AuthorProductForm`) загружает темы на сервере через `loadAuthorProductTopicFormData()`.
- Автор выбирает только из `listActiveTopics()` — active directory, без free-text и без author-created topics.
- UI: `TopicSelector` (`src/components/author-products/TopicSelector.tsx`) — chip multi-select, лимит через `resolveAuthorTopicLimit()`.
- Draft: **0–3** активных тем; publish: **1–3** активных (`publish_audio_product` v4 + client hint).
- Сохранение: после PATCH продукта → `PATCH /api/author/products/[id]/topics` → RPC `set_practice_topics` (не прямой INSERT в `practice_topics`).
- Edit: назначенные темы из `getPracticeTopics()`; inactive assigned показываются как «Архивная тема» и удаляются при save без их key.
- Счётчик «Выбрано N из M» — M из resolver, не hardcode в UI.

---

## Public product page (Stage E)

- Публичная страница продукта (`/practice/{authorSlug}/{productSlug}`) показывает **активные** темы через `loadPublicPracticeTopicsSafe()` → `getActivePracticeTopics()`.
- Inactive/архивные темы публично **не показываются** (фильтр в query layer этапа A).
- UI: `ProductTopicLinks` — компактные navigation chips, не overlay на cover.
- Ссылки: `resolveTopicPublicHref(topic.key)` – SEO-хаб `/topics/{slug}`, если он есть в реестре; иначе `/catalog?topic=<key>`.
- При ошибке загрузки тем блок скрывается; страница продукта не падает.
- Темы на карточках Главной, Каталога, Аудиотеки и Плейлистов **не реализованы** (отдельная задача).

---

## SEO topic hubs (`/topics/{slug}`)

Редакционные посадочные страницы **не заменяют** справочник `topics`.

| Слой | Идентификатор | Пример |
|------|---------------|--------|
| Platform topic | `topics.key` | `self-worth` |
| Platform title | `topics.title` | Уверенность и самоценность |
| SEO hub slug | реестр `src/lib/seo/topic-hubs/registry.ts` | `lyubov-k-sebe` |
| SEO hub H1 | editorial `title` | Любовь к себе |
| URL | `/topics/{hub.slug}` | `/topics/lyubov-k-sebe` |

Правила:

- Практики на хабе собираются автоматически: published + catalog-listed + `practice_topics` → `topics.key = hub.topicKey`.
- `topics.slug` в БД **не обязан** совпадать с SEO slug; analytics/API всегда используют `topic_key`.
- Пилот: «Любовь к себе» → `self-worth`.
- Metadata, canonical, Open Graph, JSON-LD (CollectionPage + ItemList + FAQPage + BreadcrumbList), FAQ и перелинковка – в шаблоне хаба.
- Sitemap включает хаб только если есть ≥ 1 опубликованная практика темы.
- Каталог `/catalog?topic=self-worth` остаётся фильтром UI; canonical у хаба – `/topics/lyubov-k-sebe`.

Код:

```
src/lib/seo/topic-hubs/     — registry, load, metadata, json-ld, paths
src/app/(listener)/topics/[slug]/page.tsx
src/components/topics/TopicHubPageView.tsx
```

---

## Analytics

Использовать **`topic_key`**, не `topic_title`.

События хаба:

- `topic_page_viewed` – свойства: `topic_key`, `hub_slug`, `product_count`
- `topic_product_clicked` – свойства: `topic_key`, `hub_slug`; `practice_id` в корне события

TS allowlist: `src/lib/analytics/constants.ts`  
SQL allowlist: миграция `20260724160000_platform_analytics_topic_hub_events.sql`  
(миграция **не применяется** без отдельного согласования deploy).

---

## Future (не в Stage A)

- `/admin/topics` — CRUD для platform staff
- Расширение реестра SEO-хабов (деньги, энергия, …)
- `merged_into_topic_id`, slug redirects
- Ranking / editorial weight
- Author plans table
- AI classification

---

## Anti-patterns

- Hardcoded массивы тем в UI-компонентах
- Константа `3` в нескольких client/server файлах
- Author INSERT into `topics`
- Auto-create topic from unknown key
- `title` как идентификатор в API/analytics
- CHECK (count <= 3) на `practice_topics`
