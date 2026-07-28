# AI Visibility — дорожная карта

Обновлять статусы по мере завершения этапов. Не дублировать уже закрытый технический SEO-аудит.

---

## Сводка статусов

| # | Этап | Статус |
|---|------|--------|
| — | AI-SEO 1 technical audit | **completed** |
| — | AI-SEO 2 architecture plan (Bing + IndexNow) | **completed** |
| 1 | Foundation (docs + IndexNow 2A) | **code complete** (awaiting review / merge / deploy) |
| 2 | Bing Webmaster + IndexNow live | planned |
| 3 | JSON-LD consistency | planned |
| 4 | Metadata / OG hardening | planned |
| 5 | Sitemap polish | planned |
| 6 | AI referral analytics | planned |
| 7 | Entity graph | planned |
| 8 | Citation-ready editorial architecture | planned |
| 9 | AI visibility monitoring | planned |
| 10 | Bot policy | planned |

---

## 1. Foundation

- **Цель:** закрепить направление AI Visibility документально; безопасный IndexNow-модуль без live-отправки и без ключа в git.
- **Эффект:** единая точка правды для следующих этапов; dry-run и unit-покрытие.
- **Статус:** code complete (IndexNow 2A на feature-ветке; без prod key / live / deploy).
- **Зависимости:** AI-SEO 1, AI-SEO 2 plan.
- **Риски:** низкие (нет prod env, нет hooks).
- **Критерии:** docs в `docs/ai-visibility/`; модуль `src/lib/seo/indexnow/`; key route + rewrite; dry-run CLI; unit tests зелёные; commit на feature-ветке; нет секретов в git.

## 2. Bing Webmaster + IndexNow live

- **Цель:** верификация сайта в Bing; ключ в shared env; deploy foundation; один разрешённый live-submit; затем runtime hooks.
- **Эффект:** ускоренное уведомление Bing/участников IndexNow о новых/обновлённых URL.
- **Статус:** planned.
- **Зависимости:** этап 1; действия владельца в Bing Webmaster.
- **Риски:** ключ в логах; submit со staging; 429 при шуме.
- **Критерии:** site verified; sitemap в Bing; `GET /{key}.txt` = key; один live 200/202; hooks не ломают publish API.

## 3. JSON-LD consistency

- **Цель:** согласовать типы сущностей (например Person vs Organization на практиках).
- **Эффект:** меньше путаницы для поиска и AI при разборе страницы.
- **Статус:** planned.
- **Зависимости:** foundation (не блокирует IndexNow live).
- **Риски:** ломать валидные сниппеты при смене типов.
- **Критерии:** unit + production HTML sample; без новых сомнительных schema-типов.

## 4. Metadata / OG hardening

- **Цель:** полные title/description/OG (в т.ч. image) на ключевых публичных типах.
- **Эффект:** лучше превью при шаринге и карточках.
- **Статус:** planned.
- **Зависимости:** нет жёстких.
- **Риски:** неверные/signed cover URL.
- **Критерии:** smoke meta на home/catalog/practice/playlist/article.

## 5. Sitemap polish

- **Цель:** lastmod для hubs/static где уместно; фильтр draft/indexable для статей; согласованность trailing slash.
- **Эффект:** чище сигналы свежести для краулеров.
- **Статус:** planned.
- **Зависимости:** не ломать текущий 76-URL production baseline без проверки.
- **Риски:** случайно исключить live-статью.
- **Критерии:** technical-seo unit + sitemap status 200.

## 6. AI referral analytics

- **Цель:** выделять chatgpt / perplexity / copilot и др. в существующей attribution/source_class.
- **Эффект:** видно AI-трафик без отдельной системы.
- **Статус:** planned.
- **Зависимости:** текущий analytics stack.
- **Риски:** шум классификации; SQL sync.
- **Критерии:** unit + возможность фильтра в admin/Metrika без нового продукта.

## 7. Entity graph

- **Цель:** явные стабильные связи бренд ↔ автор ↔ практика ↔ тема ↔ статья.
- **Эффект:** лучше entity understanding у поисковых и AI-систем.
- **Статус:** planned.
- **Зависимости:** JSON-LD consistency; editorial graph (перелинковка статей уже есть).
- **Риски:** over-markup.
- **Критерии:** инвентарь сущностей и проверка согласованности URL/имён; без хаков.

## 8. Citation-ready editorial architecture

- **Цель:** шаблоны статей/хабов удобны для цитирования (определения, FAQ, ясные ответы).
- **Эффект:** выше шанс корректной цитаты в AI-ответах.
- **Статус:** planned.
- **Зависимости:** Editorial Master / Plan 50 (не пересобирать карту).
- **Риски:** размыть tone of voice ради «AI-формата».
- **Критерии:** чеклист для новых статей; выборочный QA live-материалов.

## 9. AI visibility monitoring

- **Цель:** регулярные проверки по CONTROL_QUERIES и запись в EXPERIMENT_LOG.
- **Эффект:** измеряемый прогресс, а не разовые ощущения.
- **Статус:** planned.
- **Зависимости:** CONTROL_QUERIES; ручной или полуручной процесс (экономно).
- **Риски:** расход тарифа Cursor / времени на массовые прогоны.
- **Критерии:** периодичность и шаблон лога соблюдаются; без выдуманных результатов.

## 10. Bot policy

- **Цель:** продуктовое решение: search/citation bots vs training bots.
- **Эффект:** осознанный robots, без авто-разрешения всех ботов.
- **Статус:** planned.
- **Зависимости:** решение владельца.
- **Риски:** закрытие training-ботов ≠ потеря search visibility; обратное — политика данных.
- **Критерии:** записанное решение + при необходимости точечный `robots-config`; без GEO-хаков.
