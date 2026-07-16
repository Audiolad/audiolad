# Контрольная точка: гостевая воронка «Женские деньги»

Последняя верификация: **2026-07-16** (production).

## Production snapshot

| Параметр | Значение |
|----------|----------|
| **Git commit (код)** | `41cec3b` — `fix: save promo practice after signup` |
| **Git tag** | `stable/promo-zhenskie-signup-20260716` |
| **Release** | `20260716-114126-41cec3b` |
| **BUILD_ID** | `xqw9YzazGeLHcziztnCtj` |
| **Практика** | https://audiolad.ru/practice/zoya-petrova/zhenskie-dengi |

## Подтверждённый сценарий (10 шагов)

1. Гость открывает «Женские деньги».
2. Нажимает «Начать слушать».
3. Плеер запускается после пользовательского действия (`autoplay=1` в URL, воспроизведение после клика).
4. Гостевой прогресс сохраняется по interval (≥13 с).
5. Появляется CTA «Сохранить и получить подарки».
6. Пользователь регистрируется (новый аккаунт).
7. Возвращается на `/listen/zoya-petrova/zhenskie-dengi`.
8. `PromoPostSignupHandler` вызывает `POST /api/promo/complete-signup` → HTTP 201/200, `{ ok: true, practiceSaved: true }`.
9. «Женские деньги» добавляется в Аудиотеку; три стартовые практики — через `handle_new_user()`.
10. В Аудиотеке **4 уникальные** практики без дублей:

- Женские деньги
- Эликсир Молодости
- Ключ к Изобилию
- Код Притяжения

## Ключевой fix (`41cec3b`)

**Проблема:** после регистрации `PromoPostSignupHandler` не монтировался — handler был за `promoConversionMode` (только для гостя).

**Решение:**

- `shouldRunPromoPostSignupHandler(isAuthenticated)` в `ListenPageClient.tsx`
- Handler на practice page для авторизованного пользователя
- `practice_id` в API; pending context очищается только после успеха
- RPC `claim_promo_practice(p_practice_slug, p_practice_id)` — UUID имеет приоритет

## Обязательные migrations на production

| Migration | Назначение |
|-----------|------------|
| `20260716150000_practice_guest_promo_funnel.sql` | guest funnel MVP (ранее) |
| `20260716180000_per_track_covers.sql` | `practices.use_shared_cover` — без неё `/listen/*` падает |
| `20260716190000_claim_promo_practice_by_id.sql` | RPC claim by UUID + slug |

## Файлы fix

```
src/lib/promo/post-signup.ts
src/components/promo/PromoPostSignupHandler.tsx
src/components/audio/ListenPageClient.tsx
src/app/practice/[...segments]/page.tsx
src/lib/promo/complete-signup-api.ts
src/app/api/promo/complete-signup/route.ts
supabase/migrations/20260716190000_claim_promo_practice_by_id.sql
scripts/promo-signup-claim-unit.mjs
```

## Верификация

```bash
# Unit (без БД)
node scripts/promo-signup-claim-unit.mjs

# Production E2E (Playwright, новый тестовый аккаунт)
export PLAYWRIGHT_BROWSERS_PATH=/root/.cache/ms-playwright
node scripts/promo-zhenskie-signup-e2e.mjs
```

E2E URL (UTM для тестовой кампании):

```
https://audiolad.ru/practice/zoya-petrova/zhenskie-dengi?utm_source=test&utm_medium=e2e&utm_campaign=zhenskie_dengi_signup_test&utm_content=main_post
```

## Rollback

**Release:**

```bash
bash /var/www/audiolad/deploy/scripts/rollback.sh "rollback promo zhenskie signup checkpoint"
```

Previous release до checkpoint: `20260716-112014-43bdaed`.

**DB backup (перед migration claim):**

```
/var/www/audiolad/backups/postgres-pre-promo-signup-claim-20260716-113134.dump
```

Откат **только кода** на commit до `41cec3b` совместим с новой RPC (старый вызов по slug). Полный откат RPC — из backup или восстановление single-arg `claim_promo_practice(text)`.

## Не входит в эту контрольную точку

- Commits после `41cec3b` на ветке (`97d65f5`, author onboarding и др.)
- Migration `promotion_campaigns` (раздел «Продвижение»)
- `promo-funnel-production-smoke.mjs` — ожидает URL без `autoplay=1` (устарело после `e556105`)

## Следующая сессия

Продолжать с tag `stable/promo-zhenskie-signup-20260716` / release `20260716-114126-41cec3b`. Не downgrade production ниже `41cec3b` без согласования.
