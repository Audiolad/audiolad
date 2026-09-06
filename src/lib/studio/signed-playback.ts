export const STUDIO_PLAYBACK_URL_TTL_SECONDS = 4 * 60 * 60;
export const STUDIO_PLAYBACK_URL_REFRESH_MARGIN_MS = 5 * 60 * 1000;

export type StudioSignedPlayback = {
  url: string;
  expiresAt: number;
  durationSeconds: number | null;
};

export function getStudioPlaybackExpiryMs(
  ttlSeconds = STUDIO_PLAYBACK_URL_TTL_SECONDS,
  now = Date.now(),
): number {
  const safeTtl =
    Number.isFinite(ttlSeconds) && ttlSeconds > 0
      ? ttlSeconds
      : STUDIO_PLAYBACK_URL_TTL_SECONDS;
  return now + safeTtl * 1000;
}

export function parseStudioPlaybackExpiry(
  expiresAt: string | number | null | undefined,
): number | null {
  if (typeof expiresAt === "number" && Number.isFinite(expiresAt) && expiresAt > 0) {
    return expiresAt;
  }
  if (typeof expiresAt === "string" && expiresAt.trim()) {
    const parsed = Date.parse(expiresAt);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function shouldRefreshStudioPlaybackUrl(
  expiresAt: number | null | undefined,
  now = Date.now(),
  marginMs = STUDIO_PLAYBACK_URL_REFRESH_MARGIN_MS,
): boolean {
  if (expiresAt == null || !Number.isFinite(expiresAt)) {
    return true;
  }
  return expiresAt - now <= marginMs;
}

export function createStudioPlaybackRangeRequestInit(
  startByte: number,
  endByte?: number,
): RequestInit {
  const start = Number.isFinite(startByte) && startByte >= 0 ? Math.floor(startByte) : 0;
  const end =
    endByte == null || !Number.isFinite(endByte) ? "" : String(Math.floor(endByte));
  return {
    method: "GET",
    headers: {
      Range: `bytes=${start}-${end}`,
    },
  };
}

export function isPartialContentStatus(status: number): boolean {
  return status === 206;
}

export function applyStudioMediaElementSrcRefresh<
  T extends { src: string; currentTime: number },
>(
  media: T,
  nextUrl: string,
): {
  srcChanged: boolean;
  preservedTime: number;
  recreateMediaElementSource: false;
} {
  const preservedTime = Number.isFinite(media.currentTime)
    ? media.currentTime
    : 0;
  if (!nextUrl || media.src === nextUrl) {
    return {
      srcChanged: false,
      preservedTime,
      recreateMediaElementSource: false,
    };
  }
  media.src = nextUrl;
  return {
    srcChanged: true,
    preservedTime,
    recreateMediaElementSource: false,
  };
}
