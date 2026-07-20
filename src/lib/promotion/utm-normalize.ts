import { slugifyTitle } from "../author-products/utils";

/** User-entered UTM values: lowercase latin, digits, hyphens. */
export const UTM_VALUE_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** System preset medium values that may contain underscores. */
export const SYSTEM_UTM_MEDIUM_VALUES = new Set([
  "social",
  "messenger",
  "messaging_bot",
  "email",
  "paid",
  "partner",
  "website",
  "owned",
]);

export function normalizeUtmValue(value: string): string {
  return slugifyTitle(value);
}

export function isSystemUtmMediumValue(value: string): boolean {
  return SYSTEM_UTM_MEDIUM_VALUES.has(value.trim().toLowerCase());
}

export function isValidUtmSource(value: string): boolean {
  const normalized = normalizeUtmValue(value);
  return Boolean(normalized) && UTM_VALUE_PATTERN.test(normalized);
}

export function isValidUtmMedium(value: string): boolean {
  const trimmed = value.trim().toLowerCase();

  if (!trimmed) {
    return false;
  }

  if (isSystemUtmMediumValue(trimmed)) {
    return true;
  }

  return UTM_VALUE_PATTERN.test(trimmed);
}

export function resolveCustomUtmMedium(label: string): string {
  const trimmed = label.trim();

  if (!trimmed) {
    return "";
  }

  const lower = trimmed.toLowerCase();

  if (/^[a-z0-9._-]+$/.test(lower) && !/[а-яё]/i.test(trimmed)) {
    return lower;
  }

  return normalizeUtmValue(trimmed);
}

export function isValidCustomUtmMedium(value: string): boolean {
  const trimmed = value.trim();

  if (!trimmed || trimmed.toLowerCase() === "other") {
    return false;
  }

  const resolved = resolveCustomUtmMedium(trimmed);

  if (!resolved) {
    return false;
  }

  if (isSystemUtmMediumValue(resolved)) {
    return true;
  }

  if (/^[a-z0-9._-]+$/.test(resolved)) {
    return true;
  }

  return UTM_VALUE_PATTERN.test(resolved);
}

export function validateNormalizedUtmValue(value: string): string | null {
  const normalized = normalizeUtmValue(value);

  if (!normalized) {
    return "utm_value_empty";
  }

  if (!UTM_VALUE_PATTERN.test(normalized)) {
    return "utm_value_invalid";
  }

  return null;
}
