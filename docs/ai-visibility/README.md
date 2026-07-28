# AI Visibility — АудиоЛад

Внутреннее направление проекта: сделать так, чтобы поисковые и генеративные AI-системы могли правильно обнаруживать, понимать, цитировать и рекомендовать АудиоЛад, его статьи, авторов, аудиопрактики, плейлисты и тематические страницы.

Это **отдельный системный поток**. Он развивается параллельно с ежедневной публикацией SEO-статей и не заменяет редакционный SEO-контур (`tmp/seo-inventory/`, Editorial Master, Plan 50).

---

## Цель

Повысить корректную видимость АудиоЛада в:

- классическом поиске (Google, Яндекс, Bing);
- AI Overviews / AI Mode и аналогах;
- системах, которые цитируют и рекомендуют по публичному веб-контенту (ChatGPT Search, Copilot, Perplexity и др.).

---

## Чем AI Visibility отличается от обычного SEO

| Обычное SEO | AI Visibility |
|-------------|---------------|
| Ранжирование и клики в выдаче | Обнаружение, понимание сущности, цитирование, рекомендации |
| Keywords, хабы, статьи | Entity clarity, structured data, citation-ready текст, AI referrals |
| GSC / Вебмастер / семантика | Плюс мониторинг упоминаний в AI-системах |

**Правило:** обычное техническое и контентное SEO — фундамент. AI Visibility его **не заменяет** и не дублирует уже работающие механизмы.

**Правило:** не добавлять формальные AI-файлы (`llms.txt` и т.п.), GEO/AEO-хаки и неподтверждённые schema-типы без доказанной пользы и отдельного решения.

---

## Основные контуры

1. **Crawlability** — robots, доступность публичных URL для поисковых и цитирующих ботов.
2. **Indexing** — sitemap, IndexNow/Bing, canonical, noindex для приватного.
3. **Entity understanding** — стабильные сущности: бренд, авторы, практики, темы, статьи.
4. **Structured data** — корректный JSON-LD, согласованный с видимым контентом.
5. **Citation readiness** — ясный SSR-текст, определения, FAQ, источники внутри материалов.
6. **AI referrals** — учёт переходов с AI-доменов в существующей аналитике.
7. **Monitoring** — контрольные запросы, журнал экспериментов, кабинеты вебмастеров.

---

## Уже реализовано — не дублировать

Использовать existing production / `origin/main`:

| Компонент | Где |
|-----------|-----|
| `robots.txt` | `src/app/robots.ts`, `src/lib/seo/robots-config.ts` |
| Sitemap | `src/app/sitemap.ts`, `src/lib/seo/sitemap-data.ts` |
| Canonical / metadata | `src/lib/seo/public-page-metadata.ts`, page `generateMetadata` |
| SSR публичных страниц | App Router server components |
| JSON-LD | `src/lib/seo/json-ld/*`, articles / topic-hubs builders |
| SEO-статьи | `src/lib/seo/articles/*`, `/articles/...` |
| Topic hubs | `src/lib/seo/topic-hubs/*`, `/topics/...` |
| Страницы авторов | `/authors/[slug]` |
| SEO unit tests | `scripts/technical-seo-foundation-unit.mjs`, `structured-seo-data-unit.mjs`, `seo-article-unit.mjs`, `seo-topic-hub-unit.mjs` |

Контентная семантика и редакционная очередь: `tmp/seo-inventory/`, `tmp/seo-editorial/` — **не пересобирать** без отдельной задачи.

---

## Документы направления

| Файл | Назначение |
|------|------------|
| [ROADMAP.md](./ROADMAP.md) | Этапы и статусы |
| [EXPERIMENT_LOG.md](./EXPERIMENT_LOG.md) | Журнал проверок в AI-системах |
| [CONTROL_QUERIES.md](./CONTROL_QUERIES.md) | Контрольные пользовательские запросы |

Источники аудита (не повторять с нуля):

- AI-SEO 1 — технический аудит (completed);
- AI-SEO 2 — архитектура Bing + IndexNow (completed).

Рабочий код IndexNow foundation: `src/lib/seo/indexnow/`.

---

## Экономия и процесс

- Опираться на `origin/main` и production deploy, не на неполный dirty checkout.
- Не менять production, секреты, DNS, Nginx, PM2 и внешние кабинеты без подтверждения.
- Deploy IndexNow foundation и live-submit — только отдельными шагами после ключа владельца.
