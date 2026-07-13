# COMMERCIAL_MIGRATION_VALIDATION.md

Валидация инкрементальной миграции коммерческого фундамента MVP.  
Дата: 2026-07-13.

**Production-база (`postgres`) не затрагивалась.**  
Миграция применена только к тестовой БД `audiolad_baseline_test`.

---

## Миграция

| Параметр | Значение |
|----------|----------|
| Файл | `supabase/migrations/20260713120000_create_commercial_mvp_core.sql` |
| Модель применения | **One-shot** (стандартная Supabase-миграция; повторный `CREATE` упадёт) |
| Baseline | **Не изменялся** |
| Legacy `purchases` | Таблица **не изменена**; добавлен только `COMMENT ON TABLE` |

### Продуктовые решения (зафиксированы)

- Продавец: ИП Сергей
- Провайдер (будущий): ЮKassa; схема provider-agnostic
- 1 практика = 1 заказ; RUB only; возвраты вручную
- `practices` — карточка и текущая цена (`price` integer, рубли)
- `user_practices` — entitlement / библиотека
- Legacy `purchases` **не используется** в новом потоке

### Анализ перед миграцией

| Объект | Факт | Решение |
|--------|------|---------|
| `practices.id` | `uuid` | FK `orders.practice_id` |
| `practices.price` | `integer` (рубли) | Snapshot → `price_minor_snapshot` (копейки = price × 100 при создании заказа на сервере) |
| `profiles.id` | `uuid` = `auth.users.id` | FK `orders.user_id` → **`auth.users(id)`** (как `user_practices`) |
| `user_practices` UNIQUE | `(user_id, practice_id)` | Идемпотентность grant |
| Grant-паттерн | `SECURITY DEFINER`, `search_path = public, pg_temp`, REVOKE от anon/authenticated | Соблюдён |
| `updated_at` trigger | **Отсутствует** в проекте | Колонки `updated_at` без триггера (обновление — серверный контур) |
| Статус `awaiting_payment` | Не обязателен для MVP | **Не добавлен**; `pending` покрывает ожидание оплаты |

### Модель денег

| Поле | Назначение |
|------|------------|
| `amount_minor` | **Каноническая** сумма к оплате (копейки, `BIGINT`) |
| `price_minor_snapshot` | Неизменяемый снимок list price при создании заказа (копейки) |
| `currency` | `'RUB'` (CHECK) |

Дублирования «две суммы без смысла» нет: `amount_minor` — платёж; `price_minor_snapshot` — аудит каталожной цены.

---

## Таблица `orders`

| Поле | Тип | Nullable | Default |
|------|-----|----------|---------|
| `id` | `uuid` | NO | `gen_random_uuid()` |
| `user_id` | `uuid` | NO | FK → `auth.users(id)` RESTRICT |
| `practice_id` | `uuid` | NO | FK → `practices(id)` RESTRICT |
| `status` | `text` | NO | `'pending'` |
| `amount_minor` | `bigint` | NO | — |
| `currency` | `text` | NO | `'RUB'` |
| `practice_title_snapshot` | `text` | NO | — |
| `practice_slug_snapshot` | `text` | NO | — |
| `price_minor_snapshot` | `bigint` | NO | — |
| `idempotency_key` | `text` | YES | — |
| `created_at` | `timestamptz` | NO | `now()` |
| `updated_at` | `timestamptz` | NO | `now()` |
| `paid_at` | `timestamptz` | YES | — |
| `cancelled_at` | `timestamptz` | YES | — |
| `failed_at` | `timestamptz` | YES | — |
| `refunded_at` | `timestamptz` | YES | — |

**Статусы:** `pending`, `paid`, `cancelled`, `failed`, `refunded`

**Индексы:**

- UNIQUE `idempotency_key` WHERE NOT NULL
- UNIQUE `(user_id, practice_id)` WHERE `status = 'pending'`
- `(user_id, created_at DESC)`, `(practice_id)`, `(status)`

**CHECK:** `amount_minor > 0`, `price_minor_snapshot > 0`, `currency = 'RUB'`, согласованность status ↔ timestamp полей

---

## Таблица `payments`

| Поле | Тип | Nullable | Default |
|------|-----|----------|---------|
| `id` | `uuid` | NO | `gen_random_uuid()` |
| `order_id` | `uuid` | NO | FK → `orders(id)` RESTRICT |
| `provider` | `text` | NO | — |
| `provider_payment_id` | `text` | YES | — |
| `idempotency_key` | `text` | NO | — |
| `status` | `text` | NO | `'pending'` |
| `amount_minor` | `bigint` | NO | — |
| `currency` | `text` | NO | `'RUB'` |
| `provider_metadata` | `jsonb` | NO | `'{}'` |
| `created_at` | `timestamptz` | NO | `now()` |
| `updated_at` | `timestamptz` | NO | `now()` |
| `confirmed_at` | `timestamptz` | YES | — |
| `failed_at` | `timestamptz` | YES | — |
| `refunded_at` | `timestamptz` | YES | — |

**Статусы:** `pending`, `succeeded`, `cancelled`, `failed`, `refunded`

**Индексы:**

- UNIQUE `(provider, provider_payment_id)` WHERE `provider_payment_id IS NOT NULL`
- UNIQUE `(provider, idempotency_key)`
- `(order_id)`, `(status)`, `(created_at DESC)`

---

## Функция `grant_practice_purchase_access(p_order_id uuid)`

| Свойство | Значение |
|----------|----------|
| Тип | `SECURITY DEFINER` |
| `search_path` | `public, pg_temp` |
| Доступ | REVOKE от PUBLIC, anon, authenticated |
| Contract marker | `audiolad:purchase-grant:v1` (в COMMENT) |
| Возврат | `jsonb` с `inserted`, `order_id`, `user_id`, `practice_id` |

**Поведение:**

1. `SELECT ... FOR UPDATE` заказа по `p_order_id`
2. Проверка `status = 'paid'`
3. `user_id` / `practice_id` **только из строки заказа** (входные параметры пользователя не принимаются)
4. `INSERT INTO user_practices` с `access_source = 'purchase'`, `metadata.order_id`
5. `ON CONFLICT (user_id, practice_id) DO NOTHING`

---

## RLS

### `orders`

| Операция | anon / authenticated | service_role |
|----------|----------------------|--------------|
| SELECT own | ✅ policy `auth.uid() = user_id` | ✅ bypass |
| INSERT | ❌ нет GRANT | ✅ |
| UPDATE | ❌ `permission denied` (проверено) | ✅ |
| DELETE | ❌ | ✅ |

Клиент **не создаёт** заказы прямым INSERT (рекомендация MVP соблюдена).

### `payments`

| Операция | anon / authenticated | service_role |
|----------|----------------------|--------------|
| SELECT | ❌ `permission denied` | ✅ |
| INSERT | ❌ `permission denied` | ✅ |
| UPDATE / DELETE | ❌ | ✅ |

**Политик для клиента нет** — `provider_metadata` недоступна напрямую.  
Безопасное пользовательское представление платежей (view) — **будущий шаг**.

---

## Результаты тестов (`audiolad_baseline_test`)

| # | Сценарий | Результат |
|---|----------|-----------|
| 1 | Таблицы `orders`, `payments` созданы | ✅ |
| 2 | Повторное применение миграции | ⚠️ One-shot: повторный запуск упадёт на `CREATE TABLE` (ожидаемо) |
| 3 | Пользователь видит только свои orders (RLS) | ✅ `count = 1` для user A |
| 4 | Пользователь не может UPDATE order → paid | ✅ `permission denied for table orders` |
| 5 | Пользователь не может SELECT/INSERT payments | ✅ `permission denied` |
| 6 | Payment с неверной суммой + paid order + grant | ⚠️ Grant следует **только** `order.status`; webhook обязан сверять сумму **до** `paid` (см. риски) |
| 7 | Paid order → один `user_practices` | ✅ `library_rows = 1` |
| 8 | Повторный grant | ✅ `inserted: false`, дублей нет |
| 9 | Pending order → grant | ✅ Exception: `Order ... is not paid` |
| 10 | Legacy `purchases` | ✅ 6 колонок без изменений структуры |
| 11 | Baseline-файлы | ✅ не изменялись |
| 12 | Production `postgres` | ✅ `orders` / `payments` отсутствуют |

### Чужой order

`grant_practice_purchase_access` **недоступна** роли `authenticated`. Вызов возможен только через `service_role` (будущий webhook). При вызове доступ выдаётся владельцу заказа из строки `orders`, не вызывающему.

---

## Оставшиеся риски

1. **Grant не сверяет `payments.amount_minor`** — webhook/API обязаны проверить сумму и статус платежа перед `orders.status = 'paid'`.
2. **`updated_at` не автоматический** — серверный код должен обновлять вручную.
3. **Нет API создания заказа** — следующий этап.
4. **Нет webhook** — подтверждение оплаты только из браузера невозможно безопасно.
5. **ЮKassa не подключена** — нужен адаптер `provider`.
6. **Клиент не видит статус payment** — нужен poll order status или безопасный view.
7. **Ручные refunds** — процесс отзыва `user_practices` не автоматизирован в этой миграции.
8. **Чеки / 54-ФЗ** — вне scope миграции; через провайдера.

---

## Что потребуется дальше (не в этом этапе)

| Этап | Описание |
|------|----------|
| API create order | Server route; чтение `practices.price`; создание `orders` через service role |
| Payment adapter | Абстракция `provider`; реализация `test`, затем `yookassa` |
| Webhook | `POST /api/webhooks/payments/{provider}`; signature; transactional paid + grant |
| UI | Кнопка «Купить», checkout status, «Слушать» при entitlement |
| Staging apply | Применить миграцию на staging до production |
| Safe payments view | Опционально: `payments_public` без `provider_metadata` |

---

## Проверки проекта

| Команда | Результат |
|---------|-----------|
| `npm run lint` | ✅ exit 0 |
| `npm run build` | ✅ exit 0 (Next.js 16.2.10) |

Код приложения **не изменялся**.

---

*Связанные документы: `COMMERCIAL_MVP_DESIGN.md`, `DATABASE_SCHEMA.md`, `supabase/baseline/README.md`*
