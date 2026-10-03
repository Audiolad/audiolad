import type { PassportMeasureDisplay } from "./passport";

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
