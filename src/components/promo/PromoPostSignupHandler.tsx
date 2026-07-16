"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { trackPromoEvent } from "@/lib/promo/analytics-client";
import { clearGuestPracticeProgress, readGuestPracticeProgress } from "@/lib/promo/guest-progress";
import {
  clearPromoSignupContext,
  readPromoSignupContext,
} from "@/lib/promo/signup-context";
import { createClient } from "@/lib/supabase/client";

type PromoPostSignupHandlerProps = {
  practiceId: string;
  practiceSlug: string;
  onCompleted?: (input: {
    inserted: boolean;
    practiceCompleted: boolean;
  }) => void;
};

export default function PromoPostSignupHandler({
  practiceId,
  practiceSlug,
  onCompleted,
}: PromoPostSignupHandlerProps) {
  const router = useRouter();
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (running) {
      return;
    }

    let cancelled = false;

    async function completeSignup() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        return;
      }

      const pending = readPromoSignupContext();

      if (!pending || pending.practiceId !== practiceId) {
        return;
      }

      setRunning(true);

      const guestProgress = readGuestPracticeProgress(practiceId);

      try {
        const response = await fetch("/api/promo/complete-signup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            practice_slug: practiceSlug,
            progress: guestProgress
              ? {
                  audio_item_id: guestProgress.trackId,
                  position_seconds: guestProgress.positionSeconds,
                  completed: guestProgress.completed,
                }
              : pending.trackId
                ? {
                    audio_item_id: pending.trackId,
                    position_seconds: pending.position ?? 0,
                    completed: false,
                  }
                : null,
          }),
        });

        if (!response.ok) {
          return;
        }

        clearPromoSignupContext();
        clearGuestPracticeProgress(practiceId);

        if (!cancelled) {
          onCompleted?.({
            inserted: response.status === 201,
            practiceCompleted: guestProgress?.completed === true,
          });
          router.refresh();
        }
      } finally {
        if (!cancelled) {
          setRunning(false);
        }
      }
    }

    void completeSignup();

    return () => {
      cancelled = true;
    };
  }, [onCompleted, practiceId, practiceSlug, router, running]);

  return null;
}

type PromoSignupSuccessBannerProps = {
  practiceCompleted: boolean;
  onContinueListening: () => void;
  onDismiss: () => void;
};

export function PromoSignupSuccessBanner({
  practiceCompleted,
  onContinueListening,
  onDismiss,
}: PromoSignupSuccessBannerProps) {
  return (
    <section className="mt-4 rounded-[20px] border border-white/20 bg-[#2f1a52]/95 px-4 py-4 backdrop-blur-sm">
      <p className="text-sm font-semibold text-white">Готово!</p>
      <p className="mt-1 text-sm leading-6 text-white/75">
        Практика сохранена, а три подарка уже добавлены в вашу Аудиотеку.
      </p>
      <div className="mt-4 flex flex-col gap-2">
        {practiceCompleted ? (
          <Link
            href="/my-practices"
            onClick={() => {
              void trackPromoEvent("promo_gifts_opened", {
                practiceId: null,
                trackId: null,
              });
            }}
            className="inline-flex min-h-11 items-center justify-center rounded-full bg-white px-4 py-2 text-sm font-semibold text-[#4b2f86] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            Открыть мои подарки
          </Link>
        ) : (
          <button
            type="button"
            onClick={onContinueListening}
            className="min-h-11 rounded-full bg-white px-4 py-2 text-sm font-semibold text-[#4b2f86] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            Продолжить слушать
          </button>
        )}
        <button
          type="button"
          onClick={onDismiss}
          className="min-h-11 rounded-full border border-white/25 px-4 py-2 text-sm font-semibold text-white/85 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          Остаться здесь
        </button>
      </div>
    </section>
  );
}
