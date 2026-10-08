"use client";

import type { MouseEvent } from "react";

import type { MiniAppNextStep as MiniAppNextStepModel } from "@/lib/mini-app/next-step";

type MiniAppNextStepProps = {
  nextStep: MiniAppNextStepModel;
  /**
   * Opens the author's link through the mini-app bridge (MAX WebApp.openLink,
   * VK VKWebAppOpenLink). Returns false when the bridge helper could not open
   * it; the anchor then follows its own https href as the fallback.
   */
  onOpenLink: (url: string) => boolean;
  surface: "max" | "vk";
};

const BUTTON_CLASS =
  "mt-5 inline-flex min-h-11 w-full items-center justify-center rounded-[16px] bg-[#7042c5] px-5 py-2.5 text-center text-sm font-semibold text-white hover:bg-[#6338b0] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]";

/** Same «Следующий шаг» block as the canonical web audio_post card (NextStepRecommendation). */
export default function MiniAppNextStep({ nextStep, onOpenLink, surface }: MiniAppNextStepProps) {
  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    let opened = false;
    try {
      opened = onOpenLink(nextStep.url);
    } catch {
      opened = false;
    }
    if (opened) event.preventDefault();
  }

  return (
    <section
      className="mt-6 rounded-[26px] border border-[#eadff8] bg-[#fbf8ff] px-5 py-5 shadow-[0_10px_28px_rgba(91,62,145,0.06)]"
      aria-label="Рекомендация после прослушивания"
      data-practice-section="next-step"
      data-mini-app-next-step={surface}
    >
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#9485b4]">
        Следующий шаг
      </p>
      <h2 className="mt-2 text-[20px] font-semibold leading-snug text-[#25135c]">
        {nextStep.title}
      </h2>
      <p className="mt-3 whitespace-pre-line text-[15px] leading-7 text-[#65577f]">
        {nextStep.text}
      </p>
      <a
        href={nextStep.url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={handleClick}
        className={BUTTON_CLASS}
        data-mini-app-next-step-button=""
      >
        {nextStep.buttonText}
      </a>
    </section>
  );
}
