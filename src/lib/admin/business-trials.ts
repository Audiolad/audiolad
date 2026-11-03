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
  /** business_guest_starts attribution columns (PR 3, only while attribution is on). */
  origin?: BusinessTrialOrigin | null;
};

/** Where a guest start came from. Coarse labels only: no IP, user agent or full URL. */
export type BusinessTrialOrigin = {
  channel: "max" | "tg" | null;
  referrerDomain: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  country: string | null;
  region: string | null;
  city: string | null;
  deviceClass: "phone" | "tablet" | "computer" | null;
  osFamily: string | null;
  browserFamily: string | null;
};

export const BUSINESS_TRIAL_CHANNEL_LABELS: Record<"max" | "tg" | "none", string> = {
  max: "МАКС",
  tg: "Телеграм",
  none: "Без метки",
};

export const BUSINESS_TRIAL_DEVICE_LABELS: Record<"phone" | "tablet" | "computer", string> = {
  phone: "телефон",
  tablet: "планшет",
  computer: "компьютер",
};

/** Per-channel counts from MAX Поток (read-only endpoint, unique contacts, test contacts excluded). */
export type MaxPotokChannelCounts = {
  /** Contacts who started the bot from a source link. */
  botStarts: number;
  /** Contacts who tapped a bot button leading to audiolad gift pages. */
  giftClicks: number;
};

export type BusinessTrialFunnelChannel = "max" | "tg" | "none";

export type BusinessTrialFunnelColumn = {
  channel: BusinessTrialFunnelChannel;
  /** null = no data (MAX Поток not configured or unavailable, or «без метки»). */
  botStarts: number | null;
  giftClicks: number | null;
  started: number;
  paid: number;
};

export type BusinessTrialFunnel = {
  /** false while AUDIOLAD_BUSINESS_TRIAL_ATTRIBUTION_ENABLED is off: block shows «нет данных». */
  enabled: boolean;
  /** false when MAX Поток counts could not be loaded. */
  maxPotok: boolean;
  /** Start of the shared window (ISO): all four steps count only from here. */
  from: string;
  columns: BusinessTrialFunnelColumn[];
};

/** «Воронка по каналам» window: the same last N days for the bot steps and our starts. */
export const BUSINESS_TRIAL_FUNNEL_DAYS = 30;

export function businessTrialFunnelFrom(now: Date): string {
  return new Date(now.getTime() - BUSINESS_TRIAL_FUNNEL_DAYS * 86_400_000).toISOString();
}

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
  /** null while attribution is off or for starts without a guest-start row. */
  origin: BusinessTrialOrigin | null;
  /** Has any paid period (paid now, or paid before and ended). */
  everPaid: boolean;
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
  attributionEnabled: boolean;
  funnel: BusinessTrialFunnel;
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
  /** PR 3 attribution flag. Off by default. */
  attributionEnabled?: boolean;
  /** MAX Поток counts per channel; null = not configured or unavailable. */
  maxPotok?: Partial<Record<"max" | "tg", MaxPotokChannelCounts>> | null;
}): BusinessTrialStats {
  const activityEnabled = input.activity?.enabled === true;
  const attributionEnabled = input.attributionEnabled === true;
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
      origin: attributionEnabled ? facts.origin ?? null : null,
      everPaid: validIso(facts.paidUntil) !== null,
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
  const funnel = buildBusinessTrialFunnel(rows, attributionEnabled, input.maxPotok ?? null, businessTrialFunnelFrom(input.now));
  return { generatedAt: input.now.toISOString(), activityEnabled, activeMinutes, totals, rows, hiddenTests, attributionEnabled, funnel };
}

function count(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

/**
 * «Воронка по каналам»: bot start → gift button → 7-day start → payment, МАКС and Телеграм
 * side by side. The first two steps come from MAX Поток, the last two from our starts with
 * ch=max|tg. «Без метки» = starts without a channel (site, ads, direct). All steps share one
 * window (last BUSINESS_TRIAL_FUNNEL_DAYS days), so a subscription and click before the first
 * start are not lost and the conversions compare like with like.
 */
export function buildBusinessTrialFunnel(
  rows: readonly Pick<BusinessTrialRow, "origin" | "everPaid" | "startsAt">[],
  enabled: boolean,
  maxPotok: Partial<Record<"max" | "tg", MaxPotokChannelCounts>> | null,
  from: string,
): BusinessTrialFunnel {
  const fromMs = Date.parse(from);
  const columns: BusinessTrialFunnelColumn[] = (["max", "tg", "none"] as const).map((channel) => {
    const external = channel === "none" ? undefined : maxPotok?.[channel];
    return {
      channel,
      botStarts: external ? count(external.botStarts) : null,
      giftClicks: external ? count(external.giftClicks) : null,
      started: 0,
      paid: 0,
    };
  });
  if (enabled) {
    for (const row of rows) {
      if (!row.origin) continue;
      const startMs = Date.parse(row.startsAt);
      if (!Number.isFinite(startMs) || !(startMs >= fromMs)) continue;
      const column = columns.find((c) => c.channel === (row.origin?.channel ?? "none"));
      if (!column) continue;
      column.started += 1;
      if (row.everPaid) column.paid += 1;
    }
  }
  return { enabled, maxPotok: maxPotok !== null, from, columns };
}

/** «12 → 3 (25%)» style conversion; null when either side is unknown or the base is zero. */
export function businessTrialConversion(from: number | null, to: number | null): number | null {
  if (from === null || to === null || from <= 0) return null;
  return Math.round((to / from) * 100);
}
