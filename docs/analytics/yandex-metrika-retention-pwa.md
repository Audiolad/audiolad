# Яндекс Метрика: retention, PWA и Вебвизор

Внутренняя документация по расширенной интеграции Яндекс Метрики в АудиоЛад.

## ID счётчика

- Переменная окружения: `NEXT_PUBLIC_YANDEX_METRIKA_ID`
- Парсинг и guard: `src/lib/analytics/yandex-metrika.ts` (`getYandexMetrikaCounterId`)
- Новый счётчик не создаётся: используется существующий production-счётчик

## Подключение в коде

- Компонент счётчика: `src/components/analytics/YandexMetrika.tsx`
- Монтирование: `src/components/AppProviders.tsx`
- Инициализация выполняется один раз после согласия пользователя и загрузки `tag.js`

Параметры `ym(..., "init", ...)` в production:

```ts
clickmap: true
trackLinks: true
accurateTrackBounce: true
webvisor: true
```

## Вебвизор в интерфейсе Метрики

Помимо кода, владельцу нужно включить настройки в интерфейсе Яндекс Метрики:

**Яндекс Метрика → Настройки → Счётчик → Вебвизор, карта скроллинга, аналитика форм → включить → сохранить**

Без этого шага записи Вебвизора могут не появляться, даже если в коде `webvisor: true`.

## Cookie consent

- Метрика загружается только при `audiolad_analytics_cookies = granted`
- Баннер: `src/components/analytics/AnalyticsConsentBanner.tsx`
- До согласия счётчик не инициализируется

## Зеркалирование событий

Основной продуктовый источник – `analytics_events` через `/api/analytics/track` и `/api/analytics/events`.

Яндекс Метрика – дополнительный источник через `sendYandexGoal()`:

| Внутреннее событие | Цель в Метрике |
| --- | --- |
| `first_save_retention_prompt_shown` | да |
| `first_save_retention_prompt_library_clicked` | да |
| `first_save_retention_prompt_dismissed` | да |
| `first_save_retention_prompt_install_clicked` | да |
| `pwa_install_clicked` | да |
| `pwa_ios_instructions_opened` | да |
| `pwa_install_prompt_shown` | да |
| `pwa_install_accepted` | да |
| `pwa_install_dismissed` | да |
| `pwa_installed` | да |
| `pwa_opened_standalone` | да |
| `signup_completed` | да |
| `audio_play_started` | да |
| `audio_completed` | да |
| `author_application_submitted` | да |

Не зеркалируется:

- `first_manual_library_save` – создаётся server-side при первом сохранении в библиотеку
- promo-события и прочие события вне allowlist

## Допустимые параметры целей

Allowlist: `source`, `platform`, `browser_environment`, `install_mode`, `result`.

Примеры значений:

- `source`: `retention`, `banner`, `menu`, `profile`, `other`
- `platform`: `ios`, `android`, `desktop`, `unknown`

PII и технические идентификаторы отбрасываются в `src/lib/analytics/yandex-metrika-params.ts`.

## Запрещено передавать в Метрику

- email, имя, фамилия, телефон
- `user_id`, UUID профиля, `anonymous_id`, session token
- signed audio URL, slug практики, текст пользовательского ввода
- полные query strings с `token`, `order_id`, `code` и другими чувствительными параметрами

## Конфиденциальность Вебвизора

- Глобально ко всем `input`, `textarea`, `select` добавляется класс `ym-disable-keys`
- Новые поля покрываются через `MutationObserver`
- Админ-контент с `data-admin-panel` / `data-admin-form` получает `ym-hide-content`
- Маршруты `/admin` не загружают счётчик

## SPA pageviews

- Первый автоматический hit от `tag.js` сохраняется
- Дополнительные переходы App Router отправляются через `reachYandexMetrikaHit`
- Дубли на первой загрузке предотвращает `skipInitialHit`
- URL очищается в `sanitizeMetrikaPageUrl`

## Admin / dev / test

- `NODE_ENV !== production` – цели не отправляются
- `localhost`, `*.local` – счётчик не активируется
- `/admin` – счётчик не монтируется
- Внутренняя аналитика продолжает работать независимо от Метрики

## Цели для ручного создания в интерфейсе Метрики

| Название цели | Идентификатор |
| --- | --- |
| Первое сохранение в Аудиотеку | `first_manual_library_save` |
| Показана карточка после сохранения | `first_save_retention_prompt_shown` |
| Нажата установка из карточки | `first_save_retention_prompt_install_clicked` |
| Открыта установка АудиоЛада | `pwa_install_clicked` |
| Открыта инструкция iPhone | `pwa_ios_instructions_opened` |
| Показано окно установки | `pwa_install_prompt_shown` |
| Установка подтверждена | `pwa_install_accepted` |
| Установка отклонена | `pwa_install_dismissed` |
| АудиоЛад установлен | `pwa_installed` |
| Открыт установленный АудиоЛад | `pwa_opened_standalone` |

`first_manual_library_save` создаётся на сервере и в browser Метрику не дублируется.

## Проверка отправки

1. Дать согласие на аналитические cookies
2. Открыть production-сайт с `?_ym_debug=2`
3. В консоли браузера проверить вызовы `reachGoal` и `hit`
4. В интерфейсе Метрики найти визит → цели / Вебвизор

## Ограничения iOS manual installation

- Системные шаги «Поделиться → На экран Домой → Добавить» сайт не видит
- Для iOS фиксируются только `pwa_ios_instructions_opened` и последующий `pwa_opened_standalone`
- `pwa_installed` отправляется только при подтверждённом browser-событии `appinstalled`
