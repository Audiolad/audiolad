import { getAppOrigin, PRODUCTION_APP_ORIGIN } from "@/lib/seo/app-origin";

const SIGNED_URL_PATTERNS = [
  /[?&]token=/i,
  /X-Amz-/i,
  /[?&]signature=/i,
  /\/object\/sign\//i,
];

const LOCALHOST_PATTERNS = [
  /^https?:\/\/localhost(?::\d+)?(?:\/|$)/i,
  /^https?:\/\/127\.0\.0\.1(?::\d+)?(?:\/|$)/i,
];

export function isSignedOrTemporaryUrl(url: string): boolean {
  return SIGNED_URL_PATTERNS.some((pattern) => pattern.test(url));
}

export function isLocalhostUrl(url: string): boolean {
  return LOCALHOST_PATTERNS.some((pattern) => pattern.test(url));
}

export function isSupabaseStorageUrl(url: string): boolean {
  return /\/storage\/v1\/object\//i.test(url);
}

export function toAbsoluteUrl(
  urlOrPath: string | null | undefined,
  origin = getAppOrigin(),
): string | null {
  const trimmed = urlOrPath?.trim();

  if (!trimmed) {
    return null;
  }

  if (trimmed.startsWith("/")) {
    return `${origin.replace(/\/$/, "")}${trimmed}`;
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  return null;
}

export function isSafeJsonLdImageUrl(url: string | null | undefined): url is string {
  const absolute = toAbsoluteUrl(url);

  if (!absolute) {
    return false;
  }

  if (isLocalhostUrl(absolute)) {
    return false;
  }

  if (isSignedOrTemporaryUrl(absolute)) {
    return false;
  }

  if (absolute.includes("www.audiolad.ru")) {
    return false;
  }

  return /^https:\/\//i.test(absolute);
}

export function isSafeJsonLdAudioContentUrl(
  url: string | null | undefined,
): url is string {
  const absolute = toAbsoluteUrl(url);

  if (!absolute) {
    return false;
  }

  if (isLocalhostUrl(absolute)) {
    return false;
  }

  if (isSignedOrTemporaryUrl(absolute)) {
    return false;
  }

  if (isSupabaseStorageUrl(absolute)) {
    return false;
  }

  try {
    const parsed = new URL(absolute);
    const origin = getAppOrigin();

    return parsed.origin === origin || parsed.origin === PRODUCTION_APP_ORIGIN;
  } catch {
    return false;
  }
}

export function resolveJsonLdImageUrl(
  url: string | null | undefined,
  origin = getAppOrigin(),
): string | null {
  const absolute = toAbsoluteUrl(url, origin);

  if (!absolute || !isSafeJsonLdImageUrl(absolute)) {
    return null;
  }

  return absolute;
}
