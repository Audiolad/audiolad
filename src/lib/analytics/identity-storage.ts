export const ANONYMOUS_ID_KEY = "audiolad_anonymous_id";

const MAX_ANONYMOUS_ID_LENGTH = 128;

function generateAnonymousId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `anon-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function isValidAnonymousId(value: string | null | undefined): value is string {
  if (typeof value !== "string") {
    return false;
  }

  const trimmed = value.trim();

  return trimmed.length > 0 && trimmed.length <= MAX_ANONYMOUS_ID_LENGTH;
}

export function readAnonymousId(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const existing = window.localStorage.getItem(ANONYMOUS_ID_KEY);
    return isValidAnonymousId(existing) ? existing.trim() : null;
  } catch {
    return null;
  }
}

export function getOrCreateAnonymousId(): string {
  if (typeof window === "undefined") {
    return generateAnonymousId();
  }

  try {
    const existing = readAnonymousId();

    if (existing) {
      return existing;
    }

    const next = generateAnonymousId();
    window.localStorage.setItem(ANONYMOUS_ID_KEY, next);
    return next;
  } catch {
    return generateAnonymousId();
  }
}
