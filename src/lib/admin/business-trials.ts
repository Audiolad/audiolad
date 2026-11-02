import {
  BUSINESS_NEW_CLIENT_GRANT_KIND,
  resolveCustomerAccess,
  type CustomerAccessMode,
} from "@/lib/access-grants/policy";

/**
 * «Подарочная неделя» in the admin «АудиоЛад Бизнес» section (task 253821e0).
 * Pure aggregation: the query layer passes plain rows, no email, IP or hashes.
 * Status comes from resolveCustomerAccess, the same policy the cabinet uses.
 */

export type BusinessTrialStatus = "trial" | "grace" | "paid" | "closed";

/** Admin-internal labels. «льготный период» is never shown to customers. */
export const BUSINESS_TRIAL_STATUS_LABELS: Record<BusinessTrialStatus, string> = {
  trial: "подарок",
  grace: "льготный период",
  paid: "оплачено",
  closed: "закрыто",
};

export type BusinessTrialAccountKind = "guest" | "registered" | "registered_from_guest";

export const BUSINESS_TRIAL_ACCOUNT_LABELS: Record<BusinessTrialAccountKind, string> = {
  guest: "гость",
  registered: "зарегистрирован",
  registered_from_guest: "зарегистрирован (начинал гостем)",
};

export type BusinessTrialFirstPlay = "yes" | "no" | "unknown";

export const BUSINESS_TRIAL_FIRST_PLAY_LABELS: Record<BusinessTrialFirstPlay, string> = {
  yes: "да",
  no: "нет",
  unknown: "неизвестно",
};

/** One access_grants row. hasEmail replaces email_hash: the hash itself never leaves the query layer. */
export type BusinessTrialGrantInput = {
  userId: string;
  hasEmail: boolean;
  kind: string;
  startsAt: string;
  endsAt: string;
};

export type BusinessTrialFacts = {
  /** Latest access_paid_periods.paid_until for this account (by user id or email). */
  paidUntil?: string | null;
  /** business_guest_starts row with status ready. */
  guestStart?: boolean;
  organizationName?: string | null;
  /** access_grant_events first_useful_action (email accounts only). */
  firstUsefulAction?: boolean;
  /** business_workspace_playback.updated_at (cabinet player). */
  workspacePlaybackAt?: string | null;
  /** Latest business_point_sessions.last_seen_at of the venue. */
  pointSeenAt?: string | null;
  /** Latest business_player_device_heartbeat.last_seen_at of the venue. */
  deviceSeenAt?: string | null;
};

export type BusinessTrialRow = {
  userId: string;
  /** Venue name, or «Без заведения» when there is none yet (shortId is shown next to it). */
  title: string;
  shortId: string;
  account: BusinessTrialAccountKind;
  startsAt: string;
  endsAt: string;
  status: BusinessTrialStatus;
  /** Days of the gift (or paid / grace time) left; 0 when closed. */
  daysLeft: number;
  firstPlay: BusinessTrialFirstPlay;
  lastActivityAt: string | null;
};

export type BusinessTrialTotals = {
  started: number;
  trial: number;
  grace: number;
  paid: number;
  closed: number;
  guests: number;
  registered: number;
  firstPlayYes: number;
};

export type BusinessTrialStats = {
  generatedAt: string;
  totals: BusinessTrialTotals;
  rows: BusinessTrialRow[];
};

export function businessTrialStatusFromMode(mode: CustomerAccessMode): BusinessTrialStatus {
  if (mode === "trial") return "trial";
  if (mode === "grace") return "grace";
  if (mode === "paid") return "paid";
  return "closed";
}

function validIso(value: string | null | undefined): string | null {
  if (!value) return null;
  return Number.isFinite(Date.parse(value)) ? value : null;
}

export function latestIso(...values: Array<string | null | undefined>): string | null {
  let best: string | null = null;
  for (const value of values) {
    const iso = validIso(value);
    if (iso && (!best || Date.parse(iso) > Date.parse(best))) best = iso;
  }
  return best;
}

export function businessTrialShortId(userId: string): string {
  return userId.replace(/-/g, "").slice(0, 8);
}

export function businessTrialFirstPlay(facts: BusinessTrialFacts): BusinessTrialFirstPlay {
  if (facts.firstUsefulAction || validIso(facts.workspacePlaybackAt)) return "yes";
  // A paired point plays without writing cabinet events: no proof either way.
  if (validIso(facts.pointSeenAt) || validIso(facts.deviceSeenAt)) return "unknown";
  return "no";
}

export function buildBusinessTrialStats(input: {
  now: Date;
  grants: readonly BusinessTrialGrantInput[];
  facts?: ReadonlyMap<string, BusinessTrialFacts>;
}): BusinessTrialStats {
  const totals: BusinessTrialTotals = {
    started: 0,
    trial: 0,
    grace: 0,
    paid: 0,
    closed: 0,
    guests: 0,
    registered: 0,
    firstPlayYes: 0,
  };
  const rows: BusinessTrialRow[] = [];
  const seen = new Set<string>();

  for (const grant of input.grants) {
    if (grant.kind !== BUSINESS_NEW_CLIENT_GRANT_KIND) continue;
    if (!validIso(grant.startsAt) || !validIso(grant.endsAt)) continue;
    if (seen.has(grant.userId)) continue;
    seen.add(grant.userId);

    const facts = input.facts?.get(grant.userId) ?? {};
    const access = resolveCustomerAccess({
      now: input.now,
      // A stored grant means the start was accepted: email confirmed or guest-start (as principal.server.ts).
      emailConfirmed: true,
      grant: {
        emailHash: null,
        userId: grant.userId,
        kind: grant.kind,
        startsAt: grant.startsAt,
        endsAt: grant.endsAt,
      },
      paidUntil: validIso(facts.paidUntil),
    });
    const status = businessTrialStatusFromMode(access.mode);
    const account: BusinessTrialAccountKind = !grant.hasEmail
      ? "guest"
      : facts.guestStart
        ? "registered_from_guest"
        : "registered";
    const shortId = businessTrialShortId(grant.userId);
    const name = facts.organizationName?.trim();
    const firstPlay = businessTrialFirstPlay(facts);

    rows.push({
      userId: grant.userId,
      title: name ? name : "Без заведения",
      shortId,
      account,
      startsAt: grant.startsAt,
      endsAt: grant.endsAt,
      status,
      daysLeft: status === "closed" ? 0 : Math.max(0, access.daysLeft ?? 0),
      firstPlay,
      lastActivityAt: latestIso(facts.workspacePlaybackAt, facts.pointSeenAt, facts.deviceSeenAt),
    });

    totals.started += 1;
    totals[status] += 1;
    if (account === "guest") totals.guests += 1;
    else totals.registered += 1;
    if (firstPlay === "yes") totals.firstPlayYes += 1;
  }

  rows.sort((a, b) => Date.parse(b.startsAt) - Date.parse(a.startsAt) || a.userId.localeCompare(b.userId));
  return { generatedAt: input.now.toISOString(), totals, rows };
}
