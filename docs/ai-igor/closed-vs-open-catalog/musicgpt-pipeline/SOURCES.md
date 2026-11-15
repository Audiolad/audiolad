# Источники

Проверка: 15.11.2026, Europe/Moscow. Официальный сервис MusicGPT – только `musicgpt.com` и `docs.musicgpt.com`. Платные API не вызывались. SHA-256 – по телу HTTP-ответа на момент загрузки (это снимок байтов ответа, не обязательно «чистый» Markdown: у HTML-страниц в ответ входят шаблон сайта).

| ID | Документ | Адрес | Дата на документе / что видно | Проверено | SHA-256 снимка 15.11.2026 |
|---|---|---|---|---|---|
| М1 | Terms of Service | https://musicgpt.com/terms-of-service | Effective date: 01 Jan 2025. Оператор MusicGPT Ltd. Singapore | да | `3782152d99062a266367508100ea32ba6a14b6d4f3436d85a333b78709f4d0cd` |
| М2 | Privacy Policy | https://musicgpt.com/privacy-policy | Effective date: 01 Jan 2025 | да | `5aa2192715aeca51b6b24920e48ae003387083c26807aa2a3b2b0e056400cbc2` |
| М3 | API Pricing | https://docs.musicgpt.com/api-documentation/index/pricing | Ставки за песню; «All paid plans include commercial use»; абонентка Plus/Pro в коде страницы 19 $/69 $ в месяц и 14,99 $/49,99 $ /mo при годовой оплате | да | Markdown: `02b5a433fecbf626c0cc5b381de0e703bee12593da3e76333699dd1bdfaef002` |
| М4 | Music AI V2 | https://docs.musicgpt.com/api-documentation/conversions/musicaiv2 | `POST /v2/MusicAI`, два выхода, WAV в webhook | да | `9be6cbe4cdc223aa64bd745f242ae63ed3b0c7c77f3b54de0085b515643c9011` |
| М5 | API FAQs | https://docs.musicgpt.com/api-documentation/index/FAQs | 69 $ base charge у Pro; какие эндпоинты отдают WAV; лимиты промпта | да | `fbeed08576e11ec8a192154a782ccae7e38bbdecaaebc908cb6312be7807f6a4` |
| М6 | Changelog | https://docs.musicgpt.com/api-documentation/index/changelog | Хранение MP3 90 дней, WAV 7 дней; V1 deprecated; цены с 1 августа | да | `be9e0aa2e635fd10a81bef1ad2afde0f128d6aa335c3f7cfc0068e29652cc7f1` |
| М7 | Get by ID | https://docs.musicgpt.com/api-documentation/endpoint/getById | Поля WAV, title, conversion_id | да | снимок Markdown отдельно не хешировался; страница прочитана 15.11.2026 |
| М8 | Webhook, Auth, Status, Ratelimits, Create API Account | https://docs.musicgpt.com/api-documentation/index/webhook , `/authentication`, `/statuscheck`, `/utilities/ratelimits`, `/index/createapiaccount` | Базовый URL, ключ, лимиты, платёжные данные при создании API-аккаунта | да | – |
| М9 | Индекс документации | https://docs.musicgpt.com/llms.txt | Полный перечень страниц; license/ownership в перечне нет | да | – |
| М10 | OpenAPI | https://docs.musicgpt.com/api-documentation/openapi.json | Нет путей license/ownership/stealth/rename; нет `output_length` у V2 | да | – |
| М11 | Страница тарифов сайта | https://musicgpt.com/pricing | 15.11.2026: Free / Plus 9,99 $ / Pro 16,99 $ / Ultra 32,99 $ в месяц; строки Download license, Stealth creation, Commercial use (у Free – нет, у Plus и выше – есть). FAQ JSON-LD про commercial use и Discover | да | HTML и отрисованная страница; отдельный хеш HTML не используется как юридический снимок условий |
| М12 | Подсказки тарифов на сайте | публичный JS сайта `musicgpt.com` | Stealth: «Your generations to not be published by default.» License: «A downloadable document issued by MusicGPT to proof that you have the rights of your generation.» | да | это строки интерфейса, не договор |
| М13 | About | https://musicgpt.com/about | Product of Singapore, HQ in Singapore | да | – |
| М14 | API marketing | https://musicgpt.com/api | Общее описание API; для правовых выводов не использовалось вместо ToS и docs | да | – |
| Устаревшая ссылка | conversions/musicaistreaming | https://docs.musicgpt.com/api-documentation/conversions/musicaistreaming | 15.11.2026: HTTP 404 | да | – |
| С1 | Suno Terms of Service | https://suno.com/terms | Date of Last Revision: August 10, 2026; Effective Date: September 3, 2026 | да (текст страницы прочитан 15.11.2026; повторная загрузка сырого HTTP дала 403, хеш не фиксировался) | – |
| С2 | Suno Help: ownership | https://help.suno.com/en/articles/2416769 | Edited Wednesday, January 7 2026 | да | – |
| С3 | Suno Help: paid rights | https://help.suno.com/en/articles/9601665 | Edited Thursday, September 3 2026 | да | – |
| С4 | Suno Help: commercial use | https://help.suno.com/en/articles/9601985 | Edited Wednesday, December 17 2025 | да | – |
| В1 | Регламент stage3 | [PR #1261](https://github.com/Audiolad/audiolad/pull/1261), `docs/ai-igor/closed-vs-open-catalog/stage3/01-reglament.md` | Редакция 1 от 15.11.2026 | да | в этой ветке файла нет, потому что PR #1261 ещё не слит |
| В2 | Шаблон паспорта | тот же PR, `docs/ai-igor/closed-vs-open-catalog/pilot/01-pasport-shablon.md` | – | да | – |

Не использовались как источник прав: сторонние обзоры, `musicgpt.cc`, `musicgpt.studio`, блог-статьи сервиса (в них встречаются устаревшие эндпоинты и срок жизни ссылки «24 часа», что расходится с changelog).
