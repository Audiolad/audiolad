import type { PassportMeasureDisplay, PassportRow } from "./passport";

/**
 * Visible quantity for a tag or instrument.
 * `average` is the primary figure when the analyzer sent it.
 * An older `score` is used only when `average` is absent.
 * This does not sort, rescale, or replace a candidate with a fact.
 */
export function rowQuantityDisplay(row: PassportRow): { primary: string | null; max: string | null } {
  return {
    primary: row.average ?? row.score,
    max: row.max,
  };
}

/**
 * Explicit analyzer `rank` stays «ранг N».
 * When that field is absent, `index` is the position in the analyzer array
 * (already ordered by the analyzer). It is not a new musical rank.
 */
export function instrumentPlaceLabel(row: PassportRow, index: number): string {
  if (row.rank != null) return `ранг ${row.rank}`;
  return `№${index + 1}`;
}

/**
 * One small line under tempo or key.
 * The publication-threshold phrase is included only when `withheld` is already
 * true. This helper does not decide that a value failed a threshold.
 */
export function formatMeasureDetail(measure: PassportMeasureDisplay): string | null {
  const parts: string[] = [];
  if (measure.status !== "published" && measure.raw) parts.push(`raw ${measure.raw}`);
  if (measure.withheld) parts.push("не прошло порог публикации");
  else if (measure.status === "candidate") parts.push("опубликовано: —");
  if (parts.length > 0) return parts.join(" · ");
  if (measure.status === "published" && measure.raw) return `raw ${measure.raw}`;
  return null;
}
