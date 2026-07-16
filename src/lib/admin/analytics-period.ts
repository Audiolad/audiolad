export type AdminAnalyticsPeriod =
  | "today"
  | "yesterday"
  | "7d"
  | "30d"
  | "all";

export const ADMIN_ANALYTICS_PERIOD_OPTIONS: {
  id: AdminAnalyticsPeriod;
  label: string;
}[] = [
  { id: "today", label: "Сегодня" },
  { id: "yesterday", label: "Вчера" },
  { id: "7d", label: "7 дней" },
  { id: "30d", label: "30 дней" },
  { id: "all", label: "Всё время" },
];

export const DEFAULT_ADMIN_ANALYTICS_PERIOD: AdminAnalyticsPeriod = "7d";

const MOSCOW_TZ = "Europe/Moscow";

export type AdminAnalyticsPeriodRange = {
  from: string | null;
  to: string | null;
  label: string;
};

function getMoscowDateParts(date: Date): { year: number; month: number; day: number } {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: MOSCOW_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const parts = formatter.formatToParts(date);
  const year = Number(parts.find((part) => part.type === "year")?.value ?? "1970");
  const month = Number(parts.find((part) => part.type === "month")?.value ?? "1");
  const day = Number(parts.find((part) => part.type === "day")?.value ?? "1");

  return { year, month, day };
}

function moscowMidnightUtc(year: number, month: number, day: number): Date {
  const utcGuess = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
  const formatted = utcGuess.toLocaleString("en-US", {
    timeZone: MOSCOW_TZ,
    hour: "numeric",
    hour12: false,
  });
  const hourInMoscow = Number(formatted);

  return new Date(utcGuess.getTime() - hourInMoscow * 60 * 60 * 1000);
}

export function resolveAdminAnalyticsPeriodRange(
  period: AdminAnalyticsPeriod,
  now: Date = new Date(),
): AdminAnalyticsPeriodRange {
  const option = ADMIN_ANALYTICS_PERIOD_OPTIONS.find((item) => item.id === period);

  if (period === "all") {
    return {
      from: null,
      to: null,
      label: option?.label ?? "Всё время",
    };
  }

  const { year, month, day } = getMoscowDateParts(now);
  const todayStart = moscowMidnightUtc(year, month, day);

  if (period === "today") {
    return {
      from: todayStart.toISOString(),
      to: now.toISOString(),
      label: option?.label ?? "Сегодня",
    };
  }

  if (period === "yesterday") {
    const yesterdayStart = new Date(todayStart.getTime() - 24 * 60 * 60 * 1000);

    return {
      from: yesterdayStart.toISOString(),
      to: todayStart.toISOString(),
      label: option?.label ?? "Вчера",
    };
  }

  const days = period === "30d" ? 30 : 7;
  const from = new Date(todayStart.getTime() - (days - 1) * 24 * 60 * 60 * 1000);

  return {
    from: from.toISOString(),
    to: now.toISOString(),
    label: option?.label ?? `${days} дней`,
  };
}

export function parseAdminAnalyticsPeriod(
  value: string | null | undefined,
): AdminAnalyticsPeriod {
  if (
    value === "today" ||
    value === "yesterday" ||
    value === "7d" ||
    value === "30d" ||
    value === "all"
  ) {
    return value;
  }

  return DEFAULT_ADMIN_ANALYTICS_PERIOD;
}

export function formatAdminPercent(numerator: number, denominator: number): string {
  if (denominator <= 0 || numerator <= 0) {
    return "0%";
  }

  return `${Math.round((numerator / denominator) * 100)}%`;
}
