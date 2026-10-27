import {
  fromAudioPreviewWindowColumns,
  PREVIEW_DURATION_MAX_MS,
  resolvePlaybackPreviewWindow,
} from "@/lib/listen/preview-window";

/**
 * Who may hear the wizard atmosphere fragment.
 * Same open gate as the cabinet player (a live trial or paid period) without
 * issuing a gift. A venue row with no live period stays closed. A confirmed
 * listener account is not enough.
 */
export type OnboardingPreviewCaller = {
  signedIn: boolean;
  emailConfirmed: boolean;
  liveTrialOrPaid: boolean;
  hasActiveVenue: boolean;
};

export function authorizeOnboardingPreview(caller: OnboardingPreviewCaller): "allow" | "no_access" {
  if (!caller.signedIn || !caller.emailConfirmed) return "no_access";
  if (caller.hasActiveVenue && !caller.liveTrialOrPaid) return "no_access";
  if (!caller.liveTrialOrPaid) return "no_access";
  return "allow";
}

/** Same-origin media request (the audio element does not send JSON). */
export function isSameOriginCabinetRequest(headers: Headers): boolean {
  const site = headers.get("sec-fetch-site")?.toLowerCase();
  if (site) return site === "same-origin";
  const origin = headers.get("origin");
  const host = headers.get("x-forwarded-host")?.split(",")[0]?.trim() || headers.get("host");
  if (!origin || !host) return false;
  try {
    return new URL(origin).host.toLowerCase() === host.toLowerCase();
  } catch {
    return false;
  }
}

export function onboardingPreviewAudioPath(atmosphereId: string): string {
  return `/api/business/onboarding/preview/audio?atmosphereId=${encodeURIComponent(atmosphereId)}`;
}

/**
 * Storefront preview window, then capped at the catalog maximum (90s).
 * A missing window is the first 60s. A one-hour object never becomes the clip.
 */
export function onboardingPreviewFragment(row: {
  duration_seconds?: number | null;
  preview_start_ms?: number | null;
  preview_end_ms?: number | null;
}): { startMs: number; endMs: number } {
  const durationMs =
    typeof row.duration_seconds === "number" && Number.isFinite(row.duration_seconds) && row.duration_seconds > 0
      ? Math.round(row.duration_seconds * 1000)
      : null;
  const window = resolvePlaybackPreviewWindow(fromAudioPreviewWindowColumns(row), durationMs);
  const duration = Math.max(0, window.endMs - window.startMs);
  const capped = Math.min(duration, PREVIEW_DURATION_MAX_MS);
  return { startMs: window.startMs, endMs: window.startMs + capped };
}
