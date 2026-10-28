"use client";

import { GUEST_COFFEE_ATMOSPHERE_COPY } from "@/lib/business-app/guest-coffee/copy";

/** Visible assembling moment: one step per line, short but noticeable. */
export const ATMOSPHERE_STEP_MS = 520;
export const ATMOSPHERE_REDUCED_MOTION_MS = 450;

export function prefersReducedAtmosphereMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

/** The same three lines the guest coffee funnel shows while a playlist is built. */
export function atmosphereAssemblingSteps(directionLabel: string): string[] {
  return [
    `Подбираем треки по звучанию «${directionLabel}»…`,
    "Сверяем время суток и характер заведения…",
    "Сводим треки в одну подборку…",
  ];
}

/**
 * Guest coffee assembling card: bars and the stepped lines.
 * The cabinet «Создать атмосферу» action uses this same card, not a second style.
 */
export function AtmosphereAssembling({ step, steps }: { step: number; steps: readonly string[] }) {
  return (
    <div className="business-app-card business-atmosphere-assembling" role="status" data-testid="biz-atmosphere-assembling">
      <span className="business-atmosphere-bars" aria-hidden="true">
        <span />
        <span />
        <span />
        <span />
        <span />
      </span>
      <p className="business-atmosphere-assembling__title">{GUEST_COFFEE_ATMOSPHERE_COPY.assemblingTitle}</p>
      <ol className="business-atmosphere-steps">
        {steps.map((text, i) => (
          <li key={text} data-state={i < step ? "done" : i === step ? "active" : "next"}>
            {text}
          </li>
        ))}
      </ol>
    </div>
  );
}
