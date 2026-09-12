import type { AuthorStatsPeriodKey } from "./types";

export function parseAuthorStatsPeriod(
  value: string | null | undefined,
): AuthorStatsPeriodKey {
  if (value === "7d" || value === "30d" || value === "90d" || value === "all") {
    return value;
  }

  return "30d";
}

export function getAuthorStatsPeriodBounds(period: AuthorStatsPeriodKey): {
  dateFrom: string | null;
  dateTo: string | null;
} {
  if (period === "all") {
    return { dateFrom: null, dateTo: null };
  }

  const days = period === "7d" ? 7 : period === "90d" ? 90 : 30;
  const now = new Date();
  const dateParts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Moscow",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const year = Number(dateParts.find((part) => part.type === "year")?.value);
  const month = Number(dateParts.find((part) => part.type === "month")?.value);
  const day = Number(dateParts.find((part) => part.type === "day")?.value);
  const todayMoscowMidnight = new Date(
    Date.UTC(year, month - 1, day, 0, 0, 0) - 3 * 60 * 60 * 1000,
  );
  const from = new Date(
    todayMoscowMidnight.getTime() - (days - 1) * 24 * 60 * 60 * 1000,
  );

  return {
    dateFrom: from.toISOString(),
    dateTo: now.toISOString(),
  };
}

export function getAuthorStatsPeriodLabel(period: AuthorStatsPeriodKey): string {
  switch (period) {
    case "7d":
      return "7 дней";
    case "30d":
      return "30 дней";
    case "90d":
      return "90 дней";
    case "all":
      return "Всё время";
    default:
      return "30 дней";
  }
}
