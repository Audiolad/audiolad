# Аудит platform topics и пилот `/topics/lyubov-k-sebe`

Дата: 2026-07-24  
Worktree: `.worktrees/seo-topic-hub`  
Ветка: `feat/seo-topic-hub-lyubov-k-sebe`  
База: `origin/main` @ `588e7d8`

## Аудит модели

- Источник тем: таблица `topics` + `practice_topics` (миграция foundation).
- Публичный фильтр каталога: `/catalog?topic=<key>` (`key`, не title).
- MVP keys: money, relationships, calm, **self-worth**, body-wellbeing, energy, purpose.
- `self-worth.title` = «Уверенность и самоценность» – не совпадает с SEO-кластером «Любовь к себе».
- До пилота маршрута `/topics/[slug]` не было; `getTopicBySlug` был готов под DB slug.

## Решение пилота

Не менять `topics.slug` в БД и не делать миграцию справочника.

SEO-хаб живёт в code registry:

- slug `lyubov-k-sebe`
- topicKey `self-worth`
- editorial H1 «Любовь к себе»

## Что сделано

- Шаблон `/topics/[slug]`
- Автосбор published catalog practices по `topicKey`
- Metadata / canonical / OG / Twitter
- JSON-LD: CollectionPage, ItemList, FAQPage, BreadcrumbList
- Хлебные крошки, FAQ, related links
- Analytics: `topic_page_viewed`, `topic_product_clicked` (TS + SQL migration file)
- Sitemap entry при наличии практик
- `ProductTopicLinks` → хаб для `self-worth`

## Не сделано / ограничения

- SQL-миграция аналитики **не применена** к production DB.
- Merge / push / deploy **не выполнялись**.
- Home topic chips по-прежнему ведут в `/catalog?topic=`.
- Другие хабы волны 1 не добавлялись.

## Проверки

- `npx tsx scripts/seo-topic-hub-unit.mjs`
- `node scripts/product-topic-links-unit.mjs`
- lint / build – см. отчёт сессии
