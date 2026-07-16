import { buildAuthRouteHref, resolveValidatedNextPath } from "@/lib/auth/routes";
import type { PromoAttribution } from "@/lib/promo/attribution";

export type PromoSignupIntent =
  | "save_practice"
  | "get_gifts"
  | "library"
  | "profile";

export type PromoSignupContext = {
  returnTo: string;
  practiceSlug: string;
  practiceId: string;
  trackId: string | null;
  position: number | null;
  intent: PromoSignupIntent;
  source: string | null;
  campaign: string | null;
  savedAt: string;
};

const PENDING_SIGNUP_KEY = "audiolad_promo_pending";

function normalizeIntent(value: string | null | undefined): PromoSignupIntent {
  switch (value) {
    case "save_practice":
    case "get_gifts":
    case "library":
    case "profile":
      return value;
    default:
      return "save_practice";
  }
}

export function buildPromoSignupContext(input: {
  returnTo: string;
  practiceSlug: string;
  practiceId: string;
  trackId?: string | null;
  position?: number | null;
  intent?: PromoSignupIntent;
  attribution?: PromoAttribution | null;
}): PromoSignupContext | null {
  const returnTo = resolveValidatedNextPath(input.returnTo);

  if (!returnTo) {
    return null;
  }

  return {
    returnTo,
    practiceSlug: input.practiceSlug.trim(),
    practiceId: input.practiceId,
    trackId: input.trackId ?? null,
    position:
      typeof input.position === "number" && Number.isFinite(input.position)
        ? Math.max(0, Math.floor(input.position))
        : null,
    intent: input.intent ?? "save_practice",
    source: input.attribution?.source ?? null,
    campaign: input.attribution?.campaign ?? null,
    savedAt: new Date().toISOString(),
  };
}

export function storePromoSignupContext(context: PromoSignupContext): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.setItem(PENDING_SIGNUP_KEY, JSON.stringify(context));
  } catch {
    // sessionStorage unavailable
  }
}

export function readPromoSignupContext(): PromoSignupContext | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.sessionStorage.getItem(PENDING_SIGNUP_KEY);

    if (!raw) {
      return null;
    }

    const parsed: unknown = JSON.parse(raw);

    if (typeof parsed !== "object" || parsed === null) {
      return null;
    }

    const record = parsed as Record<string, unknown>;
    const returnTo = resolveValidatedNextPath(record.returnTo as string);

    if (!returnTo) {
      return null;
    }

    return {
      returnTo,
      practiceSlug:
        typeof record.practiceSlug === "string" ? record.practiceSlug : "",
      practiceId:
        typeof record.practiceId === "string" ? record.practiceId : "",
      trackId:
        typeof record.trackId === "string" ? record.trackId : null,
      position:
        typeof record.position === "number" && Number.isFinite(record.position)
          ? Math.max(0, Math.floor(record.position))
          : null,
      intent: normalizeIntent(record.intent as string | undefined),
      source: typeof record.source === "string" ? record.source : null,
      campaign: typeof record.campaign === "string" ? record.campaign : null,
      savedAt:
        typeof record.savedAt === "string"
          ? record.savedAt
          : new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export function clearPromoSignupContext(): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.removeItem(PENDING_SIGNUP_KEY);
  } catch {
    // sessionStorage unavailable
  }
}

export function buildPromoSignUpHref(context: PromoSignupContext): string {
  return buildAuthRouteHref("/auth/sign-up", context.returnTo, {
    intent: context.intent,
    practice: context.practiceSlug,
  });
}

const PROMPT_DISMISSED_PREFIX = "audiolad_promo_prompt_dismissed:";

export function isPromoSignupPromptDismissed(practiceId: string): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    return (
      window.sessionStorage.getItem(`${PROMPT_DISMISSED_PREFIX}${practiceId}`) ===
      "1"
    );
  } catch {
    return false;
  }
}

export function dismissPromoSignupPrompt(practiceId: string): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.setItem(
      `${PROMPT_DISMISSED_PREFIX}${practiceId}`,
      "1",
    );
  } catch {
    // sessionStorage unavailable
  }
}
