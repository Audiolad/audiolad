# Shared business trial (`access_grants`)

One module for tasks **ba344b7f** and **1e008ee8**. Do not add a second registration flow or a second trial clock.

## What it does

- A confirmed email that enters through the offer (`/auth/business-return` or the business workspace) receives one period of `30 * 24` hours.
- Identity is `sha256` of the trimmed lowercased email, plus the user id. Both are unique for kind `business_new_client`. The raw email is not stored.
- There is no foreign key to `auth.users`. Deleting the account does not delete the grant, so a new registration of the same address does not restart the clock. A different email is a different client.
- An active row in `access_paid_periods` is left as-is: no trial is issued over a live paid period, and a later `recordPaidRenewal` does not delete the trial row.
- When `now >= ends_at` and there is no live paid period, the full player closes and the cabinet shows a voluntary subscription. The price is `formatBusinessMonthlyPrice()` from `src/lib/business/plan.ts`. This task does not charge and does not call Tochka or any other payment provider.
- Grant rows, event rows and playback rows are kept after expiry.
- Studio generation is not part of the gift. The cabinet rules quote the existing Studio limits and do not promise unlimited AI.
- Events live in `access_grant_events`, not in platform analytics and not in mailings: `trial_started`, `first_useful_action`, `activity_day_7`, `activity_day_14`, `activity_day_30`, `subscription_offer_shown`, `subscription_go_to_payment` (repeatable), `subscription_renewed`. Day indexes use the Europe/Moscow calendar and are written when the workspace is opened, not by a cron.

## Rights

`business_space_admissions` is the whitelist seam for task **28d2b5bb**. This migration inserts no rows. The player also requires `resolve_business_track_eligibility` = `ELIGIBLE`. `UNKNOWN` is not playable. The guest free-album shelf is not used in the workspace.

## Return after email confirmation

GoTrue allow-list URLs stay exact, without a query string. Sign-up does not set `emailRedirectTo`. The relative `next=/auth/business-return` is stored on the form, and `user_metadata.business_trial = "1"` is set only for that next path. The callback uses an explicit `next` when it is present, and otherwise the metadata flag.

## Migration

`supabase/migrations/20270115120000_access_grants_and_workspace.sql`

Prepared, not applied. Validation: `npm run test:business-workspace-trial`.

Continuation: the owner reviews the migration and applies it through the established process. Until then the workspace reports that the gift store is unavailable and does not invent a period.

Rollback, only if this migration is the latest change and the new tables hold nothing you need to keep:

```sql
DROP TABLE IF EXISTS public.business_workspace_playback;
DROP TABLE IF EXISTS public.business_space_admissions;
DROP TABLE IF EXISTS public.access_grant_events;
DROP TABLE IF EXISTS public.access_paid_periods;
DROP TABLE IF EXISTS public.access_grants;
```

## Residual

The landing poster file `12-free-trial.webp` still shows the old 7-day line in the picture. The page alt text no longer quotes that line. Replacing the image is a separate asset change.
