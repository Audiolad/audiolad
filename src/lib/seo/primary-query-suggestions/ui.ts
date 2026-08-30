import { PRIMARY_QUERY_AI_FALLBACK_FAILED_COPY } from "@/lib/seo/primary-query-suggestions/errors";

export const PRIMARY_QUERY_LOADING_WORDSTAT = "Ищем варианты в Яндексе…";
export const PRIMARY_QUERY_LOADING_AI = "Подбираем другую формулировку…";
export const PRIMARY_QUERY_LOADING_AI_CHECK = "Проверяем вариант в Яндексе…";
export const PRIMARY_QUERY_INITIAL_SUBMIT_CTA = "Подобрать в Яндексе";
export const PRIMARY_QUERY_RESEARCH_CTA = "Проверить другой вариант";
export const PRIMARY_QUERY_AI_ALTERNATIVES_HEADING = "Варианты формулировки";
export const PRIMARY_QUERY_AI_ALTERNATIVES_HINT =
  "Проверим их по данным Яндекса.";

export { PRIMARY_QUERY_AI_FALLBACK_FAILED_COPY };

export function resolvePrimaryQueryLoadingCopy(
  stage: "wordstat_initial" | "ai_suggesting" | "wordstat_ai_primary" | null,
): string {
  if (stage === "ai_suggesting") {
    return PRIMARY_QUERY_LOADING_AI;
  }

  if (stage === "wordstat_ai_primary") {
    return PRIMARY_QUERY_LOADING_AI_CHECK;
  }

  return PRIMARY_QUERY_LOADING_WORDSTAT;
}

export function resolvePickerSubmitLabel(hasAutoSearched: boolean): string {
  return hasAutoSearched
    ? PRIMARY_QUERY_RESEARCH_CTA
    : PRIMARY_QUERY_INITIAL_SUBMIT_CTA;
}

export function resolvePickerScrollBehavior(
  prefersReducedMotion: boolean,
): ScrollBehavior {
  return prefersReducedMotion ? "auto" : "smooth";
}

export function scheduleWordstatPickerScroll(
  element: HTMLElement | null,
  options: {
    matchMedia?: (query: string) => { matches: boolean };
  } = {},
): boolean {
  if (!element || typeof element.scrollIntoView !== "function") {
    return false;
  }

  const media =
    options.matchMedia ??
    (typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia.bind(window)
      : null);
  const prefersReducedMotion = media
    ? media("(prefers-reduced-motion: reduce)").matches
    : false;

  element.scrollIntoView({
    behavior: resolvePickerScrollBehavior(prefersReducedMotion),
    block: "start",
  });
  return true;
}

export function planPrimaryCtaPickerOpen(input: {
  seed: string;
  shouldSearch: boolean;
}): {
  seed: string;
  shouldSearch: boolean;
  shouldScroll: boolean;
  stealFocus: false;
} {
  return {
    seed: input.seed,
    shouldSearch: input.shouldSearch,
    shouldScroll: true,
    stealFocus: false,
  };
}
