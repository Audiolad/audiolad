/**
 * c353a4b5: статистика авторов, пространств, продуктов и треков АудиоЛада для ИИ-компании.
 * Pure helpers (periods in Europe/Moscow, composition). DB access lives in ecompany-catalog-stats-queries.ts.
 */

export const CATALOG_STATS_TIME_ZONE = "Europe/Moscow";
/** Moscow has been fixed UTC+3 since 2014 (no DST). */
const MSK_OFFSET_MS = 3 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export const CATALOG_METRICS = [
  {
    key: "authors_total",
    label: "Авторы",
    hint: "Все зарегистрированные авторы (люди), без учёта числа их пространств.",
  },
  {
    key: "authors_with_published",
    label: "Авторы с публикацией",
    hint: "Уникальные авторы, у которых опубликован хотя бы один продукт.",
  },
  {
    key: "spaces_with_published",
    label: "Пространства с публикацией",
    hint: "Авторские пространства с хотя бы одним опубликованным продуктом; у одного автора их может быть несколько.",
  },
  {
    key: "published_products",
    label: "Опубликованные продукты",
    hint: "Публично доступные продукты. Черновики, снятые с публикации, отклонённые и удалённые не считаются.",
  },
  {
    key: "published_tracks",
    label: "Опубликованные треки",
    hint: "Опубликованные аудиофайлы в опубликованных продуктах; каждый трек считается один раз, даже если он подключён в нескольких местах.",
  },
] as const;

export type CatalogMetricKey = (typeof CATALOG_METRICS)[number]["key"];
export type CatalogCounts = Record<CatalogMetricKey, number>;

export type CatalogPeriodKey = "yesterday" | "week" | "month";
export type CatalogPeriod = { key: CatalogPeriodKey; title: string; from: Date; to: Date; boundsLabel: string };

function mskParts(date: Date): { y: number; m: number; d: number } {
  const shifted = new Date(date.getTime() + MSK_OFFSET_MS);
  return { y: shifted.getUTCFullYear(), m: shifted.getUTCMonth(), d: shifted.getUTCDate() };
}

/** UTC instant of 00:00 Moscow time on the given Moscow calendar day. */
function mskMidnight(y: number, m: number, d: number): Date {
  return new Date(Date.UTC(y, m, d) - MSK_OFFSET_MS);
}

export function mskDateKey(date: Date): string {
  const { y, m, d } = mskParts(date);
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function formatMsk(date: Date, withTime = true): string {
  const { y, m, d } = mskParts(date);
  const base = `${String(d).padStart(2, "0")}.${String(m + 1).padStart(2, "0")}.${y}`;
  if (!withTime) return base;
  const shifted = new Date(date.getTime() + MSK_OFFSET_MS);
  return `${base} ${String(shifted.getUTCHours()).padStart(2, "0")}:${String(shifted.getUTCMinutes()).padStart(2, "0")}`;
}

/** Same Moscow wall-clock time one calendar month earlier (clamped to the month's last day). */
function oneMonthEarlier(now: Date): Date {
  const shifted = new Date(now.getTime() + MSK_OFFSET_MS);
  const y = shifted.getUTCFullYear();
  const m = shifted.getUTCMonth();
  const targetMonth = m === 0 ? 11 : m - 1;
  const targetYear = m === 0 ? y - 1 : y;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  const day = Math.min(shifted.getUTCDate(), lastDay);
  const timeOfDay = shifted.getTime() - Date.UTC(y, m, shifted.getUTCDate());
  return new Date(Date.UTC(targetYear, targetMonth, day) + timeOfDay - MSK_OFFSET_MS);
}

export function catalogPeriods(now: Date): CatalogPeriod[] {
  const { y, m, d } = mskParts(now);
  const todayStart = mskMidnight(y, m, d);
  const yesterdayStart = new Date(todayStart.getTime() - DAY_MS);
  const weekStart = new Date(now.getTime() - 7 * DAY_MS);
  const monthStart = oneMonthEarlier(now);
  return [
    {
      key: "yesterday",
      title: "Вчера",
      from: yesterdayStart,
      to: todayStart,
      boundsLabel: `${formatMsk(yesterdayStart, false)}, 00:00–24:00 МСК`,
    },
    { key: "week", title: "7 дней", from: weekStart, to: now, boundsLabel: `${formatMsk(weekStart)} – ${formatMsk(now)} МСК` },
    { key: "month", title: "Месяц", from: monthStart, to: now, boundsLabel: `${formatMsk(monthStart)} – ${formatMsk(now)} МСК` },
  ];
}

/** Points to ask ecompany_catalog_stats_counts for: now first, then each distinct period bound. */
export function catalogCountPoints(now: Date, periods: CatalogPeriod[]): Date[] {
  const seen = new Map<number, Date>([[now.getTime(), now]]);
  for (const p of periods) {
    seen.set(p.from.getTime(), p.from);
    seen.set(p.to.getTime(), p.to);
  }
  return [...seen.values()];
}

export type CatalogSnapshot = CatalogCounts & { snapshotDate: string; capturedAt: string; firstCapturedAt: string };

export type CatalogStatsModel = {
  generatedAt: Date;
  generatedLabel: string;
  totals: CatalogCounts;
  periods: Array<CatalogPeriod & { growth: CatalogCounts; snapshotChange: CatalogCounts | null }>;
  history: Array<CatalogSnapshot & { change: CatalogCounts | null }>;
  historyStartedLabel: string | null;
};

function toInt(value: unknown): number | null {
  const n = typeof value === "string" ? Number(value) : value;
  return typeof n === "number" && Number.isFinite(n) && n >= 0 ? Math.trunc(n) : null;
}

export function parseCounts(row: unknown): CatalogCounts | null {
  if (!row || typeof row !== "object") return null;
  const record = row as Record<string, unknown>;
  const out = {} as CatalogCounts;
  for (const metric of CATALOG_METRICS) {
    const n = toInt(record[metric.key]);
    if (n === null) return null;
    out[metric.key] = n;
  }
  return out;
}

export function parseSnapshot(row: unknown): CatalogSnapshot | null {
  const counts = parseCounts(row);
  if (!counts) return null;
  const record = row as Record<string, unknown>;
  if (typeof record.snapshot_date !== "string" || typeof record.captured_at !== "string") return null;
  return {
    ...counts,
    snapshotDate: record.snapshot_date,
    capturedAt: record.captured_at,
    firstCapturedAt: typeof record.first_captured_at === "string" ? record.first_captured_at : record.captured_at,
  };
}

function diff(a: CatalogCounts, b: CatalogCounts): CatalogCounts {
  const out = {} as CatalogCounts;
  for (const metric of CATALOG_METRICS) out[metric.key] = a[metric.key] - b[metric.key];
  return out;
}

function dayBefore(dateKey: string): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d) - DAY_MS).toISOString().slice(0, 10);
}

/**
 * countsAt: totals as of each instant (ms) from the DB function.
 * snapshots: dated snapshots, any order.
 */
export function composeCatalogStats(
  now: Date,
  countsAt: Map<number, CatalogCounts>,
  snapshots: CatalogSnapshot[],
  /** min(first_captured_at) over ALL snapshots (history list itself is limited). */
  historyStartedAt: string | null = null,
): CatalogStatsModel | null {
  const totals = countsAt.get(now.getTime());
  if (!totals) return null;
  const sorted = [...snapshots].sort((a, b) => a.snapshotDate.localeCompare(b.snapshotDate));
  const byDate = new Map(sorted.map((s) => [s.snapshotDate, s]));
  const periods: CatalogStatsModel["periods"] = [];
  for (const period of catalogPeriods(now)) {
    const end = countsAt.get(period.to.getTime());
    const start = countsAt.get(period.from.getTime());
    if (!end || !start) return null;
    // Exact net change from snapshots only for "yesterday", when both day-end snapshots exist.
    let snapshotChange: CatalogCounts | null = null;
    if (period.key === "yesterday") {
      const y = byDate.get(mskDateKey(period.from));
      const before = byDate.get(dayBefore(mskDateKey(period.from)));
      if (y && before) snapshotChange = diff(y, before);
    }
    periods.push({ ...period, growth: diff(end, start), snapshotChange });
  }
  const history = sorted
    .map((s, i) => {
      const prev = sorted[i - 1];
      const consecutive = prev && prev.snapshotDate === dayBefore(s.snapshotDate);
      return { ...s, change: consecutive ? diff(s, prev) : null };
    })
    .reverse();
  const first = sorted[0];
  return {
    generatedAt: now,
    generatedLabel: `${formatMsk(now)} МСК`,
    totals,
    periods,
    history,
    historyStartedLabel: historyStartedAt
      ? `${formatMsk(new Date(historyStartedAt))} МСК`
      : first
        ? `${formatMsk(new Date(first.firstCapturedAt))} МСК`
        : null,
  };
}

export function formatSigned(n: number): string {
  if (n > 0) return `+${n.toLocaleString("ru-RU")}`;
  if (n < 0) return `−${Math.abs(n).toLocaleString("ru-RU")}`;
  return "0";
}
