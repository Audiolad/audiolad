import { BUSINESS_PAID_PERIOD_DAYS } from "@/lib/business/plan";
import { formatMoscowDay, type BusinessChromeAccess } from "@/lib/access-grants/access-line";

/**
 * Mirrors `apply_business_subscription_for_order` (t1311u / t1312u):
 * period_start = max(paid_at, live trial ends_at, current paid_until / org period_end);
 * period_end = period_start + 30 days. Remaining gift or paid days are never burned.
 */
export function businessPaidPeriodBounds(input: {
  paidAt: Date;
  trialEndsAt: Date | null;
  paidUntil: Date | null;
  periodDays?: number;
}): { periodStart: Date; periodEnd: Date } {
  let baseMs = input.paidAt.getTime();
  if (input.trialEndsAt && Number.isFinite(input.trialEndsAt.getTime()) && input.trialEndsAt.getTime() > baseMs) {
    baseMs = input.trialEndsAt.getTime();
  }
  if (input.paidUntil && Number.isFinite(input.paidUntil.getTime()) && input.paidUntil.getTime() > baseMs) {
    baseMs = input.paidUntil.getTime();
  }
  const days = input.periodDays ?? BUSINESS_PAID_PERIOD_DAYS;
  const periodStart = new Date(baseMs);
  const periodEnd = new Date(baseMs + days * 86_400_000);
  return { periodStart, periodEnd };
}

/** New access-until after an early payment that stacks +30 days on the live period end. */
export function businessEarlyPayAccessUntilIso(
  access: Pick<BusinessChromeAccess, "mode" | "endsAt">,
  now: Date = new Date(),
): string | null {
  if ((access.mode !== "trial" && access.mode !== "paid") || !access.endsAt) return null;
  const endMs = Date.parse(access.endsAt);
  if (!Number.isFinite(endMs) || endMs <= now.getTime()) return null;
  return new Date(endMs + BUSINESS_PAID_PERIOD_DAYS * 86_400_000).toISOString();
}

/**
 * Shown next to early-pay buttons («Оплатить заранее», «Продлить», trial «Оплатить»)
 * while a gift or paid period is still live. Never mentions the hidden grace window.
 * t1313u: remaining days kept + 30 on top, with the computed new access date.
 */
export function businessEarlyPayCarryoverNote(
  access: Pick<BusinessChromeAccess, "mode" | "endsAt">,
  now: Date = new Date(),
): string | null {
  const untilIso = businessEarlyPayAccessUntilIso(access, now);
  if (!untilIso) return null;
  const day = formatMoscowDay(untilIso);
  if (!day) return null;
  return `Оставшиеся дни сохранятся, и к ним добавится ещё ${BUSINESS_PAID_PERIOD_DAYS} дней – доступ будет до ${day}.`;
}
