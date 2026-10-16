/**
 * Client documents (task 8dcba9d1): document list + pure helpers for the
 * «что играло в заведении во время T» report built from server-accepted
 * playback_usage_facts. No DB writes; no rights-status snapshot (that needs
 * a migration, see docs/business/rights-8dcba9d1/15_PLAYBACK_REPORT_DESIGN.md).
 */

export const CLIENT_DOCUMENT_EDITION_LABEL = "Редакция от 16.10.2026";
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
    version: "r4-2026-10-16",
    versionDate: "2026-10-16",
    status: "approved",
    summary:
      "Документ точки: лицензия на музыку АудиоЛад в вашем заведении (только через плеер АудиоЛад).",
  },
  {
    id: "b2b-terms",
    title: "Условия лицензирования музыки для бизнеса",
    version: "r4-2026-10-16",
    versionDate: "2026-10-16",
    status: "approved",
    summary: "Раздел оферты «АудиоЛад Бизнес»: что разрешено, сроки, учёт, РАО и ВОИС.",
  },
  {
    id: "claims-procedure",
    title: "Порядок защиты клиента при претензиях РАО, ВОИС и иных лиц",
    version: "r4-2026-10-16",
    versionDate: "2026-10-16",
    status: "approved",
    summary:
      "Что делать, если пришла претензия или проверка: сроки, документы, помощь и условия возмещения.",
  },
  {
    id: "claim-reply-kit",
    title: "Образец ответа на претензию и перечень документов",
    version: "r4-2026-10-16",
    versionDate: "2026-10-16",
    status: "approved",
    summary: "Не отправляйте ответ без согласования с АудиоЛад.",
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
  rightsholders?: ReadonlyMap<string, readonly string[]>;
}): PlaybackReport {
  const w = clampWindowMinutes(input.windowMinutes) * 60_000;
  const atMs = input.at.getTime();
  const from = atMs - w;
  const to = atMs + w;
  const groups = new Map<
    string,
    { id: string | null; startMs: number; lastMs: number; listened: number }
  >();
  let count = 0;
  const sorted = [...input.facts]
    .filter((f) => {
      const t = Date.parse(f.occurred_at);
      return Number.isFinite(t) && t >= from && t <= to;
    })
    .sort((a, b) => Date.parse(a.occurred_at) - Date.parse(b.occurred_at));
  for (const f of sorted) {
    count += 1;
    const t = Date.parse(f.occurred_at);
    const listened = toNum(f.listened_ms);
    const key = f.audio_item_id ?? "__unknown__";
    const g = groups.get(key);
    if (!g) {
      groups.set(key, {
        id: f.audio_item_id ?? null,
        startMs: t - listened,
        lastMs: t,
        listened,
      });
    } else {
      g.startMs = Math.min(g.startMs, t - listened);
      g.lastMs = Math.max(g.lastMs, t);
      g.listened += listened;
    }
  }
  const tracks: PlaybackReportTrack[] = [...groups.values()]
    .sort((a, b) => a.startMs - b.startMs)
    .map((g) => ({
      audioItemId: g.id,
      title: (g.id && input.titles.get(g.id)) || "Трек без названия",
      firstAt: new Date(g.startMs).toISOString(),
      lastAt: new Date(g.lastMs).toISOString(),
      listenedMs: g.listened,
      coversT: g.startMs <= atMs && atMs <= g.lastMs,
      rightsholders: g.id ? [...(input.rightsholders?.get(g.id) ?? [])] : [],
    }));
  return {
    atUtc: input.at.toISOString(),
    fromUtc: new Date(from).toISOString(),
    toUtc: new Date(to).toISOString(),
    timezone: isValidTimeZone(input.timezone) ? input.timezone : "Europe/Moscow",
    tracks,
    factCount: count,
  };
}

/**
 * Rights holders per track from registry rows (music_rights_grants joined to
 * music_rightsholders): verified, business background playback, valid at T.
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
  at: Date,
): Map<string, string[]> {
  const names = new Map(holders.map((h) => [h.id, (h.display_name ?? "").trim()]));
  const t = at.getTime();
  const out = new Map<string, string[]>();
  for (const g of grants) {
    if (!g.audio_item_id || !g.rightsholder_id) continue;
    if (g.status && g.status !== "verified") continue;
    if (g.valid_from && Date.parse(g.valid_from) > t) continue;
    if (g.valid_until && Date.parse(g.valid_until) <= t) continue;
    const name = names.get(g.rightsholder_id);
    if (!name) continue;
    const list = out.get(g.audio_item_id) ?? [];
    if (!list.includes(name)) list.push(name);
    out.set(g.audio_item_id, list);
  }
  return out;
}
