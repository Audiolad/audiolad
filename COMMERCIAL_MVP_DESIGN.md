# COMMERCIAL_MVP_DESIGN.md — проектирование коммерческого контура MVP

Технический проект минимального коммерческого контура «АудиоЛад».  
**Только анализ и проектирование** — код, база данных и интеграции **не изменялись**.

Дата: 2026-07-13.  
Опора: фактическая схема (`DATABASE_SCHEMA.md`, `supabase/baseline/`), текущий код приложения.

---

## 1. Текущее состояние

### `practices`

| Аспект | Факт |
|--------|------|
| **Назначение сейчас** | Карточка аудиопрактики: метаданные, цена, публикация, путь к аудио |
| **Где используется** | `/catalog`, `/practice/[slug]`, `/listen/[slug]`, `/my-practices` |
| **Сохранить в MVP?** | **Да** — единственный каталог продаваемого контента |
| **Ограничения** | Цена в поле `price` (integer, RUB); нет истории цен; нет отдельной сущности «товар»; `is_free` и `price` не связаны CHECK-ом |

### `purchases`

| Аспект | Факт |
|--------|------|
| **Назначение сейчас** | Задел под историю платежей (таблица пустая) |
| **Поля** | `id`, `user_id`, `practice_id`, `amount`, `status` (default `'paid'`), `created_at` |
| **Где используется** | **Нигде в production-коде**; `/purchases` — статичные демо-данные |
| **Сохранить в MVP?** | **Нет как рабочий контур** — недостаточна для заказа/оплаты/webhook |
| **Ограничения** | Нет FK `user_id → auth.users`; нет provider/idempotency; нет жизненного цикла заказа; `status` без CHECK; смешивает «покупку» и «оплату»; default `'paid'` опасен |

### `user_practices`

| Аспект | Факт |
|--------|------|
| **Назначение сейчас** | Entitlement + личная библиотека, отделена от финансов |
| **Где используется** | `/my-practices`, `/listen/[slug]`, `/practice/[slug]` (badge доступа) |
| **Сохранить в MVP?** | **Да** — уже спроектирована как слой доступа |
| **Ограничения** | Клиент может только SELECT; grant только через SECURITY DEFINER; `access_source = 'purchase'` предусмотрен, но pipeline не реализован; UNIQUE `(user_id, practice_id)` |

### `profiles`

| Аспект | Факт |
|--------|------|
| **Назначение** | Профиль пользователя (`id = auth.users.id`) |
| **Где используется** | `/profile`, `/profile/edit`, `/settings` |
| **Сохранить в MVP?** | **Да** |
| **Ограничения** | Роль `'listener'`; нет связи с `authors`; не используется в коммерции |

### `authors`

| Аспект | Факт |
|--------|------|
| **Назначение** | Авторский бренд контента |
| **Где используется** | Nested select из `practices`; статичные `/authors/*` |
| **Сохранить в MVP?** | **Да** (без изменений) |
| **Ограничения** | Нет связи с пользователем; автор не видит заказы |

### `starter_practices`

| Аспект | Факт |
|--------|------|
| **Назначение** | Конфигурация стартового набора при регистрации |
| **Где используется** | Только SQL (`grant_active_starter_practices`, `handle_new_user`) |
| **Сохранить в MVP?** | **Да** |
| **Ограничения** | Не пересекается с покупками, если grant идемпотентен |

### Цена и доступ сегодня

| Механизм | Реализация |
|----------|------------|
| **Поля цены** | `practices.price` (integer), `practices.is_free` (boolean) |
| **Отображение** | `/catalog`, `/practice/[slug]` — `formatPriceLabel()` |
| **Функции grant** | `grant_active_starter_practices(uuid)` — starter; отдельной purchase-grant **нет** |
| **Проверка доступа** | `/listen/[slug]`: `user_practices` по `practice_id` + `expires_at`; Storage RLS дублирует проверку |
| **Библиотека** | `/my-practices`: SELECT `user_practices` + join `practices`; отдельной таблицы библиотеки нет |
| **Покупка в UI** | Кнопка «Покупка скоро появится» (disabled) на `/practice/[slug]`; `/checkout/personal-boundaries` — статичный макет |

### API и серверная логика

- `src/app/api/` — **отсутствует**
- Server Actions — только `profile/edit`, `auth/sign-out`
- Подтверждение оплаты с клиента **невозможно** без новых server routes

---

## 2. Главный архитектурный вопрос

> Можно ли безопасно реализовать MVP-покупку на `practices` + `purchases` + `user_practices`?

**Краткий ответ:** entitlement (`user_practices`) и каталог (`practices`) — да; таблица `purchases` в текущем виде — **нет**, без существенного расширения, фактически равного введению `orders` + `payments`.

### Вариант A — использовать текущие таблицы

`practices` + `purchases` + `user_practices`

| Критерий | Оценка |
|----------|--------|
| **Плюсы** | Минимум новых таблиц; `user_practices` уже готова; `access_source = 'purchase'` уже в CHECK |
| **Минусы** | `purchases` не разделяет заказ и платёж; нет pending/failed lifecycle; нет provider/webhook полей; нет idempotency; нет snapshot цены; нет FK на `user_id` |
| **Риски** | Двойная выдача доступа; невозможность безопасного webhook; «оплата по умолчанию paid»; нельзя обработать повторный webhook |
| **Объём изменений** | Фактически переписать `purchases` + добавить 10+ полей + функции — почти новая таблица под старым именем |
| **MVP** | ⚠️ Технически возможно, но **небезопасно** |
| **Будущее** (программы, подписки, наборы) | ❌ Плохо масштабируется |
| **Переход дальше** | Придётся вводить orders/payments и мигрировать «псевдо-purchases» |

### Вариант B — минимально расширить модель (рекомендуется)

`practices` + **`orders`** + **`payments`** + `user_practices`  
(таблица `purchases` **не используется** в MVP-потоке; остаётся legacy/пустая)

| Критерий | Оценка |
|----------|--------|
| **Плюсы** | Чёткое разделение: заказ ↔ платёж ↔ доступ; webhook на `payments`; идемпотентность; snapshot цены в заказе; мало таблиц |
| **Минусы** | 2 новые таблицы; нужны server routes и SECURITY DEFINER grant |
| **Риски** | Умеренные, контролируемые при транзакциях и UNIQUE |
| **Объём изменений** | Средний: 2 таблицы, 1–2 функции, 2–3 API routes, правки UI |
| **MVP** | ✅ Оптимален |
| **Будущее** | ✅ Добавление `order_items`, bundles, subscriptions без ломки entitlement |
| **Переход дальше** | `order_items` для наборов; `products`/`prices` — опционально позже |

### Вариант C — полный коммерческий контур

`products`, `prices`, `orders`, `order_items`, `payments`, `entitlements`

| Критерий | Оценка |
|----------|--------|
| **Плюсы** | Максимальная гибкость; отдельный entitlement-слой; мульти-валюта; промо |
| **Минусы** | Избыточен для «одна практика = одна покупка»; дублирует `user_practices`; долгая реализация |
| **Риски** | Переусложнение MVP; риск не дойти до релиза |
| **Объём изменений** | Большой |
| **MVP** | ❌ Не рекомендуется сейчас |
| **Будущее** | ✅ Идеален для зрелого маркетплейса |
| **Переход** | Потребует миграции с `user_practices` или параллельного слоя |

### Рекомендация для MVP

**Вариант B:** добавить `orders` и `payments`, сохранить `practices` и `user_practices`, **не использовать** текущую `purchases` в runtime MVP (позже — view/миграция или удаление после согласования).

---

## 3. Рекомендуемая модель MVP

### Сохраняемые таблицы (без структурных изменений в первом этапе)

- `practices` — каталог и текущая цена
- `user_practices` — entitlement / библиотека
- `profiles`, `authors`, `starter_practices` — без изменений
- `purchases` — **не участвует** в MVP pipeline

### Новая таблица: `orders`

| Поле | Тип | Nullable | Default | Назначение |
|------|-----|----------|---------|------------|
| `id` | `uuid` | NO | `gen_random_uuid()` | PK заказа |
| `user_id` | `uuid` | NO | — | Покупатель; FK → `auth.users(id)` ON DELETE RESTRICT |
| `practice_id` | `uuid` | NO | — | Практика; FK → `practices(id)` ON DELETE RESTRICT |
| `status` | `text` | NO | `'pending'` | Жизненный цикл заказа |
| `amount` | `integer` | NO | — | Сумма к оплате в минимальных единицах (копейки) или рублях — **зафиксировать единицу в миграции** |
| `currency` | `text` | NO | `'RUB'` | Валюта ISO 4217 |
| `practice_title_snapshot` | `text` | NO | — | Название на момент заказа |
| `practice_price_snapshot` | `integer` | NO | — | Цена на момент заказа |
| `client_request_id` | `text` | YES | — | Idempotency от клиента (двойной клик «Купить») |
| `created_at` | `timestamptz` | NO | `now()` | Создание |
| `updated_at` | `timestamptz` | NO | `now()` | Последнее изменение |
| `paid_at` | `timestamptz` | YES | — | Успешная оплата |
| `cancelled_at` | `timestamptz` | YES | — | Отмена |
| `metadata` | `jsonb` | NO | `'{}'` | Служебные данные (без PII провайдера) |

**Ключи и ограничения:**

- PK: `id`
- FK: `user_id`, `practice_id`
- UNIQUE: `(user_id, practice_id)` WHERE `status IN ('pending', 'awaiting_payment')` — **один активный заказ на практику** (partial unique index)
- UNIQUE: `(user_id, client_request_id)` WHERE `client_request_id IS NOT NULL`
- CHECK `status`: `pending`, `awaiting_payment`, `paid`, `failed`, `cancelled`, `refunded`
- CHECK `amount > 0` для платных заказов
- INDEX: `(user_id, created_at DESC)`, `(practice_id)`, `(status)` WHERE active

**Статусы заказа (MVP):**

| Статус | Нужен в v1 | Смысл |
|--------|------------|-------|
| `pending` | ✅ | Создан, платёж ещё не инициирован |
| `awaiting_payment` | ✅ | Платёж создан у провайдера, ждём webhook |
| `paid` | ✅ | Оплата подтверждена, доступ выдан |
| `failed` | ✅ | Платёж не прошёл |
| `cancelled` | ✅ | Отменён до оплаты / таймаут |
| `refunded` | ⚠️ опционально v1 | Возврат; для MVP может обрабатываться вручную |

### Новая таблица: `payments`

| Поле | Тип | Nullable | Default | Назначение |
|------|-----|----------|---------|------------|
| `id` | `uuid` | NO | `gen_random_uuid()` | PK платежа |
| `order_id` | `uuid` | NO | — | FK → `orders(id)` ON DELETE RESTRICT |
| `provider` | `text` | NO | — | Код провайдера (`yookassa`, `test`, …) |
| `provider_payment_id` | `text` | YES | — | ID платежа у провайдера |
| `idempotency_key` | `text` | NO | — | Ключ идемпотентности (уникальный) |
| `status` | `text` | NO | `'pending'` | Статус платежа |
| `amount` | `integer` | NO | — | Сумма (должна совпадать с order) |
| `currency` | `text` | NO | `'RUB'` | Валюта |
| `provider_metadata` | `jsonb` | NO | `'{}'` | Raw ответ провайдера (**только server**) |
| `created_at` | `timestamptz` | NO | `now()` | Создание |
| `updated_at` | `timestamptz` | NO | `now()` | Обновление |
| `confirmed_at` | `timestamptz` | YES | — | Успех |
| `failed_at` | `timestamptz` | YES | — | Неудача |
| `refunded_at` | `timestamptz` | YES | — | Возврат |

**Ключи и ограничения:**

- PK: `id`
- FK: `order_id` → `orders`
- UNIQUE: `idempotency_key`
- UNIQUE: `(provider, provider_payment_id)` WHERE `provider_payment_id IS NOT NULL`
- CHECK `status`: `pending`, `processing`, `succeeded`, `failed`, `cancelled`, `refunded`
- INDEX: `(order_id)`, `(status)`

### Функция выдачи доступа (проект, не реализация)

`grant_practice_purchase_access(p_order_id uuid)` — SECURITY DEFINER:

1. Проверить `orders.status = 'paid'`
2. `INSERT INTO user_practices (user_id, practice_id, access_source, metadata)`  
   `VALUES (..., 'purchase', jsonb_build_object('order_id', ..., 'payment_id', ...))`  
   `ON CONFLICT (user_id, practice_id) DO NOTHING`
3. Идемпотентна при повторном webhook

### Таблица `user_practices` — без изменения схемы

- `access_source = 'purchase'`
- `metadata.order_id`, `metadata.payment_id` — связь с коммерцией
- UNIQUE `(user_id, practice_id)` — защита от дублей

---

## 4. Заказ

| Вопрос | Решение MVP |
|--------|-------------|
| **Когда создаётся** | После нажатия «Купить» на `/practice/[slug]` (server action или API), пользователь авторизован |
| **Владелец** | `auth.uid()` → `orders.user_id` |
| **Сумма** | Сервер читает `practices.price` / `is_free`; для платных `amount = price` (единица — см. открытые вопросы) |
| **Валюта** | `RUB` по умолчанию; поле обязательно для будущего |
| **Snapshot названия** | **Да** — `practice_title_snapshot` |
| **Snapshot цены** | **Да** — `practice_price_snapshot`; защита от смены цены после создания заказа |
| **Изменение после создания** | Только статус (server/webhook); сумма и практика **immutable** |
| **Статусы v1** | `pending`, `awaiting_payment`, `paid`, `failed`, `cancelled` (+ `refunded` при ручном процессе) |

---

## 5. Платёж

| Вопрос | Решение |
|--------|---------|
| **Отдельная сущность?** | **Да** — `payments` отдельно от `orders` |
| **Почему** | Webhook обновляет payment; один заказ может иметь повторные попытки (v2); idempotency на уровне provider event |
| **provider** | Текстовый код адаптера |
| **provider_payment_id** | ID из ответа провайдера; UNIQUE с `provider` |
| **idempotency_key** | UUID на создание платежа + ключ webhook event |
| **provider_metadata** | JSONB; **не отдавать клиенту** |
| **confirmed_at / failed_at / refunded_at** | Явные метки для аудита |

### Почему нельзя подтверждать оплату только из браузера

1. Клиент может подделать redirect/callback.
2. Сеть обрывается после успеха у провайдера, но до возврата в приложение.
3. Webhook — единственный надёжный источник `succeeded`.
4. Return URL — только для UX (poll статуса заказа), не для grant.

**Единственный триггер выдачи доступа:** server-side обработка webhook (или test adapter) → транзакция → `paid` + grant.

---

## 6. Выдача доступа

```text
payment.status = succeeded (webhook)
  → order.status = paid
  → grant_practice_purchase_access(order_id)
  → user_practices INSERT (access_source = 'purchase')
  → библиотека /my-practices
  → /listen/[slug] разрешён
```

| Вопрос | Решение |
|--------|---------|
| **Отдельная entitlement-таблица?** | **Нет** в MVP — `user_practices` достаточна |
| **Повторный доступ** | `ON CONFLICT (user_id, practice_id) DO NOTHING` |
| **UNIQUE** | Существующий `(user_id, practice_id)` |
| **Источник** | `access_source = 'purchase'` |
| **Starter** | Не затрагивается; отдельный pipeline через `grant_active_starter_practices` |
| **Ручная выдача** | `access_source = 'admin'` через service role / admin function (вне MVP UI) |
| **Подарок (будущее)** | `access_source = 'gift'`; отдельный grant без order |

---

## 7. Идемпотентность

| Сценарий | Ожидаемое поведение |
|----------|---------------------|
| **Повторный webhook** | Payment уже `succeeded` → no-op; grant не дублируется |
| **Повторный callback (browser)** | Poll order status; UI обновляется; grant уже есть |
| **Двойной клик «Купить»** | `client_request_id` или partial UNIQUE → один `pending` order |
| **Повторное создание заказа** | Если есть `paid` order / `user_practices` → вернуть «already purchased» |
| **Повторная выдача доступа** | UNIQUE + `ON CONFLICT DO NOTHING` |
| **Таймаут сети после оплаты** | Webhook всё равно приходит; пользователь видит `paid` после refresh/poll |
| **Успех у провайдера, ошибка приложения** | Webhook повторяется; транзакция идемпотентна |

Все критические операции — в **одной DB-транзакции**: update payment → update order → grant.

---

## 8. Webhook (проект)

| Элемент | Спецификация |
|---------|--------------|
| **Маршрут** | `POST /api/webhooks/payments/{provider}` |
| **Аутентификация** | Проверка подписи провайдера (HMAC / shared secret в env) |
| **Поиск платежа** | По `provider_payment_id` или `idempotency_key` из payload |
| **Валидация** | `amount` и `currency` совпадают с `orders`/`payments` |
| **Статус** | Обрабатывать только терминальные события (`succeeded`, `failed`, `cancelled`) |
| **Транзакция** | BEGIN → lock payment row → update → update order → grant → COMMIT |
| **Повтор** | 200 OK даже при no-op (идемпотентность) |
| **Событие** | Запись в log / опционально `metadata`; таблица `events` — не в v1 |
| **Ошибки** | 4xx только при невалидной подписи; 5xx → провайдер ретраит |

---

## 9. Пользовательский путь

1. Пользователь открывает `/practice/{slug}` — видит цену или «Доступ открыт».
2. Платная практика без доступа — кнопка **«Купить»** (вместо disabled «Покупка скоро появится»).
3. Гость → redirect `/auth/sign-in?next=/practice/{slug}` (уже работает для приватных путей; practice публична — sign-in при checkout).
4. Server создаёт `order` (`pending`).
5. Server создаёт `payment`, возвращает URL формы провайдера.
6. Пользователь платит на стороне провайдера.
7. Webhook → `paid` + grant.
8. Return URL → `/checkout/{orderId}` или `/practice/{slug}?order={id}`.
9. UI poll: `order.status === 'paid'` → показать успех.
10. `/my-practices` — практика с badge «Куплено».
11. Кнопка **«Слушать»** → `/listen/{slug}` (уже реализовано при entitlement).

### Состояния UI

| Состояние | UX |
|-----------|-----|
| **pending / awaiting_payment** | «Ожидаем подтверждение оплаты» + кнопка обновить |
| **failed** | «Оплата не прошла» + «Попробовать снова» (новый payment к тому же order или новый order — решить в реализации) |
| **already purchased** | Badge «Доступ открыт» / «Куплено»; кнопка «Слушать» |
| **Refresh страницы** | Server read `user_practices` + `orders` → корректное состояние |
| **Другое устройство** | После входа — entitlement виден через `user_practices` |

---

## 10. Безопасность

| Операция | Только сервер |
|----------|---------------|
| Создание order | ✅ Server Action / API + `auth.uid()` |
| Установка amount | ✅ Из `practices.price`, не от клиента |
| Создание payment у провайдера | ✅ Server |
| Подтверждение оплаты | ✅ Webhook only |
| Grant `user_practices` | ✅ SECURITY DEFINER function |
| Чтение `provider_metadata` | ✅ Server only |

| Риск | Митигация |
|------|-----------|
| Цена от клиента | Игнорировать; брать из БД |
| `user_id` от клиента | Только `auth.uid()` на сервере |
| Владелец заказа | RLS: `orders.user_id = auth.uid()` |
| Webhook подделка | Подпись провайдера |
| Утечка metadata | Нет SELECT policy на `payments` для client |
| Прямой INSERT в `user_practices` | Нет client policy (уже так) |
| Прямой UPDATE `orders.status = paid` | Нет client policy |

**Не доступны клиенту напрямую:** `payments` (write), `grant_*` functions, webhook route secrets.

---

## 11. RLS (будущие политики, не создавать сейчас)

### `orders`

| Политика | Операция | Условие |
|----------|----------|---------|
| Users view own orders | SELECT | `auth.uid() = user_id` |
| Users create own pending order | INSERT | `WITH CHECK (auth.uid() = user_id AND status = 'pending')` — **или только server** |
| Client update status | — | **Запрещено** |
| Service role | ALL | Полный доступ для webhook |

**Рекомендация MVP:** INSERT/UPDATE orders **только через service role / SECURITY DEFINER**, клиенту — SELECT own.

### `payments`

| Политика | Операция |
|----------|----------|
| Client SELECT | **Нет** (или только `id, status, order_id` без metadata — опционально) |
| Client WRITE | **Нет** |

### `user_practices`

Без изменений: SELECT own; INSERT только DEFINER.

---

## 12. Интеграция с текущим UI

| Место | Сейчас | Изменения (будущие) |
|-------|--------|---------------------|
| **Цена** | `/catalog`, `/practice/[slug]` — `price`, `is_free` | Без изменений отображения |
| **Купить** | `/practice/[slug]` — disabled «Покупка скоро появится» | Активная кнопка → checkout flow |
| **Слушать** | `/practice/[slug]` — Link при `audioReady` + entitlement | Показывать при `user_practices` active |
| **Уже куплено** | `activeEntitlement` на practice page | `user_practices` + optional `orders.status = paid` |
| **Checkout** | `/checkout/personal-boundaries` — статичный макет | Обобщить: `/checkout/[orderId]` или `/practice/[slug]/checkout` |
| **Библиотека** | `/my-practices` — уже читает `user_practices` | Play → `/listen/{slug}` (отдельная задача) |
| **История покупок** | `/purchases` — демо | Подключить к `orders` WHERE `status = paid` |
| **Компоненты** | `practice/[slug]/page.tsx` | Кнопка покупки, состояния order; возможно shared `PurchaseButton` |

**Не менять в этом этапе:** layout, дизайн, `author-dashboard`, плеер, каталог.

---

## 13. Выбор платёжного провайдера

Окончательный выбор — **отдельное исследование**. Требования к интеграции:

| Требование | Важность |
|------------|----------|
| Российские карты | Обязательно |
| СБП | Желательно |
| Webhook с подписью | Обязательно |
| Тестовый режим | Обязательно |
| Возвраты API | Желательно (MVP может вручную) |
| Чеки / 54-ФЗ | Уточнить у владельца |
| Идемпотентность API | Обязательно |
| Документация | Обязательно |
| Recurrent (будущее) | Не блокирует MVP |

**Независимость от провайдера:**

- Адаптер `PaymentProvider` (interface): `createPayment`, `parseWebhook`, `verifySignature`
- `payments.provider` + `provider_metadata` — хранят специфику
- Суммы и статусы — внутренние enum, маппинг в адаптере

Кандидаты для исследования: ЮKassa, Robokassa, CloudPayments, Тинькофф — **без выбора в этом документе**.

---

## 14. События

### Минимальный набор бизнес-событий

| Событие | MVP |
|---------|-----|
| `checkout.started` | Log / `orders.created_at` |
| `order.created` | Строка `orders` |
| `payment.pending` | Строка `payments` |
| `payment.succeeded` | `payments.confirmed_at` |
| `payment.failed` | `payments.failed_at` |
| `access.granted` | Строка `user_practices` + `metadata` |
| `purchase.refunded` | `orders.status = refunded` (ручной v1) |

### Таблица `events` сейчас?

**Нет** для первого релиза. Достаточно:

- полей `orders` / `payments` / `user_practices.metadata`
- structured server logs
- webhook audit в `provider_metadata`

Таблица `events` — этап 2 (коммуникации, аналитика, MAX/email).

---

## 15. Возвраты и отзыв доступа

| Вопрос | MVP |
|--------|-----|
| **Refund** | Ручной процесс через admin/service role |
| **Автоотзыв `user_practices`** | **Рекомендуется** при `refunded`: DELETE или `expires_at = now()` |
| **Прослушанный материал** | Отзыв доступа ≠ удаление истории; история прослушивания пока не ведётся |
| **Кто решает** | Владелец продукта / support |
| **История** | `orders.status = refunded`, `payments.refunded_at` |
| **Статусы** | `refunded` на order и payment |

---

## 16. Совместимость с будущим фундаментом

| Направление | Тупик? | Комментарий |
|-------------|--------|-------------|
| Несколько авторов | Нет | `practices.author_id` уже есть |
| Несколько проектов | Нет | Добавить `project_id` позже |
| Программы / наборы | Нет | `order_items` + bundle entity |
| Подписки | Нет | `expires_at` в `user_practices` уже есть |
| Подарки | Нет | `access_source = 'gift'` |
| Промокоды | Нет | Таблица `promo_codes` + скидка в order |
| Несколько цен | Нет | Таблица `prices` позже; snapshot в order |
| Валюты | Нет | `currency` в order/payment |
| Возвраты | Нет | Статусы заложены |
| Мобильное приложение | Нет | Тот же API + deep link |
| Смена провайдера | Нет | Адаптерная модель |

Рекомендуемая модель **не блокирует** эволюцию.

---

## 17. Рекомендуемые этапы реализации

| # | Этап | Файлы / таблицы | Риск | Проверка | Коммит |
|---|------|-----------------|------|----------|--------|
| 1 | Миграция `orders` + `payments` + RLS | `supabase/migrations/`, baseline update позже | Средний | Пустая DB / staging | `feat(db): add orders and payments tables` |
| 2 | `grant_practice_purchase_access()` | SQL migration | Высокий | Unit SQL test | `feat(db): add purchase grant function` |
| 3 | Server: создание заказа | `src/app/api/orders/` или Server Action | Средний | Auth user → order row | `feat(commerce): create order server endpoint` |
| 4 | Test payment adapter | `src/lib/payments/test/` | Низкий | Fake succeeded webhook | `feat(commerce): test payment provider` |
| 5 | Webhook route | `src/app/api/webhooks/payments/[provider]/` | **Высокий** | Idempotent double POST | `feat(commerce): payment webhook handler` |
| 6 | Grant в webhook | SQL + API | **Высокий** | paid → user_practices | (в том же или след. коммите) |
| 7 | UI: кнопка «Купить» | `practice/[slug]/page.tsx` | Низкий | Guest redirect, auth flow | `feat(ui): enable practice purchase button` |
| 8 | Checkout / result page | `checkout/[orderId]/` или dynamic | Средний | pending/paid/failed states | `feat(ui): checkout status page` |
| 9 | `/purchases` real data | `purchases/page.tsx` | Низкий | Lists paid orders | `feat(ui): connect purchases history` |
| 10 | E2E smoke | manual | **Высокий** | Полный сценарий MVP | — |
| 11 | Real provider | `src/lib/payments/yookassa/` (пример) | **Высокий** | Test mode cards | Отдельный коммит после согласования |

---

## 18. Открытые вопросы (до реализации)

1. **Одна практика за заказ или набор?** MVP предполагает 1:1; подтвердить с владельцем.
2. **Цена в рублях целым числом или копейках?** Сейчас `practices.price` — integer (похоже на рубли); зафиксировать.
3. **Какой платёжный провайдер?** Отдельное исследование.
4. **Нужны ли онлайн-чеки (54-ФЗ)?** Влияет на провайдера и поля заказа (email, ИНН).
5. **Автоматическая фискализация?** Юридический вопрос.
6. **Возвраты в v1 автоматом или вручную?** Рекомендация: вручную.
7. **Валюта кроме RUB?** MVP: только RUB.
8. **Ручная выдача доступа?** Нужна ли admin-операция в v1?
9. **Промокод / бесплатная выдача?** Вне MVP.
10. **Автор видит заказы?** Сейчас нет связи author ↔ user; вне MVP.
11. **Юридический продавец?** ИП/ООО — влияет на оферту и чеки.
12. **Судьба таблицы `purchases`?** Deprecate, view на orders, или миграция данных?
13. **Return URL после оплаты?** `/practice/{slug}` vs `/checkout/{orderId}`.

---

## 19. Итоговая рекомендация

### Модель для MVP

**Вариант B:** `practices` + **`orders`** + **`payments`** + **`user_practices`**

### Сохранить

- `practices` — каталог и текущая цена
- `user_practices` — entitlement и библиотека
- `profiles`, `authors`, `starter_practices`
- Существующие grant-функции starter/signup

### Добавить

- `orders` — жизненный цикл покупки со snapshot цены
- `payments` — провайдер, webhook, idempotency
- `grant_practice_purchase_access()` — SECURITY DEFINER
- Server API: create order, webhook, (optional) get order status
- Payment provider adapter (сначала test)

### Не создавать сейчас

- `products`, `prices`, `order_items` (до наборов)
- Отдельная `entitlements`
- Таблица `events`
- Использование legacy `purchases` в runtime
- Подписки, промокоды, авторская аналитика продаж

### Первый безопасный технический этап после согласования

**Этап 1:** SQL-миграция `orders` + `payments` + RLS-политики (только SELECT own для orders; payments без client access) на **staging**, без подключения UI и без production deploy.

---

*Документ подготовлен для согласования с владельцем и архитектором перед любой реализацией.*
