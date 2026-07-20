const BLOCKED_SCHEMES = ["javascript:", "data:", "file:", "vbscript:"] as const;

export const PERSONAL_MATERIAL_RETURN_DEFAULT_LABEL =
  "Вернуться в чат с автором" as const;

export function isHttpAllowedForReturnUrl(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase();
  return normalized === "localhost" || normalized === "127.0.0.1";
}

export function isProductionRuntime(): boolean {
  return process.env.NODE_ENV === "production";
}

export function normalizeReturnButtonLabel(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function getGuestReturnButtonLabel(input: {
  returnButtonLabel: string | null;
}): string {
  return normalizeReturnButtonLabel(input.returnButtonLabel) ??
    PERSONAL_MATERIAL_RETURN_DEFAULT_LABEL;
}

export function shouldShowGuestReturnChatButton(input: {
  returnUrl: string | null;
}): boolean {
  return normalizeReturnUrl(input.returnUrl) !== null;
}

export function normalizeReturnUrl(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  let parsed: URL;

  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }

  const scheme = parsed.protocol.toLowerCase();

  if (BLOCKED_SCHEMES.includes(scheme as (typeof BLOCKED_SCHEMES)[number])) {
    return null;
  }

  if (scheme === "https:") {
    return trimmed;
  }

  if (scheme === "http:" && !isProductionRuntime() && isHttpAllowedForReturnUrl(parsed.hostname)) {
    return trimmed;
  }

  if (scheme === "http:" && isHttpAllowedForReturnUrl(parsed.hostname)) {
    // Allow localhost HTTP even in production builds for author testing links.
    return trimmed;
  }

  return null;
}

export function validateReturnUrl(value: string | null | undefined): {
  valid: boolean;
  normalized: string | null;
  error?: "invalid_return_url" | "return_url_too_long";
} {
  if (value === null || value === undefined) {
    return { valid: true, normalized: null };
  }

  if (typeof value !== "string") {
    return { valid: false, normalized: null, error: "invalid_return_url" };
  }

  const trimmed = value.trim();

  if (!trimmed) {
    return { valid: true, normalized: null };
  }

  if (trimmed.length > 2000) {
    return { valid: false, normalized: null, error: "return_url_too_long" };
  }

  const lower = trimmed.toLowerCase();

  for (const blocked of BLOCKED_SCHEMES) {
    if (lower.startsWith(blocked)) {
      return { valid: false, normalized: null, error: "invalid_return_url" };
    }
  }

  const normalized = normalizeReturnUrl(trimmed);

  if (!normalized) {
    return { valid: false, normalized: null, error: "invalid_return_url" };
  }

  return { valid: true, normalized };
}

export function validateReturnButtonLabel(value: string | null | undefined): {
  valid: boolean;
  normalized: string | null;
  error?: "return_button_label_too_long";
} {
  if (value === null || value === undefined) {
    return { valid: true, normalized: null };
  }

  if (typeof value !== "string") {
    return { valid: true, normalized: null };
  }

  const trimmed = value.trim();

  if (!trimmed) {
    return { valid: true, normalized: null };
  }

  if (trimmed.length > 120) {
    return { valid: false, normalized: null, error: "return_button_label_too_long" };
  }

  return { valid: true, normalized: trimmed };
}
