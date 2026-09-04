/**
 * Author-stats projection for listener appreciation.
 *
 * Separate from ordinary purchase/revenue counters. Product-surface facts
 * attach to a practice; author-surface facts stay author-level only.
 */

import {
  isPaidAtInRange,
  type AuthorAppreciationCabinetFact,
} from "@/lib/author-finance/appreciation-cabinet";

import type {
  AuthorStatsProductRow,
  AuthorStatsSummary,
  AuthorStatsTimeseriesPoint,
} from "./types";

export const AUTHOR_STATS_APPRECIATION_SECTION_TITLE =
  "Благодарности от слушателей";

export type AuthorAppreciationStatsTotals = {
  appreciationCount: number;
  appreciationGrossMinor: number;
  appreciationAuthorAccruedMinor: number;
};

export function emptyAppreciationStats(): AuthorAppreciationStatsTotals {
  return {
    appreciationCount: 0,
    appreciationGrossMinor: 0,
    appreciationAuthorAccruedMinor: 0,
  };
}

export function averageAppreciationGrossMinor(
  totals: AuthorAppreciationStatsTotals,
): number | null {
  if (totals.appreciationCount <= 0) return null;
  return Math.round(totals.appreciationGrossMinor / totals.appreciationCount);
}

export function moscowDateKey(value: string): string | null {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleDateString("en-CA", { timeZone: "Europe/Moscow" });
}

export function isProductSurfaceFact(
  fact: Pick<AuthorAppreciationCabinetFact, "surface" | "practiceId">,
): boolean {
  return fact.surface === "product" && Boolean(fact.practiceId);
}

export function isAuthorSurfaceFact(
  fact: Pick<AuthorAppreciationCabinetFact, "surface">,
): boolean {
  return fact.surface === "author";
}

export function summarizeAppreciationStats(
  facts: readonly AuthorAppreciationCabinetFact[],
  range: { from?: string | null; to?: string | null } = {},
): AuthorAppreciationStatsTotals {
  const totals = emptyAppreciationStats();

  for (const fact of facts) {
    if (fact.intentStatus !== "paid") continue;
    if (!isPaidAtInRange(fact.paidAt, range.from, range.to)) continue;

    totals.appreciationCount += 1;
    totals.appreciationGrossMinor += fact.amountMinor;
    totals.appreciationAuthorAccruedMinor += fact.authorAccruedMinor ?? 0;
  }

  return totals;
}

export function attachAppreciationToSummary(
  summary: AuthorStatsSummary,
  totals: AuthorAppreciationStatsTotals,
): AuthorStatsSummary {
  return {
    ...summary,
    appreciationCount: totals.appreciationCount,
    appreciationGrossMinor: totals.appreciationGrossMinor,
    appreciationAuthorAccruedMinor: totals.appreciationAuthorAccruedMinor,
  };
}

export function attachAppreciationToProducts(
  products: readonly AuthorStatsProductRow[],
  facts: readonly AuthorAppreciationCabinetFact[],
  range: { from?: string | null; to?: string | null } = {},
): AuthorStatsProductRow[] {
  const bySlug = new Map<
    string,
    AuthorAppreciationStatsTotals
  >();

  for (const fact of facts) {
    if (fact.intentStatus !== "paid") continue;
    if (!isProductSurfaceFact(fact)) continue;
    if (!isPaidAtInRange(fact.paidAt, range.from, range.to)) continue;

    const slug = fact.practiceSlug?.trim();
    if (!slug) continue;

    const current = bySlug.get(slug) ?? emptyAppreciationStats();
    current.appreciationCount += 1;
    current.appreciationGrossMinor += fact.amountMinor;
    current.appreciationAuthorAccruedMinor += fact.authorAccruedMinor ?? 0;
    bySlug.set(slug, current);
  }

  return products.map((product) => {
    const totals = bySlug.get(product.productSlug) ?? emptyAppreciationStats();
    return {
      ...product,
      appreciationCount: totals.appreciationCount,
      appreciationGrossMinor: totals.appreciationGrossMinor,
      appreciationAuthorAccruedMinor: totals.appreciationAuthorAccruedMinor,
    };
  });
}

function emptyPoint(date: string): AuthorStatsTimeseriesPoint {
  return {
    date,
    practiceViews: 0,
    practiceUniqueVisitors: 0,
    plays: 0,
    progress25: 0,
    completions: 0,
    librarySaves: 0,
    grossPurchases: 0,
    refundSales: 0,
    fullRefunds: 0,
    partialRefunds: 0,
    netSales: 0,
    authorPageViews: 0,
    authorPageUniqueVisitors: 0,
    appreciationCount: 0,
    appreciationGrossMinor: 0,
    appreciationAuthorAccruedMinor: 0,
  };
}

export function attachAppreciationToTimeseries(
  points: readonly AuthorStatsTimeseriesPoint[],
  facts: readonly AuthorAppreciationCabinetFact[],
  range: { from?: string | null; to?: string | null } = {},
): AuthorStatsTimeseriesPoint[] {
  const byDate = new Map<string, AuthorStatsTimeseriesPoint>();

  for (const point of points) {
    byDate.set(point.date, {
      ...point,
      appreciationCount: point.appreciationCount ?? 0,
      appreciationGrossMinor: point.appreciationGrossMinor ?? 0,
      appreciationAuthorAccruedMinor: point.appreciationAuthorAccruedMinor ?? 0,
    });
  }

  for (const fact of facts) {
    if (fact.intentStatus !== "paid") continue;
    if (!fact.paidAt) continue;
    if (!isPaidAtInRange(fact.paidAt, range.from, range.to)) continue;

    const date = moscowDateKey(fact.paidAt);
    if (!date) continue;

    const current = byDate.get(date) ?? emptyPoint(date);
    current.appreciationCount += 1;
    current.appreciationGrossMinor += fact.amountMinor;
    current.appreciationAuthorAccruedMinor += fact.authorAccruedMinor ?? 0;
    byDate.set(date, current);
  }

  return [...byDate.values()].sort((left, right) => left.date.localeCompare(right.date));
}

