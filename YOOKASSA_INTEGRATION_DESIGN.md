# YOOKASSA_INTEGRATION_DESIGN.md

Технический проект интеграции «АудиоЛад» с ЮKassa.  
Дата: 2026-07-13.

**Только проектирование.** Код, БД, миграции, SDK, API routes, webhook, UI **не изменялись**.

Опора: фактическая схема (`orders`, `payments`, `user_practices`), коммиты `a37fdd1`, `278ab5a`, `fe64a53`, продуктовые решения MVP.

---

## Ограничения этапа

| Действие | Статус |
|----------|--------|
| Изменение кода / БД | ❌ |
| Применение миграций к production | ❌ |
| Подключение SDK / зависимостей | ❌ |
| Реальные ключи / платежи | ❌ |
| Коммит / push | ❌ |

---

## Официальные источники (без секретов)

Документация API ЮKassa (раздел «Приём платежей по API»):

| Тема | URL |
|------|-----|
| Формат взаимодействия, Basic Auth, Idempotence-Key | https://yookassa.ru/developers/using-api/interaction-format |
| Процесс платежа, redirect, статусы | https://yookassa.ru/developers/payment-acceptance/getting-started/payment-process |
| Быстрый старт | https://yookassa.ru/developers/payment-acceptance/getting-started/quick-start |
| Входящие уведомления (webhook) | https://yookassa.ru/developers/using-api/webhooks |
| Использование SDK | https://yookassa.ru/developers/using-api/using-sdks |
| Чеки от ЮKassa (54-ФЗ) | https://yookassa.ru/developers/payment-acceptance/receipts/54fz/yoomoney/basics |
| Чеки при платежах | https://yookassa.ru/developers/payment-acceptance/receipts/54fz/yoomoney/payments |
| Тестирование | https://yookassa.ru/developers/payment-acceptance/testing-and-going-live/testing |
| OpenAPI спецификация | https://yookassa.ru/developers/using-api/openapi-specification |

---

## 1. Требования к аккаунту (до технического подключения)

### Идентификаторы и ключи

| Артефакт | Назначение | Где получить |
|----------|------------|--------------|
| **shopId** | Идентификатор магазина (HTTP Basic Auth username) | ЛК ЮKassa → Настройки → Магазин |
| **secret key** | Секретный ключ API (HTTP Basic Auth password) | ЛК → Интеграция → Ключи API |
| **Тестовый магазин** | `test: true` платежи, без реальных списаний | Создаётся в ЛК сразу после регистрации |
| **Production-магазин** | Реальные платежи | После договора и данных компании |

Секретный ключ production: генерируется, активируется SMS, скачивается один раз.  
Тестовый ключ: доступен в ЛК постоянно.

**Не выводить и не запрашивать реальные значения в репозитории.**

### Webhook и HTTPS

| Требование | Факт (официальная документация) |
|------------|--------------------------------|
| URL webhook | HTTPS, порт **443** или **8443** |
| TLS | 1.2+, сертификат любой (в т.ч. Let's Encrypt) |
| Настройка | ЛК → Интеграция → HTTP-уведомления (при Basic Auth) |
| Ответ | **HTTP 200** (тело игнорируется); иначе повтор 24 ч |

Предполагаемый production URL: `https://audiolad.ru/api/payments/yookassa/webhook`

### Чеки (54-ФЗ)

| Параметр | Требование |
|----------|------------|
| Модель | **Чеки от ЮKassa** (ИП, обычные платежи) |
| Доставка чека | Только **email** (SMS недоступен) |
| Данные чека | Передаются в запросе создания платежа (`receipt`) |
| Возврат | Отдельный чек возврата через API |
| Налоговые значения | **Не определять в этом документе** — согласовать с бухгалтером |

### Юридические и контактные данные

До production потребуется в ЛК ЮKassa:

- реквизиты ИП Сергея;
- договор с ЮKassa;
- email/телефон для поддержки покупателей;
- настройка «Чеки от ЮKassa» в разделе Настройки.

---

## 2. Полный платёжный путь

### Последовательность (16 шагов)

1. Клиент вызывает **`POST /api/orders`** → `create_practice_order` → `orders.status = pending`.
2. Пользователь нажимает «Оплатить» (будущий UI).
3. Клиент вызывает **`POST /api/payments`** с `{ "order_id": "uuid" }`.
4. Сервер: `auth.getUser()` → 401 если нет сессии.
5. Сервер: `SELECT orders WHERE id = ? AND user_id = auth.uid()` → 404/403 если чужой/нет.
6. Сервер читает **`orders.amount_minor`**, **`orders.currency`** (не от клиента).
7. Сервер создаёт строку **`payments`** (`provider = 'yookassa'`, `status = pending`) через **service_role**.
8. Сервер вызывает **`POST https://api.yookassa.ru/v3/payments`** с `capture: true`, `confirmation.type: redirect`.
9. ЮKassa возвращает `id` (provider_payment_id) и `confirmation.confirmation_url`.
10. Сервер сохраняет `provider_payment_id`, URL в `provider_metadata`; клиент получает `confirmation_url`.
11. Браузер перенаправляется на платёжную форму ЮKassa.
12. После оплаты ЮKassa шлёт **webhook** `payment.succeeded` (или `payment.canceled`).
13. Webhook handler: проверка IP → **`GET /v3/payments/{id}`** у ЮKassa → сверка статуса, суммы, metadata.
14. В **одной DB-транзакции**: lock payment + order → update → `grant_practice_purchase_access(order_id)`.
15. Пользователь возвращается на **`/checkout/result?order_id=...`** (return_url).
16. UI опрашивает **`GET /api/orders/[id]`** (или status endpoint) — источник истины **наш сервер**, не redirect.

### Sequence diagram

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant UI as Next.js UI
    participant API as Audiolad API
    participant DB as PostgreSQL
    participant YK as YooKassa API

    User->>UI: Купить практику
    UI->>API: POST /api/orders {practice_slug}
    API->>DB: RPC create_practice_order
    DB-->>API: pending order
    API-->>UI: 201 {order}

    User->>UI: Оплатить
    UI->>API: POST /api/payments {order_id}
    API->>DB: verify order owner + pending
    API->>DB: INSERT payments (pending)
    API->>YK: POST /v3/payments (Idempotence-Key)
    YK-->>API: provider_payment_id, confirmation_url
    API->>DB: UPDATE payments metadata
    API-->>UI: {confirmation_url}
    UI->>YK: redirect confirmation_url

    User->>YK: Оплата на форме ЮKassa
    YK-->>API: POST webhook payment.succeeded
    API->>YK: GET /v3/payments/{id}
    YK-->>API: status=succeeded, amount, metadata
    API->>DB: BEGIN; lock payment, order
    API->>DB: UPDATE payment succeeded, order paid
    API->>DB: grant_practice_purchase_access(order_id)
    API->>DB: COMMIT
    API-->>YK: HTTP 200

    YK-->>User: redirect return_url
    User->>UI: /checkout/result?order_id=
    UI->>API: GET /api/orders/{id}
    API-->>UI: status=paid
    UI-->>User: Успех / Слушать
```

---

## 3. POST /api/payments (проект)

### Запрос

```json
{
  "order_id": "uuid"
}
```

**Не принимать:** `amount`, `currency`, `user_id`, `practice_id`, `status`, `provider_payment_id`.

### Авторизация и владелец заказа

1. `createClient()` + `auth.getUser()` — как в `POST /api/orders`.
2. Загрузка заказа: `orders.id = order_id` **и** `orders.user_id = user.id`.
3. Чужой заказ → **404** `order_not_found` (не раскрывать существование).

Использовать **authenticated client** для чтения `orders` (RLS: own orders).  
Запись в `payments` — через **service_role** (клиенту запрещено).

### Разрешённые статусы order для создания payment

| `orders.status` | Действие |
|-----------------|----------|
| `pending` | ✅ Создать / вернуть payment |
| `paid` | ❌ 409 `order_already_paid` |
| `cancelled` | ❌ 409 `order_not_payable` |
| `failed` | ❌ 409 `order_not_payable` |
| `refunded` | ❌ 409 `order_not_payable` |

Дополнительно: RPC `create_practice_order` уже блокирует `already_owned` — повторная покупка не дойдёт до payment.

### Поведение при существующем pending payment

| Ситуация | MVP-правило |
|----------|-------------|
| Есть `payments` для order со `status = pending` и тем же `provider_payment_id` | Вернуть существующий `confirmation_url` (из `provider_metadata`) |
| Pending local, но вызов ЮKassa не завершился (нет `provider_payment_id`) | Повторить `POST /v3/payments` с **тем же** `Idempotence-Key` = `payments.idempotency_key` |
| Pending у ЮKassa, пользователь снова жмёт «Оплатить» | Не создавать новую строку; `GET /v3/payments/{id}` или тот же idempotency replay |
| Последний payment `failed` / `cancelled` | ✅ Разрешить **новую** строку `payments` + новый idempotency key |
| Order уже `paid` | ❌ Запрет второго платежа |

### Idempotency key для ЮKassa

**Локальный ключ:** `payments.idempotency_key` (NOT NULL, UNIQUE per `provider`).

**Правило MVP:**

```
Idempotence-Key (HTTP к ЮKassa) = payments.idempotency_key
```

Генерация: `crypto.randomUUID()` при INSERT новой попытки оплаты.  
Один ключ = один вызов `POST /v3/payments` для данной строки `payments`.

Повтор при таймауте HTTP 500 от ЮKassa: **тот же** `Idempotence-Key` (официально: повтор в течение 24 ч возвращает исходный результат).

### Сохранение provider_payment_id и confirmation_url

| Поле | Куда |
|------|------|
| `provider_payment_id` | `payments.provider_payment_id` (колонка есть) |
| `confirmation_url` | `payments.provider_metadata.confirmation_url` (MVP без миграции) |
| `provider_status` | `payments.provider_metadata.provider_status` (кэш статуса ЮKassa) |
| полный ответ create | `payments.provider_metadata.create_response` (server-only) |

`provider_metadata` уже **не доступен клиенту** (RLS).

### Безопасный ответ клиенту

**201 Created** (или 200 при replay):

```json
{
  "payment": {
    "id": "uuid",
    "order_id": "uuid",
    "status": "pending",
    "confirmation_url": "https://yoomoney.ru/..."
  }
}
```

**Не возвращать:** `provider_metadata` целиком, `provider_payment_id` (опционально можно, но не обязательно), секреты, сумму из запроса клиента.

---

## 4. Idempotency ЮKassa — правила MVP

### Официальные факты

| Параметр | Значение |
|----------|----------|
| Заголовок | `Idempotence-Key` |
| Формат | до 64 символов, рекомендуется UUID v4 |
| Область | Один ключ = одна логическая операция `POST`/`DELETE` |
| Срок | **24 часа** с первого запроса; потом — новая операция |
| Повтор с тем же ключом и теми же данными | Возврат исходного ответа |
| Повтор с тем же ключом, другие данные | Обработка как **новый** запрос |

### Сценарии

| Сценарий | Поведение |
|----------|-----------|
| Сетевой таймаут после create | Повтор `POST /v3/payments` с тем же `Idempotence-Key` |
| Повторное «Оплатить» (pending) | Вернуть существующий payment + URL, не INSERT |
| Новый payment после `canceled` | Новая строка `payments`, новый UUID в `idempotency_key` |
| После `paid` | Запрет создания payment |
| Webhook duplicate | Идемпотентность на нашей стороне (см. §7) |

### Точное правило MVP

> **Одна строка `payments` = один `Idempotence-Key` = один объект платежа ЮKassa.**  
> Повторная оплата того же order после неуспеха = новая строка `payments`.

---

## 5. Confirmation URL

### Тип confirmation (MVP)

| Параметр | Значение |
|----------|----------|
| `confirmation.type` | **`redirect`** |
| Сценарий | Redirect — пользователь на странице ЮKassa / партнёра |
| `capture` | **`true`** — одностадийный платёж, сразу `succeeded` |

Двухстадийные платежи (`capture: false`, `waiting_for_capture`) **не используем** в MVP.

### Получение URL

Из ответа `POST /v3/payments`: `confirmation.confirmation_url` при `status: pending`.

### return_url

```json
"confirmation": {
  "type": "redirect",
  "return_url": "https://audiolad.ru/checkout/result?order_id={order_id}"
}
```

`return_url` — только UX-возврат; **не доказательство оплаты**.

### Что нельзя считать доказательством оплаты

- redirect на `return_url`;
- query-параметры от ЮKassa в URL браузера;
- тело webhook без `GET /v3/payments/{id}`;
- `metadata` без сверки с локальным order.

### Страница результата (будущая)

**Маршрут:** `/checkout/result?order_id={uuid}`

| Состояние order | UI |
|-----------------|-----|
| `pending` | «Проверяем оплату…» (poll) |
| `paid` | Успех + «Слушать» |
| `cancelled` / `failed` | Ошибка + «Попробовать снова» |

Poll: `GET /api/orders/{id}` каждые 2–3 с, таймаут ~60–120 с, затем «Оплата обрабатывается».

### Почему redirect ≠ webhook

Официальная документация: статус меняется асинхронно; webhook — надёжный канал; redirect может прийти раньше или позже webhook, пользователь может закрыть вкладку.

---

## 6. Webhook — POST /api/payments/yookassa/webhook

### События MVP

| Событие | Нужно | Действие |
|---------|-------|----------|
| `payment.succeeded` | ✅ Обязательно | Подтверждение оплаты + grant |
| `payment.canceled` | ✅ Обязательно | `payments.status = cancelled`, order остаётся `pending` или → `cancelled` по политике |
| `payment.waiting_for_capture` | ❌ | Не подписываться (одностадийный `capture: true`) |
| `refund.succeeded` | ⚠️ Позже | Ручные возвраты в MVP; webhook для автоматизации — post-MVP |

### Подлинность уведомления

Официальные методы (комбинировать):

1. **Проверка IP** — запрос только с диапазонов ЮKassa (185.71.76.0/27, 185.71.77.0/27, 77.75.153.0/25, 77.75.156.11, 77.75.156.35, 77.75.154.128/25, 2a02:5180::/32).
2. **Проверка статуса объекта** — обязательный `GET /v3/payments/{payment_id}` с secret key.
3. Не полагаться только на JSON тела webhook.

Подпись HMAC в webhook **не документирована** для Basic Auth магазинов — модель «verify by API fetch».

### Поиск локальных записей

```
webhook.object.id → payments.provider_payment_id (provider = yookassa)
payments.order_id → orders.id
metadata.internal_order_id  — дополнительная сверка
metadata.internal_payment_id
```

### Сверки при succeeded

| Проверка | Источник истины |
|----------|-----------------|
| Статус | `GET` → `status === 'succeeded'` |
| Сумма | `amount.value` × 100 === `orders.amount_minor` |
| Валюта | `amount.currency === 'RUB'` === `orders.currency` |
| metadata.order | `metadata.internal_order_id === orders.id` |
| Повторная оплата | `payments.status !== 'succeeded'` до update |

### Неизвестный order / payment

| Ситуация | Действие |
|----------|----------|
| `provider_payment_id` не найден | Log + HTTP 200 (не раскрывать); ручная разборка |
| order не pending | HTTP 200; skip update (идемпотентность) |
| сумма не совпадает | **Не** переводить в paid; log critical; HTTP 200 |

### Повторный webhook

HTTP **200** всегда (после валидации).  
Если `payments.status === 'succeeded'` — no-op, не вызывать grant повторно (grant и так идемпотентен, но лишняя работа не нужна).

### HTTP-ответ

**200 OK**, пустое тело. Любой другой код → повторы 24 ч.

### Безопасные логи

Логировать: `event`, `provider_payment_id`, `order_id`, `payment_id`, `outcome`.  
**Не логировать:** secret key, полный webhook с PII, email покупателя, card data.

---

## 7. Транзакция подтверждения (succeeded)

### Порядок (service_role + SQL transaction)

```sql
BEGIN;

-- 1. Lock payment
SELECT * FROM payments WHERE id = :payment_id FOR UPDATE;

-- 2. Lock order
SELECT * FROM orders WHERE id = :order_id FOR UPDATE;

-- 3. Guard: payment not yet succeeded
IF payment.status = 'succeeded' THEN ROLLBACK; return ok;

-- 4. Verify amount/currency (from YooKassa GET, already done in app layer)

-- 5. UPDATE payments SET status = 'succeeded', confirmed_at = now(), provider_metadata = ...

-- 6. UPDATE orders SET status = 'paid', paid_at = now(), updated_at = now()

-- 7. SELECT grant_practice_purchase_access(:order_id)

COMMIT;
```

### Повторный webhook

Шаг 3: `payment.status === 'succeeded'` → commit no-op, HTTP 200.

### Grant

`grant_practice_purchase_access` требует `order.status = 'paid'` **до** вызова — обновлять order **перед** grant в той же транзакции.

---

## 8. Статусы: ЮKassa ↔ локальные

### Статусы ЮKassa (payment)

| ЮKassa | Описание | Локальный `payments.status` | Локальный `orders.status` |
|--------|----------|----------------------------|---------------------------|
| `pending` | Ожидает действий пользователя | `pending` | `pending` |
| `waiting_for_capture` | Двухстадийный холд | — (не используем в MVP) | — |
| `succeeded` | Успешно завершён | `succeeded` | `paid` |
| `canceled` | Отменён | `cancelled` | `pending` (разрешить retry) или `cancelled` |
| `refunded` (через refund object) | Возврат | `refunded` | `refunded` |

Локальный `failed`: при неуспехе до redirect (ошибка create, истёк срок) — маппинг с `canceled` + `cancellation_details`.

### Необходимые изменения статусов в БД

**На этом этапе миграции не создаём.** Вывод:

- Текущие CHECK на `payments` и `orders` **достаточны** для MVP.
- `waiting_for_capture` **не добавляем** (одностадийный capture).
- Отдельный `processing` **не нужен**.

---

## 9. Чек (54-ФЗ) — цифровая аудиопрактика

### Параметры для согласования (не заполнять самостоятельно)

| Параметр | Вопрос |
|----------|--------|
| Email покупателя | Брать из `auth.users.email` / `profiles.email`? |
| `description` | «Аудиопрактика: {practice_title_snapshot}»? |
| `quantity` | `1` |
| `amount` | Из `orders.amount_minor` → `"199.00"` |
| `payment_mode` | `full_payment` или `full_prepayment`? |
| `payment_subject` | `service` / `intellectual_activity` / иное? |
| `vat_code` | Зависит от режима ИП |
| Система налогообложения | УСН / патент / иное |
| Момент отправки чека | В запросе `POST /v3/payments` (рекомендация ЮKassa) |
| Чек при возврате | `POST /v3/refunds` + `receipt` |

### Вопросы к бухгалтеру / оператору ЮKassa

1. Какой **налоговый режим** у ИП Сергея на дату запуска?
2. Применяется ли **НДС**? Какой `vat_code` для цифрового контента?
3. Корректный **`payment_subject`** для записи аудиопрактики (услуга / РИД)?
4. **`payment_mode`**: полная оплата или предоплата?
5. Подтверждена ли модель **«Чеки от ЮKassa»** (не сторонняя касса)?
6. Достаточно ли **email** из аккаунта пользователя для доставки чека?
7. Нужны ли отдельные поля **ФФД 1.2** (`payment_subject_industry_details`)?
8. Процедура **чека возврата** при ручном refund MVP?

---

## 10. Metadata для ЮKassa

### Минимальный набор

```json
{
  "metadata": {
    "internal_order_id": "uuid",
    "internal_payment_id": "uuid",
    "integration_version": "audiolad-commerce-v1"
  }
}
```

### Не отправлять

- email / телефон (кроме блока `receipt`, если нужен для чека);
- `user_id` напрямую (достаточно internal_order_id);
- сумму как источник истины;
- секреты, service role, slug без необходимости.

---

## 11. Возврат (ручной MVP)

| Шаг | Ответственный | Действие |
|-----|---------------|----------|
| Инициация | Оператор / ИП | ЛК ЮKassa или `POST /v3/refunds` |
| Локальный payment | Сервер / оператор | `payments.status = refunded`, `refunded_at` |
| Локальный order | Сервер / оператор | `orders.status = refunded` |
| `user_practices` | **Решение открыто** | Рекомендация: ручной отзыв (`expires_at = now()` или DELETE) |
| История | БД | Не удалять строки orders/payments |

**Нельзя:** менять только `orders.status` в БД без сверки с ЮKassa.

---

## 12. Безопасность и секреты

### Переменные окружения (без значений)

| Переменная | Назначение |
|------------|------------|
| `YOOKASSA_SHOP_ID` | shopId |
| `YOOKASSA_SECRET_KEY` | Secret key API |
| `YOOKASSA_RETURN_URL_BASE` | База return_url, напр. `https://audiolad.ru/checkout/result` |
| `YOOKASSA_WEBHOOK_URL` | Публичный URL webhook (для документации/валидации) |
| `YOOKASSA_MODE` | `test` \| `live` — выбор endpoint/ключей |

Опционально: `YOOKASSA_WEBHOOK_IP_CHECK=true`

### Правила

| Правило | Деталь |
|---------|--------|
| Только server-side | Все `YOOKASSA_*` — **без** префикса `NEXT_PUBLIC_` |
| Test vs production | Разные shopId/secret; `YOOKASSA_MODE` переключает пару |
| Ротация ключей | Перевыпуск в ЛК → обновление `.env` → deploy → отзыв старого |
| Не логировать | secret key, Basic Auth, webhook body с PII |

Webhook route: **без** Supabase session; защита IP + server-side GET verify.

---

## 13. SDK vs прямой HTTP API

### Официальные факты

По документации «Использование SDK»: **официальных серверных SDK для Node.js нет**. Есть PHP, Python, community libraries (не проверены ЮKassa).

### Сравнение

| Критерий | Node SDK (community) | Прямой `fetch` к API |
|----------|---------------------|----------------------|
| Официальная поддержка | ❌ | ✅ (REST + OpenAPI) |
| Зависимость | +пакет, риск качества | Нет (встроенный fetch) |
| Idempotence-Key | Зависит от обёртки | Полный контроль заголовка |
| Типизация | Может быть | Ручные типы / OpenAPI codegen |
| Next.js route handlers | Совместимо | **Рекомендуется** |
| Webhook verify | Нет стандарта | `GET /v3/payments/{id}` |

### Рекомендация MVP

**Прямые HTTPS-запросы** (`fetch` + Basic Auth) в тонком адаптере `src/lib/payments/yookassa-client.ts`.  
Без установки community SDK до отдельного security review.

---

## 14. Изменения схемы `payments`

### Текущие поля (достаточность)

| Поле | MVP |
|------|-----|
| `provider` | ✅ `'yookassa'` |
| `provider_payment_id` | ✅ |
| `idempotency_key` | ✅ UNIQUE (provider, key) |
| `status` | ✅ |
| `amount_minor` | ✅ |
| `currency` | ✅ |
| `provider_metadata` | ✅ JSONB для URL, raw response |
| timestamps | ✅ |

### Оценка дополнительных полей

| Поле | Вердикт | Обоснование |
|------|---------|-------------|
| `confirmation_url` | **Желательно** | Удобный SELECT; MVP возможен через `provider_metadata` |
| `expires_at` | **Желательно** | Срок оплаты ЮKassa; MVP — в metadata |
| `provider_status` | **Желательно** | Отладка; MVP — в metadata |
| `last_webhook_at` | Не нужно сейчас | Ops/monitoring post-MVP |
| `receipt_status` | Не нужно сейчас | Статус в ЛК ЮKassa / metadata |

### Рекомендация по миграции

**Минимальная миграция (этап 1 реализации):** добавить `confirmation_url text NULL` — частый read path для `POST /api/payments` replay.  
Остальное — в `provider_metadata` до стабилизации.

---

## 15. Будущие API routes

| Route | Auth | Вход | Выход | Таблицы |
|-------|------|------|-------|---------|
| `POST /api/orders` | session | `{practice_slug}` | `{order}` | orders (RPC) |
| `POST /api/payments` | session | `{order_id}` | `{payment, confirmation_url}` | orders R, payments W |
| `GET /api/orders/[id]` | session | — | `{order status}` | orders R |
| `POST /api/payments/yookassa/webhook` | IP + verify | webhook JSON | HTTP 200 | payments W, orders W, user_practices W |

### POST /api/payments — ошибки

| Код | `error` |
|-----|---------|
| 401 | `unauthorized` |
| 400 | `invalid_request` |
| 404 | `order_not_found` |
| 409 | `order_already_paid`, `order_not_payable` |
| 502 | `payment_provider_error` |
| 500 | `internal_error` |

### GET /api/orders/[id]

Только свой order (RLS). Возврат: `id`, `status`, `practice_slug`, `amount_minor`, `currency`, `created_at`, `paid_at`. Без payment metadata.

---

## 16. Пользовательский UI (будущий)

```
/practice/[slug]
  → «Купить» (если !entitlement && price > 0)
  → loading
  → POST /api/orders
  → POST /api/payments
  → window.location = confirmation_url

/checkout/result?order_id=
  → «Проверяем оплату…»
  → poll GET /api/orders/{id}
  → paid: «Оплата прошла» + ссылка «Слушать»
  → pending (timeout): «Обрабатываем…» + поддержка
  → cancelled/failed: «Не удалось» + «Попробовать снова»

Уже куплено → «Слушать» (entitlement)
```

---

## 17. Тестовый план

### Unit

- Конвертация `amount_minor` ↔ `"199.00"` RUB
- Mapping статусов ЮKassa → local
- Idempotency key generation / replay logic
- Error mapping API → HTTP

### Integration

- Mock `fetch` ЮKassa (create, get)
- Webhook handler + duplicate webhook
- Transaction: paid + grant
- RLS: клиент не видит payments

### Test shop (ЛК ЮKassa)

- Успешная оплата тестовой картой
- Отмена на форме
- Webhook раньше redirect
- Redirect раньше webhook
- HTTP 500 + idempotency replay
- Повторное «Оплатить»

### Production smoke (после rollout)

1. Минимальная сумма (1 ₽ тестовая практика или staging)
2. Полный цикл order → payment → webhook → grant
3. Проверка чека в ЛК
4. Проверка `user_practices`
5. Откат по runbook при сбое

---

## 18. Порядок реализации (коммиты)

| # | Этап | Риск | Проверка |
|---|------|------|----------|
| 1 | Миграция `confirmation_url` (опционально) | Низкий | test DB only |
| 2 | `yookassa-client` (fetch adapter) | Средний | unit + mock |
| 3 | Payment service (provider-agnostic) | Средний | integration |
| 4 | `POST /api/payments` | Высокий | test shop |
| 5 | Webhook + transaction + grant | **Критический** | duplicate webhook tests |
| 6 | `GET /api/orders/[id]` | Низкий | RLS |
| 7 | Checkout UI + result page | Средний | E2E test shop |
| 8 | Staging + test shop E2E | Высокий | full cycle |
| 9 | Production migration + keys + smoke | **Критический** | 1 real payment |

---

## 19. Открытые вопросы

1. Налоговый режим ИП Сергея?
2. Ставка НДС / `vat_code`?
3. `payment_subject` для аудиопрактики?
4. `payment_mode`: `full_payment` vs `full_prepayment`?
5. Email для чека — из профиля достаточно?
6. «Чеки от ЮKassa» подтверждены в ЛК?
7. Production `return_url`: `https://audiolad.ru/checkout/result`?
8. Webhook URL и SSL на production?
9. Параметры тестового магазина (shopId) — кто владелец ЛК?
10. Автосписание / подписки — **вне MVP**?
11. Политика отзыва `user_practices` при refund?
12. При `payment.canceled` order остаётся `pending` или → `cancelled`?
13. Когда применять коммерческие миграции на production Supabase?

---

## 20. Итоговая рекомендация

### Интеграционная модель

**Самостоятельная интеграция по API** (Redirect + `capture: true` + Чеки от ЮKassa), без виджета/SDK на первом этапе.

### SDK

**Не использовать** community Node SDK. Прямой `fetch` к `https://api.yookassa.ru/v3/`.

### Изменения БД до кода

1. Применить коммерческие миграции на **staging** (не production до готовности).
2. Опционально: одна миграция `confirmation_url` на `payments`.
3. Остальное — `provider_metadata`.

### Первый безопасный технический этап

**После получения тестовых shopId/secret и налоговых параметров:**

1. Тонкий `yookassa-client` + payment service с mock-тестами.
2. Затем `POST /api/payments` против **тестового магазина**.

### Что нельзя делать до реквизитов

- Создавать реальные платежи
- Настраивать production webhook
- Фиксировать `vat_code` / `payment_subject`
- Применять коммерческие миграции к production
- Подключать зависимости SDK

---

## Подтверждения

- Код приложения **не изменялся**
- База данных **не изменялась**
- Production **не затрагивалась**
- Коммит **не создавался**
- Реализация **не начата**
