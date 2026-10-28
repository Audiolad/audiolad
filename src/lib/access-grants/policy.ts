import { BUSINESS_GIFT_MS, BUSINESS_GRACE_MS } from "@/lib/business/plan";

import type { AccessGrantEventName } from "./events";

/**
 * Shared trial policy for tasks ba344b7f and 1e008ee8.
 * One gift per email hash and per user id. Rows are never deleted on expiry.
 * An active paid period is left untouched: no second clock and no trial overwrite.
 */

export const BUSINESS_NEW_CLIENT_GRANT_KIND = "business_new_client";

export type GrantRow = {
  emailHash: string;
  userId: string;
  kind: string;
  startsAt: string;
  endsAt: string;
};

export type CustomerAccessMode = "none" | "trial" | "paid" | "grace" | "offer";

export type CustomerAccess = {
  mode: CustomerAccessMode;
  /** Full workspace player. Open during trial, paid time and the 3-day grace. Closed after grace. */
  player: boolean;
  /** End of the gift or paid period. Grace does not move this instant. */
  endsAt: string | null;
  /** When the server must stop audio. Equals endsAt while the period is live, and endsAt plus 3 days during grace. */
  playbackUntil: string | null;
  daysLeft: number | null;
  /** Expired and paid rows stay in the store. */
  grantKept: boolean;
};

export type TrialDecision =
  | { type: "unconfirmed" }
  | { type: "paid_kept"; paidUntil: string }
  | { type: "existing"; grant: GrantRow }
  | { type: "issue"; startsAt: string; endsAt: string };

const MOSCOW = "Europe/Moscow";

export function isEmailConfirmed(user: {
  email_confirmed_at?: string | null;
  confirmed_at?: string | null;
} | null): boolean {
  if (!user) return false;
  return Boolean(user.email_confirmed_at || user.confirmed_at);
}

export function addGiftPeriod(startsAt: Date, giftMs: number = BUSINESS_GIFT_MS): Date {
  return new Date(startsAt.getTime() + giftMs);
}

/** Active while now < endsAt. The exact end instant is already closed. */
export function isPeriodActive(endsAtIso: string, now: Date): boolean {
  const ends = Date.parse(endsAtIso);
  return Number.isFinite(ends) && now.getTime() < ends;
}

export function trialDaysLeft(endsAt: Date, now: Date): number {
  if (now.getTime() >= endsAt.getTime()) return 0;
  const ms = endsAt.getTime() - now.getTime();
  return Math.max(1, Math.ceil(ms / 86_400_000));
}

export function moscowYmd(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: MOSCOW,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** 0 on the activation calendar day in Europe/Moscow. */
export function moscowCalendarDayIndex(start: Date, now: Date): number {
  const a = Date.parse(`${moscowYmd(start)}T00:00:00Z`);
  const b = Date.parse(`${moscowYmd(now)}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

export function formatMoscowDateTime(date: Date): string {
  const formatted = new Intl.DateTimeFormat("ru-RU", {
    timeZone: MOSCOW,
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
  return `${formatted} МСК`;
}

export function ruDaysWord(n: number): string {
  const abs = Math.abs(Math.trunc(n)) % 100;
  const last = abs % 10;
  if (abs > 10 && abs < 20) return "дней";
  if (last === 1) return "день";
  if (last >= 2 && last <= 4) return "дня";
  return "дней";
}

export function decideTrialActivation(input: {
  now: Date;
  emailConfirmed: boolean;
  existing: GrantRow | null;
  paidUntil: string | null;
}): TrialDecision {
  if (!input.emailConfirmed) return { type: "unconfirmed" };
  if (input.paidUntil && isInsideGrace(input.paidUntil, input.now)) {
    return { type: "paid_kept", paidUntil: input.paidUntil };
  }
  if (input.existing) return { type: "existing", grant: input.existing };
  const startsAt = input.now;
  return {
    type: "issue",
    startsAt: startsAt.toISOString(),
    endsAt: addGiftPeriod(startsAt).toISOString(),
  };
}

export function laterAccessInstant(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return Date.parse(a) >= Date.parse(b) ? a : b;
}

/** True from the start of a period until 3 days after its end. The end instant itself is already grace. */
export function isInsideGrace(endsAtIso: string, now: Date): boolean {
  const ends = Date.parse(endsAtIso);
  return Number.isFinite(ends) && now.getTime() < ends + BUSINESS_GRACE_MS;
}

export function gracePlaybackUntil(endsAtIso: string): string {
  return new Date(Date.parse(endsAtIso) + BUSINESS_GRACE_MS).toISOString();
}

/**
 * Where the next paid 30×24h window starts.
 * The contractual end is the later of the free-trial end and paid_until.
 * A payment before that end, or during the 3×24h grace after it, starts at
 * that end. A payment at or after end + BUSINESS_GRACE_MS (music already
 * stopped) starts at paidAt. Twin of apply_business_subscription_for_order.
 * The grace test matches isInsideGrace: paidAt < end + BUSINESS_GRACE_MS.
 */
export function businessSubscriptionPeriodStart(input: {
  paidAt: Date;
  trialEndsAt: string | null;
  paidUntil: string | null;
}): Date {
  const contractual = laterAccessInstant(input.trialEndsAt, input.paidUntil);
  const contractualMs = contractual ? Date.parse(contractual) : Number.NaN;
  if (Number.isFinite(contractualMs) && input.paidAt.getTime() < contractualMs + BUSINESS_GRACE_MS) {
    return new Date(contractualMs);
  }
  return input.paidAt;
}

/** End of the paid window that starts at periodStart. Same 30×24h as the gift. */
export function businessSubscriptionPeriodEnd(periodStart: Date): Date {
  return new Date(periodStart.getTime() + BUSINESS_GIFT_MS);
}

export function resolveCustomerAccess(input: {
  now: Date;
  emailConfirmed: boolean;
  grant: GrantRow | null;
  paidUntil: string | null;
}): CustomerAccess {
  const kept = Boolean(input.grant || input.paidUntil);
  if (!input.emailConfirmed) {
    return { mode: "none", player: false, endsAt: null, playbackUntil: null, daysLeft: null, grantKept: Boolean(input.grant) };
  }
  if (input.paidUntil && isPeriodActive(input.paidUntil, input.now)) {
    const ends = new Date(input.paidUntil);
    return {
      mode: "paid",
      player: true,
      endsAt: input.paidUntil,
      playbackUntil: input.paidUntil,
      daysLeft: trialDaysLeft(ends, input.now),
      grantKept: Boolean(input.grant),
    };
  }
  if (input.grant && isPeriodActive(input.grant.endsAt, input.now)) {
    const ends = new Date(input.grant.endsAt);
    return {
      mode: "trial",
      player: true,
      endsAt: input.grant.endsAt,
      playbackUntil: input.grant.endsAt,
      daysLeft: trialDaysLeft(ends, input.now),
      grantKept: true,
    };
  }
  const contractual = laterAccessInstant(input.grant?.endsAt ?? null, input.paidUntil);
  if (contractual && isInsideGrace(contractual, input.now)) {
    const playbackUntil = gracePlaybackUntil(contractual);
    return {
      mode: "grace",
      player: true,
      endsAt: contractual,
      playbackUntil,
      daysLeft: trialDaysLeft(new Date(playbackUntil), input.now),
      grantKept: kept,
    };
  }
  return {
    mode: "offer",
    player: false,
    endsAt: contractual,
    playbackUntil: null,
    daysLeft: 0,
    grantKept: kept,
  };
}

export type StoredEventName = AccessGrantEventName;
