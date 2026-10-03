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

const DECIMAL = /^(-?)(\d+)(?:\.(\d+))?$/;

function addOne(digits: string): string {
  const chars = digits.split("");
  let carry = 1;
  for (let index = chars.length - 1; index >= 0 && carry; index -= 1) {
    const sum = (chars[index] ?? "0").charCodeAt(0) - 48 + carry;
    chars[index] = String(sum % 10);
    carry = sum >= 10 ? 1 : 0;
  }
  if (carry) chars.unshift("1");
  return chars.join("");
}

/** Render-time rounding. Does not rewrite the stored or aggregated string. */
function roundDecimalString(value: string, maxDecimals: number, pad: boolean): string | null {
  const match = DECIMAL.exec(value.trim());
  if (!match) return null;
  const sign = match[1] ?? "";
  const intPart = match[2] ?? "0";
  const frac = match[3] ?? "";
  if (frac.length <= maxDecimals) {
    if (!pad) return frac.length === 0 ? `${sign}${intPart}` : `${sign}${intPart}.${frac}`;
    const padded = frac.padEnd(maxDecimals, "0");
    return maxDecimals === 0 ? `${sign}${intPart}` : `${sign}${intPart}.${padded}`;
  }
  const keep = frac.slice(0, maxDecimals);
  const roundUp = (frac[maxDecimals] ?? "0") >= "5";
  if (!roundUp) {
    const shown = pad ? keep : keep.replace(/0+$/, "");
    return shown.length === 0 ? `${sign}${intPart}` : `${sign}${intPart}.${shown}`;
  }
  const bumped = addOne(`${intPart}${keep}`);
  const intDigits = (bumped.slice(0, bumped.length - keep.length) || "0").replace(/^0+(?=\d)/, "");
  const fracDigits = pad ? bumped.slice(bumped.length - keep.length) : bumped.slice(bumped.length - keep.length).replace(/0+$/, "");
  return fracDigits.length === 0 ? `${sign}${intDigits}` : `${sign}${intDigits}.${fracDigits}`;
}

function shownDecimal(value: string | null, maxDecimals: number, pad: boolean): string | null {
  if (!value) return null;
  return roundDecimalString(value, maxDecimals, pad) ?? value;
}

/** BPM and raw BPM, one decimal place, render time only. */
export function formatDisplayedBpm(value: string | null): string | null {
  return shownDecimal(value, 1, true);
}

/** LUFS, one decimal place, render time only. */
export function formatDisplayedLufs(value: string | null): string | null {
  return shownDecimal(value, 1, true);
}

/** Analyzer average or max: at most three decimal places, without padding. */
export function formatDisplayedQuantity(value: string | null): string | null {
  return shownDecimal(value, 3, false);
}

function millisecondsToSeconds(value: string): string {
  const negative = value.startsWith("-");
  const unsigned = negative ? value.slice(1) : value;
  const [whole, frac = ""] = unsigned.split(".");
  const combined = `${whole}${frac}`;
  const decimalIndex = (whole ?? "").length - 3;
  const seconds = decimalIndex > 0
    ? `${combined.slice(0, decimalIndex)}.${combined.slice(decimalIndex)}`
    : `0.${"0".repeat(-decimalIndex)}${combined}`;
  const cleaned = seconds.replace(/\.$/, "").replace(/^0+(?=\d)/, "").replace(/^\./, "0.");
  return negative ? `-${cleaned}` : cleaned;
}

/** Duration from the technical string the reader already built. `mm:ss`. */
export function formatDisplayedDuration(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed || trimmed === "—" || trimmed === "не указано") return null;
  const secondsMatch = /^(-?\d+(?:\.\d+)?)\s*с$/.exec(trimmed);
  const millisMatch = /^(-?\d+(?:\.\d+)?)\s*мс$/.exec(trimmed);
  const bareMatch = /^(-?\d+(?:\.\d+)?)$/.exec(trimmed);
  const secondsText = secondsMatch?.[1]
    ?? (millisMatch?.[1] ? millisecondsToSeconds(millisMatch[1]) : null)
    ?? bareMatch?.[1]
    ?? null;
  if (!secondsText || secondsText.startsWith("-")) return trimmed;
  const rounded = roundDecimalString(secondsText, 0, false);
  if (!rounded || !/^\d+$/.test(rounded)) return trimmed;
  const total = Number(rounded);
  if (!Number.isSafeInteger(total)) return trimmed;
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/**
 * Same detail line as `formatMeasureDetail`, with raw BPM shown to one decimal.
 * The measure object itself stays unrounded.
 */
export function formatDisplayedMeasureDetail(measure: PassportMeasureDisplay): string | null {
  const detail = formatMeasureDetail(measure);
  if (!detail || !measure.raw) return detail;
  const shown = formatDisplayedBpm(measure.raw);
  if (!shown || shown === measure.raw) return detail;
  const token = `raw ${measure.raw}`;
  return detail.includes(token) ? detail.replace(token, `raw ${shown}`) : detail;
}

/** Analysis timestamp for the main view. Europe/Moscow, no raw ISO. */
export function formatAnalyzedAtMoscow(value: string | null | undefined): string {
  if (!value?.trim()) return "не указано";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "не указано";
  const parts = new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Europe/Moscow",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const pick = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  const day = pick("day");
  const month = pick("month");
  const year = pick("year");
  const hour = pick("hour").padStart(2, "0");
  const minute = pick("minute").padStart(2, "0");
  if (!day || !month || !year || hour.length < 2 || minute.length < 2) return "не указано";
  return `${day} ${month} ${year}, ${hour}:${minute} МСК`;
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
