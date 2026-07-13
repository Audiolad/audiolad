# CREATE_ORDER_FUNCTION_VALIDATION.md

Валидация функции безопасного создания заказа `create_practice_order`.  
Дата: 2026-07-13.

**Production-база (`postgres`) не затрагивалась.**  
Миграция применена только к тестовой БД `audiolad_baseline_test`.

---

## Миграция

| Параметр | Значение |
|----------|----------|
| Файл | `supabase/migrations/20260713140000_create_practice_order_function.sql` |
| Предыдущая коммерческая миграция | `20260713120000_create_commercial_mvp_core.sql` — **не изменялась** |
| Baseline | **Не изменялся** |
| Код приложения | **Не изменялся** |

---

## Анализ схемы перед реализацией

Проверено в `audiolad_baseline_test` (`information_schema` + фактические данные seed):

| Поле | Факт | Использование в функции |
|------|------|-------------------------|
| `practices.id` | `uuid`, NOT NULL | FK в создаваемом заказе |
| `practices.slug` | `text`, NOT NULL, UNIQUE | Поиск практики по `p_practice_slug` |
| `practices.title` | `text`, NOT NULL | `practice_title_snapshot` |
| `practices.price` | `integer`, **nullable**, default `0` | **Рубли** (целое число); конвертация в копейки |
| `practices.status` | `text`, default `'published'` | Продажа только при `status = 'published'` |
| `practices.is_free` | `boolean`, default `false` | Блокировка бесплатных практик |
| `orders.idempotency_key` | `text`, nullable | Принимает `uuid`, сохраняет как `::text` |
| `orders.amount_minor` | `bigint`, NOT NULL | Заполняется из `price * 100` |
| `orders.price_minor_snapshot` | `bigint`, NOT NULL | Та же каноническая сумма при создании |

### Фактические цены в тестовой БД

| slug | price (руб) | is_free | status |
|------|-------------|---------|--------|
| `personal-boundaries` | 199 | false | published |
| `sila-zhenstvennosti` | 199 | false | published |
| `elixir-molodosti` | 0 | true | published |

**Конфликта конвертации нет:** `practices.price` — целые рубли; `amount_minor = price::bigint * 100` (например, 199 → 19900 копеек).

---

## Контракт функции

```sql
public.create_practice_order(
  p_practice_slug text,
  p_idempotency_key uuid
)
RETURNS TABLE (
  order_id uuid,
  practice_id uuid,
  practice_slug text,
  status text,
  amount_minor bigint,
  currency text,
  created_at timestamptz
)
```

| Свойство | Значение |
|----------|----------|
| Язык | `plpgsql` |
| Безопасность | `SECURITY DEFINER` |
| `search_path` | `public, pg_temp` (паттерн проекта, как `grant_practice_purchase_access`) |
| Contract marker | `audiolad:create-order:v1` (в `COMMENT ON FUNCTION`) |

### Источник `user_id`

Только `auth.uid()`. Если `NULL` → исключение `not_authenticated` (SQLSTATE `28000`).

Клиент **не передаёт** `user_id`, `amount`, `currency`, `title`, `status`, `practice_id`.

### Источник цены

1. Практика загружается по `p_practice_slug`.
2. Проверки: существует, `status = 'published'`, `is_free IS NOT TRUE`, `price IS NOT NULL`, `price > 0`.
3. `amount_minor` и `price_minor_snapshot` = `practices.price::bigint * 100`.
4. `currency` = `'RUB'` (фиксировано).

### Поведение `already_owned`

Перед созданием заказа проверяется активный entitlement в `user_practices`:

```sql
expires_at IS NULL OR expires_at > now()
```

Если доступ есть → исключение `already_owned` (SQLSTATE `P0001`).  
Таблица `user_practices` **не изменяется**.

### Идемпотентность

| Аспект | Поведение |
|--------|-----------|
| Ключ | `p_idempotency_key::text` → `orders.idempotency_key` |
| Повторный вызов | Возвращает существующий заказ (тот же `order_id`) |
| Проверки при replay | `user_id = auth.uid()`, `practice_id` совпадает |
| Чужой ключ | `idempotency_key_conflict` |
| Тот же ключ, другая практика | `idempotency_key_practice_mismatch` |
| Гонка (unique violation) | `EXCEPTION WHEN unique_violation` → повторный SELECT и возврат существующего заказа |

**Глобальный UNIQUE** на `orders.idempotency_key` (partial: `WHERE idempotency_key IS NOT NULL`):

- Ключ уникален **между всеми пользователями**, не только внутри одного `user_id`.
- Риск: клиент должен генерировать UUID per-request; переиспользование чужого ключа даст `idempotency_key_conflict`.
- Ограничение **не ослаблялось** (как в `20260713120000`).

**Отдельный partial UNIQUE** `(user_id, practice_id) WHERE status = 'pending'`:

- Повторный заказ той же практики с **другим** idempotency key → `pending_order_exists` (не создаёт второй pending).

### Права EXECUTE

| Роль | EXECUTE |
|------|---------|
| `PUBLIC` | ❌ REVOKE |
| `anon` | ❌ REVOKE |
| `authenticated` | ✅ GRANT |

Прямой client INSERT в `orders` по-прежнему запрещён RLS/GRANT.

### Что функция НЕ делает

- ❌ Не подтверждает оплату (`status` всегда `pending` при создании)
- ❌ Не создаёт `payments`
- ❌ Не вызывает `grant_practice_purchase_access`
- ❌ Не изменяет `user_practices`, `purchases`
- ❌ Не создаёт `paid` заказ

---

## Результаты тестов (`audiolad_baseline_test`)

Тесты выполнялись в транзакциях с `ROLLBACK`, кроме отдельного параллельного сценария (см. ниже).

| # | Сценарий | Результат |
|---|----------|-----------|
| 1 | Неавторизованный вызов | ✅ `not_authenticated` |
| 2 | Авторизованный пользователь создаёт pending order | ✅ `status = pending`, `amount_minor = 19900` |
| 3 | `user_id` из `auth.uid()` | ✅ совпадает с JWT sub |
| 4 | Цена из `practices`, не от клиента | ✅ |
| 5 | Сумма в копейках (`199` → `19900`) | ✅ |
| 6 | Snapshot title и slug | ✅ `practice_title_snapshot`, `practice_slug_snapshot` |
| 7 | Повтор с тем же idempotency key | ✅ тот же `order_id`, одна строка |
| 8 | Гонка / unique conflict | ✅ симуляция pre-insert + вызов функции → 1 заказ; **параллельно** 2 сессии с одним ключом → 1 заказ, оба вернули один `order_id` |
| 9 | Тот же ключ, другая практика | ✅ `idempotency_key_practice_mismatch` |
| 10 | Чужой idempotency key | ✅ `idempotency_key_conflict` |
| 11 | Непубликуемая / отсутствующая практика | ✅ `practice_not_published` / `practice_not_found` |
| 12 | Бесплатная практика (`elixir-molodosti`) | ✅ `practice_not_for_sale` |
| 13 | Уже принадлежащая практика (`user_practices`) | ✅ `already_owned` |
| 14 | `payments` не создаются | ✅ count до/после = 0 |
| 15 | `user_practices` не изменяется | ✅ count до/после = 3 для тестового пользователя |
| 16 | Legacy `purchases` не изменяется | ✅ 6 колонок, count без изменений |
| 17 | `anon` не может EXECUTE | ✅ `insufficient_privilege` |
| 18 | Предыдущая миграция / baseline | ✅ файлы не менялись |
| 19 | Production `postgres` | ✅ `create_practice_order` и `orders` отсутствуют |

---

## Известные ограничения

1. **Глобальный idempotency key** — ключ уникален на всю таблицу `orders`; API должен генерировать свежий UUID на каждую попытку checkout.
2. **Один pending на user+practice** — новый ключ при уже существующем pending → `pending_order_exists`; клиент должен переиспользовать pending order или дождаться финализации.
3. **Цена только целые рубли** — дробные рубли в `practices.price` не поддерживаются (тип `integer`).
4. **`is_free` и `price` не связаны CHECK** — функция проверяет оба условия (`is_free`, `price > 0`).
5. **Функция не заменяет API route** — для production-потока нужен server route с валидацией сессии и передачей idempotency key.
6. **Нет автоматического `updated_at`** — как в core-миграции; обновление статуса — серверный контур.

---

## Что потребуется для будущего API route

| Шаг | Описание |
|-----|----------|
| `POST /api/orders` (или аналог) | Server route: проверка сессии Supabase, вызов `supabase.rpc('create_practice_order', { p_practice_slug, p_idempotency_key })` |
| Idempotency header | Клиент генерирует UUID; сервер передаёт в RPC |
| Ответ | Маппинг безопасных полей из RETURNS TABLE; без `provider_metadata` |
| Checkout | Создание `payments` + redirect на ЮKassa — **отдельный этап** |
| Webhook | Подтверждение оплаты, `orders.status = paid`, `grant_practice_purchase_access` — **отдельный этап** |
| UI | Кнопка «Купить», poll `order.status` — **отдельный этап** |

---

## Проверки проекта

| Команда | Результат |
|---------|-----------|
| `npm run lint` | ✅ exit 0 |
| `npm run build` | ✅ exit 0 (Next.js 16.2.10) |

`npm run start` **не запускался**.

---

## Подтверждения

- Production-база **не затрагивалась** (функция и таблица `orders` в `postgres` отсутствуют).
- Тестовая БД: **`audiolad_baseline_test`** (сохранена, не удалялась).
- Коммит **не создавался**.
- UI, API route, webhook, ЮKassa **не начинались**.
