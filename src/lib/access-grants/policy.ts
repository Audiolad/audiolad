import { BUSINESS_GIFT_MS } from "@/lib/business/plan";

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

export type CustomerAccessMode = "none" | "trial" | "paid" | "offer";

export type CustomerAccess = {
  mode: CustomerAccessMode;
  /** Full workspace player. Closed for anonymous, unconfirmed, expired and unpaid. */
  player: boolean;
  endsAt: string | null;
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
  if (input.paidUntil && isPeriodActive(input.paidUntil, input.now)) {
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

export function resolveCustomerAccess(input: {
  now: Date;
  emailConfirmed: boolean;
  grant: GrantRow | null;
  paidUntil: string | null;
}): CustomerAccess {
  if (!input.emailConfirmed) {
    return { mode: "none", player: false, endsAt: null, daysLeft: null, grantKept: Boolean(input.grant) };
  }
  if (input.paidUntil && isPeriodActive(input.paidUntil, input.now)) {
    const ends = new Date(input.paidUntil);
    return {
      mode: "paid",
      player: true,
      endsAt: input.paidUntil,
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
      daysLeft: trialDaysLeft(ends, input.now),
      grantKept: true,
    };
  }
  return {
    mode: "offer",
    player: false,
    endsAt: input.grant?.endsAt ?? input.paidUntil,
    daysLeft: 0,
    grantKept: Boolean(input.grant || input.paidUntil),
  };
}

export type StoredEventName = AccessGrantEventName;
