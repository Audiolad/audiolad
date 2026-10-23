import type { ListenAccessMode } from "@/lib/listen/types";
import type { GuestCaptchaDecision } from "@/lib/ratings/guest/suspicion";
import type { CaptchaVerifyResult } from "@/lib/ratings/guest/captcha";

export type GuestRatingWriteDecision =
  | { ok: true; verification: "listen" | "listen_captcha" }
  | {
      ok: false;
      status: 400 | 401 | 403 | 409 | 429 | 503;
      error: string;
      captchaMode?: GuestCaptchaDecision["mode"];
    };

/**
 * API policy for one guest vote. Registered users never reach this.
 * Hard rate limit is per guest id. A hot network only changes captchaMode.
 */
export function decideGuestRatingWrite(input: {
  collectEnabled: boolean;
  sessionPresent: boolean;
  sessionSecretConfigured: boolean;
  starsValid: boolean;
  eligible: boolean;
  claimed: boolean;
  hardRateLimited: boolean;
  captcha: GuestCaptchaDecision;
  captchaResult: CaptchaVerifyResult | null;
}): GuestRatingWriteDecision {
  if (!input.collectEnabled) {
    return { ok: false, status: 401, error: "unauthorized" };
  }
  if (!input.sessionSecretConfigured) {
    return { ok: false, status: 503, error: "guest_session_unavailable" };
  }
  if (!input.sessionPresent) {
    return { ok: false, status: 403, error: "guest_session_required" };
  }
  if (!input.starsValid) {
    return { ok: false, status: 400, error: "invalid_stars" };
  }
  if (input.hardRateLimited) {
    return { ok: false, status: 429, error: "rate_limited" };
  }
  if (input.claimed) {
    return { ok: false, status: 409, error: "guest_rating_claimed" };
  }
  if (!input.eligible) {
    return { ok: false, status: 403, error: "rating_not_eligible" };
  }
  if (input.captcha.mode !== "none") {
    const result = input.captchaResult;
    if (!result || result.ok === false && result.reason === "missing_token") {
      return {
        ok: false,
        status: 403,
        error: "captcha_required",
        captchaMode: input.captcha.mode,
      };
    }
    if (!result.ok && (result.reason === "provider_unavailable" || result.reason === "not_configured")) {
      return { ok: false, status: 503, error: "captcha_unavailable" };
    }
    if (!result.ok) {
      return {
        ok: false,
        status: 400,
        error: "captcha_invalid",
        captchaMode: "visible",
      };
    }
    return { ok: true, verification: "listen_captcha" };
  }
  return { ok: true, verification: "listen" };
}

export function guestListenKindForAccess(
  mode: ListenAccessMode | null | undefined,
): "preview" | "full" | null {
  if (mode === "catalog_preview") {
    return "preview";
  }
  if (mode === "entitled" || mode === "author_preview") {
    return "full";
  }
  return null;
}

export function shouldAccrueGuestListen(input: {
  collectEnabled: boolean;
  userId: string | null;
  isCourse: boolean;
  productKind: string | null | undefined;
  accessMode: ListenAccessMode | null;
}): boolean {
  if (!input.collectEnabled || input.userId || input.isCourse) {
    return false;
  }
  if (
    input.productKind != null &&
    input.productKind !== "practice" &&
    input.productKind !== "music" &&
    input.productKind !== "audio_post"
  ) {
    return false;
  }
  return guestListenKindForAccess(input.accessMode) != null;
}
