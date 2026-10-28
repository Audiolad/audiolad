import { BUSINESS_GRACE_MS } from "@/lib/business/plan";

import { moscowYmd } from "@/lib/access-grants/policy";

/**
 * Service reminders for an AudioLad Business owner.
 * One contractual end: the later of the gift `ends_at` and `paid_until`.
 * Grace is 3×24h after that instant and is not written into `paid_until`.
 *
 * Windows use the Moscow calendar, same as the cabinet dates.
 * - before_end: 1–3 calendar days before the end day, while access is still open.
 * - grace_start: after the end instant and before the last grace day (the end day,
 *   with a later catch-up so a missed run still sends once).
 * - grace_last: the Moscow calendar day of the last instant music still plays.
 *
 * The SQL twin is public.business_access_reminder_kind. Keep the two together.
 */

export const BUSINESS_ACCESS_REMINDER_LEAD_DAYS = 3;

export const BUSINESS_ACCESS_REMINDER_KINDS = [
  "before_end",
  "grace_start",
  "grace_last",
] as const;

export type BusinessAccessReminderKind = (typeof BUSINESS_ACCESS_REMINDER_KINDS)[number];

export const BUSINESS_ACCESS_SERVICE_MESSAGE_TYPE = "business_access_service";

/** Direct cabinet control the owner uses to pay. No other site is linked from the letter. */
export const BUSINESS_ACCESS_REMINDER_CABINET_URL = "https://business.audiolad.ru/#dostup";

const DAY_MS = 86_400_000;

function moscowDayIndex(isoDay: string): number {
  return Date.parse(`${isoDay}T00:00:00Z`) / DAY_MS;
}

/** Later Moscow calendar date minus earlier one. Positive when `later` is after `earlier`. */
export function moscowCalendarDaysBetween(earlier: Date, later: Date): number {
  return moscowDayIndex(moscowYmd(later)) - moscowDayIndex(moscowYmd(earlier));
}

export function businessAccessReminderKind(
  periodEndIso: string,
  now: Date,
): BusinessAccessReminderKind | null {
  const endMs = Date.parse(periodEndIso);
  if (!Number.isFinite(endMs)) return null;
  const nowMs = now.getTime();
  const graceEndMs = endMs + BUSINESS_GRACE_MS;
  if (nowMs < endMs) {
    const daysBefore = moscowCalendarDaysBetween(now, new Date(endMs));
    if (daysBefore >= 1 && daysBefore <= BUSINESS_ACCESS_REMINDER_LEAD_DAYS) {
      return "before_end";
    }
    return null;
  }
  if (nowMs >= graceEndMs) return null;
  const today = moscowYmd(now);
  const lastGraceDay = moscowYmd(new Date(graceEndMs - 1));
  if (today === lastGraceDay) return "grace_last";
  const endDay = moscowYmd(new Date(endMs));
  if (today >= endDay && today < lastGraceDay) return "grace_start";
  return null;
}

/** At most one send of each kind for one user and one contractual end. */
export function businessAccessReminderDedupeKey(
  userId: string,
  periodEndIso: string,
  kind: BusinessAccessReminderKind,
): string {
  return `${BUSINESS_ACCESS_SERVICE_MESSAGE_TYPE}:${userId}:${periodEndIso}:${kind}`;
}
