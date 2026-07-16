import type {
  AggregatedPracticeProgress,
  HistoryFilter,
  HistoryItem,
  HistoryPeriod,
  HistoryProgressRow,
} from "./types";

const FILTER_VALUES: HistoryFilter[] = ["all", "in-progress", "completed"];

export function parseHistoryFilter(
  value: string | null | undefined,
): HistoryFilter {
  if (value && FILTER_VALUES.includes(value as HistoryFilter)) {
    return value as HistoryFilter;
  }

  return "all";
}

export function aggregateProgressByPractice(
  rows: HistoryProgressRow[],
): AggregatedPracticeProgress[] {
  const map = new Map<string, AggregatedPracticeProgress>();

  for (const row of rows) {
    const existing = map.get(row.practice_id);

    if (!existing) {
      map.set(row.practice_id, {
        practiceId: row.practice_id,
        rows: [row],
        lastUpdatedAt: row.updated_at,
      });
      continue;
    }

    existing.rows.push(row);

    if (Date.parse(row.updated_at) > Date.parse(existing.lastUpdatedAt)) {
      existing.lastUpdatedAt = row.updated_at;
    }
  }

  return [...map.values()].sort(
    (left, right) =>
      Date.parse(right.lastUpdatedAt) - Date.parse(left.lastUpdatedAt),
  );
}

export function filterHistoryItems(
  items: HistoryItem[],
  filter: HistoryFilter,
): HistoryItem[] {
  if (filter === "in-progress") {
    return items.filter((item) => item.status === "in-progress");
  }

  if (filter === "completed") {
    return items.filter((item) => item.status === "completed");
  }

  return items;
}

export function getHistoryPeriod(
  isoDate: string,
  now: Date = new Date(),
): HistoryPeriod {
  const date = new Date(isoDate);

  if (Number.isNaN(date.getTime())) {
    return "earlier";
  }

  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  );
  const startOfDate = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  );
  const diffDays = Math.floor(
    (startOfToday.getTime() - startOfDate.getTime()) / 86_400_000,
  );

  if (diffDays === 0) {
    return "today";
  }

  if (diffDays === 1) {
    return "yesterday";
  }

  const startOfWeek = new Date(startOfToday);
  startOfWeek.setDate(startOfWeek.getDate() - 6);

  if (startOfDate >= startOfWeek) {
    return "this-week";
  }

  return "earlier";
}

export function getHistoryPeriodTitle(period: HistoryPeriod): string {
  switch (period) {
    case "today":
      return "Сегодня";
    case "yesterday":
      return "Вчера";
    case "this-week":
      return "На этой неделе";
    default:
      return "Ранее";
  }
}

const PERIOD_ORDER: HistoryPeriod[] = [
  "today",
  "yesterday",
  "this-week",
  "earlier",
];

export function groupHistoryItems(
  items: HistoryItem[],
  now: Date = new Date(),
): Array<{ period: HistoryPeriod; title: string; items: HistoryItem[] }> {
  const buckets = new Map<HistoryPeriod, HistoryItem[]>();

  for (const item of items) {
    const period = getHistoryPeriod(item.lastActivityAt, now);
    const current = buckets.get(period) ?? [];
    current.push(item);
    buckets.set(period, current);
  }

  return PERIOD_ORDER.flatMap((period) => {
    const groupItems = buckets.get(period);

    if (!groupItems?.length) {
      return [];
    }

    return [
      {
        period,
        title: getHistoryPeriodTitle(period),
        items: groupItems,
      },
    ];
  });
}

export function buildHistoryFilterHref(filter: HistoryFilter): string {
  if (filter === "all") {
    return "/history";
  }

  return `/history?filter=${filter}`;
}
