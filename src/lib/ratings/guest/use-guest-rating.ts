"use client";

import { useEffect, useState } from "react";

import { requestGuestCaptchaToken, type GuestCaptchaWidget } from "@/lib/ratings/guest/captcha-client";
import { guestRatingMessageForError, GUEST_RATING_CAPTCHA_NOTICE } from "@/lib/ratings/guest/copy";
import { RATING_THANKS_COPY } from "@/lib/ratings/client";
import type { PracticeRatingAggregate } from "@/lib/ratings/types";

type GuestRatingResponse = {
  stars: number | null;
  ratingEligible: boolean;
  aggregate: PracticeRatingAggregate;
  guestAggregate: PracticeRatingAggregate | null;
  captcha: GuestCaptchaWidget | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  changed?: boolean;
};

export type GuestRatingControlState = {
  stars: number | null;
  ratingEligible: boolean;
  pendingStars: number | null;
  message: string | null;
  notice: string | null;
  aggregate: PracticeRatingAggregate;
  guestAggregate: PracticeRatingAggregate | null;
};

async function readRating(apiPath: string): Promise<GuestRatingResponse> {
  const response = await fetch(apiPath, { method: "GET", credentials: "same-origin" });
  const payload = (await response.json().catch(() => null)) as (GuestRatingResponse & { error?: string }) | null;
  if (!response.ok || !payload) {
    throw new Error(payload?.error ?? "rating_get_failed");
  }
  return payload;
}

async function sendRating(
  apiPath: string,
  stars: number,
  captchaToken?: string,
): Promise<GuestRatingResponse & { error?: string; status: number }> {
  const response = await fetch(apiPath, {
    method: "PUT",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      stars,
      ...(captchaToken ? { captchaToken } : {}),
    }),
  });
  const payload = (await response.json().catch(() => null)) as
    | (GuestRatingResponse & { error?: string; captcha?: GuestCaptchaWidget | null })
    | null;
  return {
    status: response.status,
    stars: payload?.stars ?? null,
    ratingEligible: payload?.ratingEligible ?? false,
    aggregate: payload?.aggregate ?? { totalStars: 0, ratingCount: 0 },
    guestAggregate: payload?.guestAggregate ?? null,
    captcha: payload?.captcha ?? null,
    changed: payload?.changed,
    error: payload?.error,
  };
}

export function useGuestPracticeRating(input: {
  enabled: boolean;
  apiPath: string;
  initialAggregate: PracticeRatingAggregate;
}) {
  const [ui, setUi] = useState<GuestRatingControlState>({
    stars: null,
    ratingEligible: false,
    pendingStars: null,
    message: null,
    notice: null,
    aggregate: input.initialAggregate,
    guestAggregate: null,
  });
  const [captcha, setCaptcha] = useState<GuestCaptchaWidget | null>(null);

  useEffect(() => {
    if (!input.enabled) return;
    let cancelled = false;
    void readRating(input.apiPath)
      .then((state) => {
        if (cancelled) return;
        setCaptcha(state.captcha);
        setUi((current) => ({
          ...current,
          stars: state.stars,
          ratingEligible: state.ratingEligible,
          aggregate: state.aggregate,
          guestAggregate: state.guestAggregate,
          message: state.stars != null ? RATING_THANKS_COPY : null,
        }));
      })
      .catch(() => {
        // GET is advisory. PUT checks eligibility again.
      });
    return () => {
      cancelled = true;
    };
  }, [input.apiPath, input.enabled]);

  async function onSelectStar(nextStars: number) {
    if (ui.pendingStars != null) return;
    const previousStars = ui.stars;
    setUi((current) => ({ ...current, pendingStars: nextStars, stars: nextStars, message: null }));

    const submit = async (token?: string) => sendRating(input.apiPath, nextStars, token);

    try {
      let result = await submit();
      if (result.error === "captcha_required" && result.captcha?.siteKey) {
        setCaptcha(result.captcha);
        setUi((current) => ({ ...current, notice: GUEST_RATING_CAPTCHA_NOTICE }));
        const token = await requestGuestCaptchaToken(result.captcha);
        result = await submit(token);
      } else if (captcha?.siteKey && result.error === "captcha_required") {
        const token = await requestGuestCaptchaToken(captcha);
        result = await submit(token);
      }

      if (result.error || result.status >= 400) {
        setUi((current) => ({
          ...current,
          stars: previousStars,
          pendingStars: null,
          message: guestRatingMessageForError(result.error),
          notice: result.error === "captcha_required" ? GUEST_RATING_CAPTCHA_NOTICE : current.notice,
        }));
        if (result.captcha) setCaptcha(result.captcha);
        return;
      }

      setUi((current) => ({
        ...current,
        stars: result.stars,
        ratingEligible: true,
        pendingStars: null,
        message: RATING_THANKS_COPY,
        notice: null,
        aggregate: result.aggregate ?? current.aggregate,
        guestAggregate: result.guestAggregate,
      }));
    } catch {
      setUi((current) => ({
        ...current,
        stars: previousStars,
        pendingStars: null,
        message: guestRatingMessageForError("captcha_unavailable"),
      }));
    }
  }

  return { ui, onSelectStar };
}
