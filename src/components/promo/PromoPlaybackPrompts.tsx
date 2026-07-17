"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  trackPromoEvent,
  trackPromoMilestoneOnce,
} from "@/lib/promo/analytics-client";
import type { PromoAttribution } from "@/lib/promo/attribution";
import {
  buildPromoSignUpHref,
  buildPromoSignupContext,
  dismissPromoSignupPrompt,
  isPromoSignupPromptDismissed,
  storePromoSignupContext,
} from "@/lib/promo/signup-context";

type PromoPlaybackPromptsProps = {
  enabled: boolean;
  practiceId: string;
  practiceSlug: string;
  authorSlug: string;
  productSlug: string;
  trackId: string | null;
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  programCompleted: boolean;
  attribution: PromoAttribution | null;
  onReplay: () => void;
};

const MIDPOINT_THRESHOLD = 0.375;

function getProgressMilestone(
  ratio: number,
): "promo_practice_progress_25" | "promo_practice_progress_50" | "promo_practice_progress_75" | null {
  if (ratio >= 0.75) {
    return "promo_practice_progress_75";
  }

  if (ratio >= 0.5) {
    return "promo_practice_progress_50";
  }

  if (ratio >= 0.25) {
    return "promo_practice_progress_25";
  }

  return null;
}

export default function PromoPlaybackPrompts({
  enabled,
  practiceId,
  practiceSlug,
  authorSlug,
  productSlug,
  trackId,
  currentTime,
  duration,
  isPlaying,
  programCompleted,
  attribution,
  onReplay,
}: PromoPlaybackPromptsProps) {
  const router = useRouter();
  const [midPromptDismissed, setMidPromptDismissed] = useState(false);
  const playStartedTrackedRef = useRef(false);
  const completionTrackedRef = useRef(false);
  const midPromptShownTrackedRef = useRef(false);

  const listenReturnPath = `/listen/${authorSlug}/${productSlug}`;
  const progressRatio = duration > 0 ? currentTime / duration : 0;
  const shouldShowMidPrompt =
    enabled &&
    Boolean(trackId) &&
    duration > 0 &&
    progressRatio >= MIDPOINT_THRESHOLD &&
    !isPromoSignupPromptDismissed(practiceId) &&
    !programCompleted &&
    !midPromptDismissed;

  const navigateToSignup = useCallback(
    (intent: "save_practice" | "get_gifts") => {
      const context = buildPromoSignupContext({
        returnTo: listenReturnPath,
        practiceSlug,
        practiceId,
        trackId,
        position: currentTime,
        intent: intent === "get_gifts" ? "get_gifts" : "save_practice",
        attribution,
      });

      if (!context) {
        return;
      }

      storePromoSignupContext(context);

      void trackPromoEvent("promo_signup_clicked", {
        practiceId,
        trackId,
        attribution,
        currentPosition: currentTime,
        duration,
      });

      router.push(buildPromoSignUpHref(context));
    },
    [
      attribution,
      currentTime,
      duration,
      listenReturnPath,
      practiceId,
      practiceSlug,
      router,
      trackId,
    ],
  );

  useEffect(() => {
    if (!enabled || !isPlaying || playStartedTrackedRef.current) {
      return;
    }

    playStartedTrackedRef.current = true;

    void trackPromoEvent("promo_practice_play_started", {
      practiceId,
      trackId,
      attribution,
      currentPosition: currentTime,
      duration,
    });
  }, [
    attribution,
    currentTime,
    duration,
    enabled,
    isPlaying,
    practiceId,
    trackId,
  ]);

  useEffect(() => {
    if (!enabled || !trackId || duration <= 0) {
      return;
    }

    const milestone = getProgressMilestone(progressRatio);

    if (milestone) {
      trackPromoMilestoneOnce(milestone, {
        practiceId,
        trackId,
        attribution,
        currentPosition: currentTime,
        duration,
      });
    }
  }, [
    attribution,
    currentTime,
    duration,
    enabled,
    practiceId,
    progressRatio,
    trackId,
  ]);

  useEffect(() => {
    if (!shouldShowMidPrompt || midPromptShownTrackedRef.current) {
      return;
    }

    midPromptShownTrackedRef.current = true;

    void trackPromoEvent("promo_signup_prompt_shown", {
      practiceId,
      trackId,
      attribution,
      currentPosition: currentTime,
      duration,
    });
  }, [
    attribution,
    currentTime,
    duration,
    practiceId,
    shouldShowMidPrompt,
    trackId,
  ]);

  useEffect(() => {
    if (!enabled || !programCompleted || completionTrackedRef.current) {
      return;
    }

    completionTrackedRef.current = true;

    void trackPromoEvent("promo_practice_completed", {
      practiceId,
      trackId,
      attribution,
      currentPosition: duration,
      duration,
    });
  }, [
    attribution,
    duration,
    enabled,
    practiceId,
    programCompleted,
    trackId,
  ]);

  if (!enabled) {
    return null;
  }

  return (
    <>
      {shouldShowMidPrompt ? (
        <section
          className="mt-4 rounded-[20px] border border-white/20 bg-[#2f1a52]/90 px-4 py-4 backdrop-blur-sm"
          role="region"
          aria-label="Предложение регистрации"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-white">Нравится практика?</p>
              <p className="mt-1 text-sm leading-6 text-white/75">
                Сохраните её в свою Аудиотеку и получите ещё три практики в подарок.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                dismissPromoSignupPrompt(practiceId);
                setMidPromptDismissed(true);
              }}
              className="min-h-8 min-w-8 rounded-full text-lg leading-none text-white/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              aria-label="Закрыть"
            >
              ×
            </button>
          </div>
          <button
            type="button"
            onClick={() => navigateToSignup("save_practice")}
            className="mt-4 w-full min-h-11 rounded-full bg-white px-4 py-2 text-sm font-semibold text-[#4b2f86] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            Сохранить и получить подарки
          </button>
        </section>
      ) : null}

      {programCompleted ? (
        <section
          className="mt-6 rounded-[24px] border border-white/20 bg-white/10 px-5 py-5"
          role="region"
          aria-label="Практика завершена"
        >
          <p className="text-lg font-semibold text-white">Практика завершена</p>
          <p className="mt-2 text-sm leading-6 text-white/75">
            Сохраните её, чтобы возвращаться к ней снова. После регистрации мы
            добавим в вашу Аудиотеку ещё три практики в подарок.
          </p>
          <button
            type="button"
            onClick={() => navigateToSignup("get_gifts")}
            className="mt-4 w-full min-h-11 rounded-full bg-white px-4 py-2 text-sm font-semibold text-[#4b2f86] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            Получить 4 практики в подарок
          </button>
          <button
            type="button"
            onClick={onReplay}
            className="mt-3 w-full min-h-11 rounded-full border border-white/25 bg-transparent px-4 py-2 text-sm font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            Послушать ещё раз
          </button>
        </section>
      ) : null}
    </>
  );
}
