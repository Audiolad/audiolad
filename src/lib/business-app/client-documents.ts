/**
 * Client documents (task 8dcba9d1): document list + pure helpers for the
 * «что играло в заведении во время T» report built from server-accepted
 * playback_usage_facts. No DB writes; no rights-status snapshot (that needs
 * a migration, see docs/business/rights-8dcba9d1/15_PLAYBACK_REPORT_DESIGN.md).
 */

// r6.1 (18.10.2026, Sergey 18.10 13:17): punctuation-only edition of r6 (17.10.2026) – em dashes replaced by en dashes; no acceptance is bound to it.
export const CLIENT_DOCUMENT_EDITION_LABEL = "Редакция от 18.10.2026";
/** Requisites of the service operator (not a declaration of ownership of third-party music). */
export const CLIENT_DOCUMENT_REQUISITES =
  "ИП Петров Сергей Сергеевич, ИНН 507305817690, ОГРНИП 316505300063237";

export type ClientDocumentEntry = {
  id: string;
  title: string;
  version: string;
  versionDate: string;
  status: "approved";
  summary: string;
};

export const CLIENT_DOCUMENTS: readonly ClientDocumentEntry[] = [
  {
    id: "venue-license",
    title: "Лицензия на публичное исполнение музыки в заведении",
    version: "r7-2026-10-18",
    versionDate: "2026-10-18",
    status: "approved",
    summary:
      "Документ точки: лицензия на музыку АудиоЛад в вашем заведении (только через плеер АудиоЛад).",
  },
  {
    id: "b2b-terms",
    title: "Условия лицензирования музыки для бизнеса",
    version: "r6.1-2026-10-18",
    versionDate: "2026-10-18",
    status: "approved",
    summary: "Раздел оферты «АудиоЛад Бизнес»: что разрешено, сроки, учёт, РАО и ВОИС.",
  },
  {
    id: "claims-procedure",
    title: "Порядок защиты клиента при претензиях РАО, ВОИС и иных лиц",
    version: "r6.1-2026-10-18",
    versionDate: "2026-10-18",
    status: "approved",
    summary:
      "Что делать, если пришла претензия или проверка: сроки, юридическая помощь АудиоЛад и условия, при которых возможно возмещение.",
  },
  {
    id: "claim-reply-kit",
    title: "Образец ответа на претензию и перечень документов",
    version: "r6.1-2026-10-18",
    versionDate: "2026-10-18",
    status: "approved",
    summary: "Образец ответа и документы; отправляйте ответ по согласованию с АудиоЛад, кроме случаев п. 2.2 порядка защиты.",
  },
] as const;

/** Browser-visible href of the full document text on business.audiolad.ru. */
export function clientDocumentHref(id: string): string {
  return `/documents/${id}`;
}

export function findClientDocument(id: string): ClientDocumentEntry | undefined {
  return CLIENT_DOCUMENTS.find((d) => d.id === id);
}

export const PLAYBACK_REPORT_MAX_WINDOW_MINUTES = 180;
export const PLAYBACK_REPORT_DEFAULT_WINDOW_MINUTES = 30;

export type PlaybackFactRow = {
  occurred_at: string;
  audio_item_id: string | null;
  location_id: string | null;
  player_id: string | null;
  listened_ms: number | string | null;
  position_ms?: number | string | null;
};

export type PlaybackReportTrack = {
  audioItemId: string | null;
  title: string;
  firstAt: string;
  lastAt: string;
  listenedMs: number;
  /** True if the requested instant T is inside [first segment start, last fact]. */
  coversT: boolean;
  /** Rights holders from the rights registry (verified grants), never hardcoded. */
  rightsholders: string[];
};

export type PlaybackReport = {
  atUtc: string;
  fromUtc: string;
  toUtc: string;
  timezone: string;
  tracks: PlaybackReportTrack[];
  factCount: number;
  registryUnavailable: boolean;
};

function toNum(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function clampWindowMinutes(raw: unknown): number {
  const n = Math.floor(Number(raw));
  if (!Number.isFinite(n) || n <= 0) return PLAYBACK_REPORT_DEFAULT_WINDOW_MINUTES;
  return Math.min(n, PLAYBACK_REPORT_MAX_WINDOW_MINUTES);
}

/** Offset (ms) of `timeZone` at the given UTC instant. */
function tzOffsetMs(utcMs: number, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const p: Record<string, number> = {};
  for (const part of dtf.formatToParts(new Date(utcMs))) {
    if (part.type !== "literal") p[part.type] = Number(part.value);
  }
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(utcMs / 1000) * 1000;
}

export function isValidTimeZone(tz: unknown): tz is string {
  if (typeof tz !== "string" || !tz) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * Parse "YYYY-MM-DDTHH:mm" (venue-local wall clock) into a UTC Date.
 * Returns null on bad input.
 */
export function venueLocalToUtc(local: unknown, timeZone: string): Date | null {
  if (typeof local !== "string") return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local.trim());
  if (!m) return null;
  const [, y, mo, d, h, mi] = m.map(Number);
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return null;
  const naive = Date.UTC(y, mo - 1, d, h, mi);
  const tz = isValidTimeZone(timeZone) ? timeZone : "Europe/Moscow";
  let guess = naive - tzOffsetMs(naive, tz);
  guess = naive - tzOffsetMs(guess, tz);
  return new Date(guess);
}

/** Russian-only label of the venue time zone: «часовой пояс точки, всемирное время +03:00» (no Latin IANA id in the UI). */
export function formatVenueZoneRu(iso: string, timeZone: string): string {
  const tz = isValidTimeZone(timeZone) ? timeZone : "Europe/Moscow";
  const at = new Date(iso);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"), get("second"));
  const offMin = Math.round((asUtc - Math.floor(at.getTime() / 1000) * 1000) / 60000);
  const sign = offMin < 0 ? "−" : "+";
  const abs = Math.abs(offMin);
  const hh = String(Math.floor(abs / 60)).padStart(2, "0");
  const mm = String(abs % 60).padStart(2, "0");
  return `часовой пояс точки, всемирное время ${sign}${hh}:${mm}`;
}

export function formatVenueTime(iso: string, timeZone: string): string {
  const tz = isValidTimeZone(timeZone) ? timeZone : "Europe/Moscow";
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(iso));
}

/**
 * Group facts by track in chronological order of first appearance.
 * A fact at occurred_at covers roughly [occurred_at - listened_ms, occurred_at].
 */
export function buildPlaybackReport(input: {
  at: Date;
  windowMinutes: number;
  timezone: string;
  facts: readonly PlaybackFactRow[];
  titles: ReadonlyMap<string, string>;
  rightsholders?: ReadonlyMap<string, readonly RegistryHolderPeriod[]>;
  /** True when the registry could not be read: holders are unknown, not absent. */
  registryUnavailable?: boolean;
}): PlaybackReport {
  const w = clampWindowMinutes(input.windowMinutes) * 60_000;
  const atMs = input.at.getTime();
  const from = atMs - w;
  const to = atMs + w;
  let count = 0;
  const byTrack = new Map<string, { id: string | null; spans: { s: number; e: number }[] }>();
  for (const f of input.facts) {
    const t = Date.parse(f.occurred_at);
    if (!Number.isFinite(t) || t < from || t > to) continue;
    count += 1;
    const key = f.audio_item_id ?? "__unknown__";
    const entry = byTrack.get(key) ?? { id: f.audio_item_id ?? null, spans: [] };
    entry.spans.push({ s: t - toNum(f.listened_ms), e: t });
    byTrack.set(key, entry);
  }
  // Holder is matched to the playback time, not to the search instant: per track,
  // time is swept over elementary segments cut at fact edges and registry period
  // boundaries, so a change of holder or a gap without a registry record (even
  // between facts) always starts a separate row. Overlapping facts (several players)
  // are aggregated, never duplicated.
  const runs: Run[] = [];
  for (const { id, spans } of byTrack.values()) {
    runs.push(...sweepTrack(id, spans, id ? input.rightsholders?.get(id) : undefined));
  }
  const tracks: PlaybackReportTrack[] = [...runs]
    .sort((a, b) => a.startMs - b.startMs)
    .map((g) => ({
      audioItemId: g.id,
      title: (g.id && input.titles.get(g.id)) || "Трек без названия",
      firstAt: new Date(g.startMs).toISOString(),
      lastAt: new Date(g.lastMs).toISOString(),
      listenedMs: g.listened,
      coversT:
        g.startMs <= atMs &&
        (atMs < g.lastMs ||
          (atMs === g.lastMs && !runs.some((o) => o !== g && o.id === g.id && o.startMs === atMs))),
      rightsholders: g.holders,
    }));
  return {
    atUtc: input.at.toISOString(),
    fromUtc: new Date(from).toISOString(),
    toUtc: new Date(to).toISOString(),
    timezone: isValidTimeZone(input.timezone) ? input.timezone : "Europe/Moscow",
    tracks,
    factCount: count,
    registryUnavailable: input.registryUnavailable === true,
  };
}

type Run = { id: string | null; startMs: number; lastMs: number; listened: number; holders: string[]; sig: string };

function sweepTrack(
  id: string | null,
  spans: readonly { s: number; e: number }[],
  periods: readonly RegistryHolderPeriod[] | undefined,
): Run[] {
  if (spans.length === 0) return [];
  const lo = Math.min(...spans.map((x) => x.s));
  const hi = Math.max(...spans.map((x) => x.e));
  const cuts = new Set<number>();
  for (const x of spans) {
    cuts.add(x.s);
    cuts.add(x.e);
  }
  for (const p of periods ?? []) {
    if (p.fromMs > lo && p.fromMs < hi) cuts.add(p.fromMs);
    if (p.untilMs !== null && p.untilMs > lo && p.untilMs < hi) cuts.add(p.untilMs);
  }
  const pts = [...cuts].sort((x, y) => x - y);
  const out: Run[] = [];
  let cur: Run | null = null;
  const visit = (from: number, to: number, holders: string[], covered: number) => {
    const sig = holders.join("\u0001");
    if (cur && cur.sig === sig) {
      if (covered > 0 || to === from) cur.lastMs = Math.max(cur.lastMs, to);
      cur.listened += covered * (to - from);
      return;
    }
    if (covered === 0) {
      cur = null; // gap with a different holder set: the next covered time starts a new row
      return;
    }
    cur = { id, startMs: from, lastMs: to, listened: covered * (to - from), holders, sig };
    out.push(cur);
  };
  for (let i = 0; i < pts.length; i += 1) {
    const p = pts[i];
    // Zero-length facts (no listened_ms) are points.
    if (spans.some((x) => x.s === p && x.e === p)) visit(p, p, holdersAt(periods, p), 1);
    if (i + 1 < pts.length) {
      const q = pts[i + 1];
      const covered = spans.filter((x) => x.s <= p && x.e >= q && x.e > x.s).length;
      visit(p, q, holdersAt(periods, (p + q) / 2), covered);
    }
  }
  // A row ends at its last covered instant.
  return out;
}

export type RegistryHolderPeriod = { name: string; fromMs: number; untilMs: number | null };

/**
 * Rights holder periods per track from registry rows (music_rights_grants
 * joined to music_rightsholders): verified, business background playback.
 * Matching to playback time happens per fact in buildPlaybackReport.
 */
export function rightsholdersFromRegistry(
  grants: readonly {
    audio_item_id: string | null;
    rightsholder_id: string | null;
    status?: string | null;
    valid_from?: string | null;
    valid_until?: string | null;
  }[],
  holders: readonly { id: string; display_name: string | null }[],
): Map<string, RegistryHolderPeriod[]> {
  const names = new Map(holders.map((h) => [h.id, (h.display_name ?? "").trim()]));
  const out = new Map<string, RegistryHolderPeriod[]>();
  for (const g of grants) {
    if (!g.audio_item_id || !g.rightsholder_id) continue;
    if (g.status && g.status !== "verified") continue;
    const name = names.get(g.rightsholder_id);
    if (!name) continue;
    const fromMs = g.valid_from ? Date.parse(g.valid_from) : Number.NEGATIVE_INFINITY;
    const untilMs = g.valid_until ? Date.parse(g.valid_until) : null;
    const list = out.get(g.audio_item_id) ?? [];
    list.push({ name, fromMs: Number.isNaN(fromMs) ? Number.NEGATIVE_INFINITY : fromMs, untilMs: untilMs !== null && Number.isNaN(untilMs) ? null : untilMs });
    out.set(g.audio_item_id, list);
  }
  return out;
}

/** Holders whose registry period overlaps the playback interval [fromMs, toMs]. */
export function holdersAt(
  periods: readonly RegistryHolderPeriod[] | undefined,
  toMs: number,
  fromMs: number = toMs,
): string[] {
  const res: string[] = [];
  for (const p of periods ?? []) {
    if (p.fromMs <= toMs && (p.untilMs === null || fromMs < p.untilMs) && !res.includes(p.name)) res.push(p.name);
  }
  return res.sort((a, b) => a.localeCompare(b, "ru"));
}
