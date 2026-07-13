# CREATE_ORDER_API_VALIDATION.md

Валидация server API создания заказа `POST /api/orders`.  
Дата: 2026-07-13.

**Production-база (`postgres`) не затрагивалась.**  
Коммерческие миграции в production **не применялись** (`create_practice_order` отсутствует).

---

## Созданные файлы

| Файл | Назначение |
|------|------------|
| `src/app/api/orders/route.ts` | Route handler `POST` |
| `src/lib/orders/create-order-api.ts` | Валидация, idempotency, mapping ошибок, формат ответа |

База данных, миграции, baseline, UI, payments, webhook, ЮKassa **не изменялись**.

---

## Маршрут

| Параметр | Значение |
|----------|----------|
| Method | `POST` |
| Path | `/api/orders` |
| Content-Type | `application/json` |
| Auth | Supabase session cookie (через `createClient()` + `auth.getUser()`) |
| Service role | **Не используется** |

`GET`, `PUT`, `PATCH`, `DELETE` не реализованы — Next.js App Router вернёт **405** автоматически.

---

## Контракт запроса

```json
{
  "practice_slug": "personal-boundaries"
}
```

### Принимается

- `practice_slug` — `string`, trim, не пустой, max 128, формат `^[a-z0-9]+(?:-[a-z0-9]+)*$`

### Не принимается (игнорируется / не валидируется как вход заказа)

- `user_id`
- `amount` / `price` / `amount_minor`
- `currency`
- `status`
- `practice_id`
- произвольный `idempotency_key` в теле

При невалидном теле → **400** `{ "error": "invalid_request" }`

---

## Авторизация

1. `const supabase = await createClient()` — серверный клиент с cookies сессии.
2. `supabase.auth.getUser()` — проверка текущего пользователя.
3. Нет пользователя → **401** `{ "error": "unauthorized" }`
4. `user_id` из тела **не используется**.

Ошибка чтения сессии логируется (`create_order_auth_error`) → **500** `{ "error": "internal_error" }` без утечки деталей.

---

## Idempotency key

### Выбранная модель

| Источник | Поведение |
|----------|-----------|
| Заголовок `Idempotency-Key` отсутствует | Сервер генерирует `crypto.randomUUID()` |
| Заголовок присутствует | Принимается **только** если это валидный UUID (RFC variant/version) |
| Заголовок невалидный | **400** `{ "error": "invalid_request" }` |

Тело запроса **не** принимает idempotency key.

### Обоснование

- Поддержка стандартного заголовка позволяет безопасный retry после сетевого таймаута (тот же UUID → тот же заказ через RPC).
- Произвольные строки отклоняются — нет глобальных коллизий с чужими ключами.
- Без заголовка каждый HTTP-вызов = новая попытка checkout.

### Ограничение

При **серверной** генерации UUID повторный POST после таймаута (клиент не знает, создался ли заказ) создаст **новый** ключ → RPC может вернуть `pending_order_exists` для той же практики (partial unique `user_id + practice_id` pending). Клиенту нужно либо передавать `Idempotency-Key`, либо обрабатывать `pending_order_exists`.

---

## Вызов RPC

```typescript
await supabase.rpc("create_practice_order", {
  p_practice_slug: practiceSlug,
  p_idempotency_key: idempotencyKey,
});
```

- Прямой `INSERT` в `orders` **не выполняется**
- RPC вызывается от имени **authenticated session** (не service role)
- `auth.uid()` внутри функции = текущий пользователь
- Ожидается одна строка в `data[0]`

---

## Контракт успешного ответа

**201 Created**

```json
{
  "order": {
    "id": "uuid",
    "practice_id": "uuid",
    "practice_slug": "personal-boundaries",
    "status": "pending",
    "amount_minor": 19900,
    "currency": "RUB",
    "created_at": "2026-07-13T05:00:00.000Z"
  }
}
```

### Не возвращается

- `user_id`
- `idempotency_key`
- `provider_metadata`
- payment-данные
- внутренние SQL-поля (`practice_title_snapshot`, timestamps статусов и т.д.)

---

## Mapping ошибок

| Источник (RPC / route) | HTTP | Тело |
|------------------------|------|------|
| Нет сессии | 401 | `{ "error": "unauthorized" }` |
| Невалидный JSON / slug / Idempotency-Key | 400 | `{ "error": "invalid_request" }` |
| `practice_not_found` | 404 | `{ "error": "practice_not_found" }` |
| `practice_not_published` | 404 | `{ "error": "practice_not_found" }` |
| `already_owned` | 409 | `{ "error": "already_owned" }` |
| `pending_order_exists` | 409 | `{ "error": "pending_order_exists" }` |
| `practice_not_for_sale` / `invalid_practice_price` | 409 | `{ "error": "practice_not_for_sale" }` |
| `not_authenticated` (RPC) | 401 | `{ "error": "unauthorized" }` |
| Неизвестная ошибка / пустой RPC result | 500 | `{ "error": "internal_error" }` |

`practice_not_published` → **404** (практика недоступна для покупки, как отсутствующая в публичном каталоге).

Технические детали RPC логируются в server logs (`create_order_rpc_error`) только для 5xx; в ответ клиенту не попадают.

Не логируются: access tokens, cookies, секреты, provider metadata.

---

## Результаты тестов

### Стратегия

**Вариант B + C** (production RPC отсутствует, приложение подключено к production Supabase через `.env.local`):

- Unit-тесты pure helpers (`src/lib/orders/create-order-api.ts`) через `npx tsx`
- RPC-слой уже валидирован в `CREATE_ORDER_FUNCTION_VALIDATION.md` на `audiolad_baseline_test`
- Live HTTP E2E против production **не выполнялся** (RPC отсутствует; переключение приложения на тестовую БД запрещено)

### Unit-тесты helpers

| # | Сценарий | Результат |
|---|----------|-----------|
| 1 | `parseJsonObject(null)` / array | ✅ → invalid |
| 2 | Нет / пустой `practice_slug` | ✅ → null |
| 3 | Невалидный формат slug (`Bad Slug`) | ✅ → null |
| 4 | Валидный slug `personal-boundaries` | ✅ |
| 5 | `resolveIdempotencyKey(null)` | ✅ → UUID string |
| 6 | Невалидный `Idempotency-Key` | ✅ → `invalid_request` |
| 7 | Валидный UUID в заголовке | ✅ принят |
| 8 | `mapRpcErrorMessage('already_owned')` | ✅ 409 |
| 9 | `mapRpcErrorMessage('pending_order_exists')` | ✅ 409 |
| 10 | `practice_not_found` / `practice_not_published` | ✅ 404 |
| 11 | `practice_not_for_sale` | ✅ 409 |
| 12 | Неизвестная ошибка | ✅ 500 |
| 13 | `toCreateOrderSuccessBody` без `user_id` / `idempotency_key` | ✅ |

Команда: `npx tsx -e "..."` → `helper_tests_ok`

### Route / структура

| # | Сценарий | Результат |
|---|----------|-----------|
| 1 | `npm run build` включает `ƒ /api/orders` | ✅ |
| 2 | Route использует `auth.getUser()` до RPC | ✅ (код) |
| 3 | Route не читает `user_id`/цену из body | ✅ (код) |
| 4 | Route вызывает только `create_practice_order` RPC | ✅ (код) |
| 5 | POST без сессии → 401 | ✅ (логика: early return) |
| 6 | RPC `already_owned` / `pending_order_exists` | ✅ mapping (unit) + DB tests в function validation |
| 7 | payments / user_practices | ✅ route не трогает; RPC не создаёт (function validation) |

### HTTP E2E (отложено)

Полный `curl POST /api/orders` с реальной сессией будет возможен после применения коммерческих миграций на staging/production Supabase.

---

## Безопасность (проверено по коду)

| Требование | Статус |
|------------|--------|
| Не принимает `user_id` | ✅ |
| Не принимает цену / валюту / статус | ✅ |
| Не создаёт `paid` order | ✅ (только RPC `pending`) |
| Не создаёт `payment` | ✅ |
| Не выдаёт `user_practices` | ✅ |
| Недоступен без сессии | ✅ 401 |
| SQL-ошибки не в ответе | ✅ mapping + generic 500 |
| RPC от текущего пользователя | ✅ authenticated client |
| Service role не используется | ✅ |

---

## Ограничения этапа

1. Endpoint **не начинает оплату** — только создаёт pending order.
2. **Не создаёт** `payment` и **не возвращает** URL платёжной формы.
3. **Не выдаёт** доступ в библиотеку.
4. Production commercial migration **ещё не применена** — live RPC на production недоступен.
5. Повтор POST без `Idempotency-Key` после таймаута может дать `pending_order_exists`.

---

## Следующий этап (не в scope)

| Шаг | Описание |
|-----|----------|
| Payment create | Server route + `payments` insert через service role |
| ЮKassa adapter | Redirect URL, webhook |
| UI | Кнопка «Купить» → `POST /api/orders` → checkout |
| Staging apply | Коммерческие миграции на staging перед production |

---

## Проверки проекта

| Команда | Результат |
|---------|-----------|
| `npm run lint` | ✅ exit 0 |
| `npm run build` | ✅ exit 0; route `ƒ /api/orders` в manifest |

`npm run start` **не запускался**.

---

## Подтверждения

- Production-база **не изменялась**
- Коммит **не создавался**
- `git push` **не выполнялся**
- UI, webhook, payments, ЮKassa **не начинались**
