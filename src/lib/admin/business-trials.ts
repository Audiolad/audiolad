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
  /** Venue of the account (guest-start organization, else the earliest owner membership). */
  organizationId?: string | null;
  organizationName?: string | null;
  /** access_grant_events first_useful_action (email accounts only). */
  firstUsefulAction?: boolean;
  /** business_workspace_playback.updated_at (cabinet player). */
  workspacePlaybackAt?: string | null;
  /** Latest business_point_sessions.last_seen_at of the venue. */
  pointSeenAt?: string | null;
  /** Latest business_player_device_heartbeat.last_seen_at of the venue. */
  deviceSeenAt?: string | null;
  /** business_trial_activity_days of the venue (PR 2, only while recording is on). */
  activityDays?: readonly BusinessTrialActivityDay[];
  /** business_guest_starts.start_host (PR 2, only while recording is on). */
  startHost?: "coffee" | "business" | null;
};

export type BusinessTrialActivityDay = {
  /** Moscow calendar day, YYYY-MM-DD. */
  day: string;
  listenedSeconds: number;
  cabinetVisits: number;
};

/** Per-account activity since the gift started. null = recording is off («нет данных»). */
export type BusinessTrialActivity = {
  listenedMinutes: number;
  /** Days with at least one minute of music. */
  musicDays: number;
  cabinetVisits: number;
};

export const BUSINESS_TRIAL_NO_DATA = "нет данных";

export const BUSINESS_TRIAL_START_HOST_LABELS: Record<"coffee" | "business", string> = {
  coffee: "coffee",
  business: "business",
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
  activity: BusinessTrialActivity | null;
  startHost: "coffee" | "business" | null;
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
  /** Accounts with at least activeMinutes of music since the start; null while recording is off. */
  activeEnough: number | null;
};

export type BusinessTrialStats = {
  generatedAt: string;
  activityEnabled: boolean;
  activeMinutes: number;
  totals: BusinessTrialTotals;
  rows: BusinessTrialRow[];
  /** Accounts skipped because their venue is in AUDIOLAD_BUSINESS_TRIAL_EXCLUDED_ORG_IDS. */
  hiddenTests: number;
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

const MOSCOW_DAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Moscow",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** YYYY-MM-DD of the instant in Moscow. */
export function moscowDay(iso: string): string {
  return MOSCOW_DAY.format(new Date(iso));
}

/** Earliest Moscow day of any gift start (YYYY-MM-DD), or null when there are no valid grants. */
export function earliestBusinessTrialDay(grants: readonly Pick<BusinessTrialGrantInput, "startsAt">[]): string | null {
  let earliest: string | null = null;
  for (const grant of grants) {
    if (!Number.isFinite(Date.parse(grant.startsAt))) continue;
    const day = moscowDay(grant.startsAt);
    if (earliest === null || day < earliest) earliest = day;
  }
  return earliest;
}

const MUSIC_DAY_SECONDS = 60;

export function summarizeBusinessTrialActivity(
  days: readonly BusinessTrialActivityDay[] | undefined,
  startsAt: string,
): BusinessTrialActivity {
  const from = moscowDay(startsAt);
  let seconds = 0;
  let musicDays = 0;
  let cabinetVisits = 0;
  const seen = new Set<string>();
  for (const row of days ?? []) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(row.day) || row.day < from || seen.has(row.day)) continue;
    seen.add(row.day);
    const listened = Number.isFinite(row.listenedSeconds) ? Math.max(0, Math.floor(row.listenedSeconds)) : 0;
    const visits = Number.isFinite(row.cabinetVisits) ? Math.max(0, Math.floor(row.cabinetVisits)) : 0;
    seconds += listened;
    cabinetVisits += visits;
    if (listened >= MUSIC_DAY_SECONDS) musicDays += 1;
  }
  return { listenedMinutes: Math.floor(seconds / 60), musicDays, cabinetVisits };
}

export function buildBusinessTrialStats(input: {
  now: Date;
  grants: readonly BusinessTrialGrantInput[];
  facts?: ReadonlyMap<string, BusinessTrialFacts>;
  /** PR 2 recording flag and the «не меньше N минут» threshold. Off by default. */
  activity?: { enabled: boolean; activeMinutes: number };
  /** Our test venues: not counted, not listed, only «Скрыто тестовых: N». */
  excludedOrgIds?: ReadonlySet<string>;
}): BusinessTrialStats {
  const activityEnabled = input.activity?.enabled === true;
  const activeMinutes = Math.max(1, Math.floor(input.activity?.activeMinutes ?? 60));
  const totals: BusinessTrialTotals = {
    started: 0,
    trial: 0,
    grace: 0,
    paid: 0,
    closed: 0,
    guests: 0,
    registered: 0,
    firstPlayYes: 0,
    activeEnough: activityEnabled ? 0 : null,
  };
  const rows: BusinessTrialRow[] = [];
  const seen = new Set<string>();
  let hiddenTests = 0;

  for (const grant of input.grants) {
    if (grant.kind !== BUSINESS_NEW_CLIENT_GRANT_KIND) continue;
    if (!validIso(grant.startsAt) || !validIso(grant.endsAt)) continue;
    if (seen.has(grant.userId)) continue;
    seen.add(grant.userId);

    const facts = input.facts?.get(grant.userId) ?? {};
    const orgId = facts.organizationId?.toLowerCase();
    if (orgId && input.excludedOrgIds?.has(orgId)) {
      hiddenTests += 1;
      continue;
    }
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
      activity: activityEnabled ? summarizeBusinessTrialActivity(facts.activityDays, grant.startsAt) : null,
      startHost: activityEnabled ? facts.startHost ?? null : null,
    });
    const last = rows[rows.length - 1];
    if (totals.activeEnough !== null && last.activity && last.activity.listenedMinutes >= activeMinutes) {
      totals.activeEnough += 1;
    }

    totals.started += 1;
    totals[status] += 1;
    if (account === "guest") totals.guests += 1;
    else totals.registered += 1;
    if (firstPlay === "yes") totals.firstPlayYes += 1;
  }

  rows.sort((a, b) => Date.parse(b.startsAt) - Date.parse(a.startsAt) || a.userId.localeCompare(b.userId));
  return { generatedAt: input.now.toISOString(), activityEnabled, activeMinutes, totals, rows, hiddenTests };
}
