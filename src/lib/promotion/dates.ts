import type { PromotionPeriodKey } from "./types";

export function parsePromotionPeriod(
  value: string | null | undefined,
): PromotionPeriodKey {
  if (value === "7d" || value === "30d" || value === "90d" || value === "all") {
    return value;
  }

  return "30d";
}

export function getPromotionPeriodBounds(period: PromotionPeriodKey): {
  dateFrom: string | null;
  dateTo: string | null;
} {
  if (period === "all") {
    return { dateFrom: null, dateTo: null };
  }

  const days = period === "7d" ? 7 : period === "90d" ? 90 : 30;
  const now = new Date();
  const from = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

  return {
    dateFrom: from.toISOString(),
    dateTo: now.toISOString(),
  };
}

export function getPromotionPeriodLabel(period: PromotionPeriodKey): string {
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
