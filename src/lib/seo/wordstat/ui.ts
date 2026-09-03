import {
  AUTHOR_SEO_SECONDARY_ACTIVE_MAX,
  PRODUCT_CONTENT_LIMITS,
} from "@/lib/author-products/limits";
import { wordstatPhraseKey } from "@/lib/seo/wordstat/phrase";
import type { WordstatOpportunityColor } from "@/lib/seo/wordstat/types";

export function isSameSeoQuery(left: string, right: string): boolean {
  return wordstatPhraseKey(left) === wordstatPhraseKey(right);
}

export function clipSeoQuery(value: string, max: number): string {
  return value.trim().replace(/\s+/g, " ").slice(0, max);
}

export function formatWordstatCount(count: number): string {
  return `${count.toLocaleString("ru-RU")} запросов за последние 30 дней`;
}

export function getWordstatPrimaryCtaLabel(primaryQuery: string): string {
  return primaryQuery.trim()
    ? "Подобрать похожие"
    : "Помочь подобрать запрос";
}

/** Primary CTA opens the picker and runs Wordstat in the same click. */
export const PRIMARY_CTA_AUTO_SEARCH = true;

export const WORDSTAT_SUGGESTIONS_PATH =
  "/api/author/seo/wordstat/suggestions" as const;

export function buildInitialWordstatSeed(title: string): string {
  const collapsed = title.trim().replace(/\s+/g, " ");
  const pipeIndex = collapsed.indexOf("|");
  const head = pipeIndex === -1 ? collapsed : collapsed.slice(0, pipeIndex);
  return clipSeoQuery(head, PRODUCT_CONTENT_LIMITS.seoPrimaryQuery);
}

export function resolveWordstatSeed(input: {
  seoPrimaryQuery: string;
  title: string;
}): string {
  const primary = input.seoPrimaryQuery.trim();
  if (primary) {
    return primary;
  }

  return buildInitialWordstatSeed(input.title);
}

export function shouldAutoSearchOnPrimaryCta(seoPrimaryQuery: string): boolean {
  return PRIMARY_CTA_AUTO_SEARCH && !seoPrimaryQuery.trim();
}

export function planWordstatPickerOpen(input: {
  seoPrimaryQuery: string;
  title: string;
  seedOverride?: string;
  autoSearch?: boolean;
}): { seed: string; shouldSearch: boolean } {
  const seed =
    input.seedOverride?.trim() ||
    resolveWordstatSeed({
      seoPrimaryQuery: input.seoPrimaryQuery,
      title: input.title,
    });

  return {
    seed,
    // Opening the picker is useful even for an untitled product. A request
    // without a phrase is not: it can only produce an invalid-query response.
    shouldSearch: Boolean(input.autoSearch && seed.trim()),
  };
}

export function resolveWordstatRequestPhrase(
  seedOverride: string | undefined,
  currentSeed: string,
): string {
  return seedOverride ?? currentSeed;
}

export function buildWordstatSuggestionsRequest(phrase: string): {
  url: typeof WORDSTAT_SUGGESTIONS_PATH;
  init: {
    method: "POST";
    headers: { "Content-Type": "application/json" };
    body: string;
  };
} {
  return {
    url: WORDSTAT_SUGGESTIONS_PATH,
    init: {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phrase }),
    },
  };
}

export function canAddSecondaryQuery(
  phrase: string,
  current: string[],
): { ok: true; next: string[] } | { ok: false; reason: "duplicate" | "full" | "empty" } {
  const clipped = clipSeoQuery(phrase, PRODUCT_CONTENT_LIMITS.seoSecondaryQuery);
  if (!clipped) {
    return { ok: false, reason: "empty" };
  }

  if (current.length >= AUTHOR_SEO_SECONDARY_ACTIVE_MAX) {
    return { ok: false, reason: "full" };
  }

  if (current.some((item) => isSameSeoQuery(item, clipped))) {
    return { ok: false, reason: "duplicate" };
  }

  return { ok: true, next: [...current, clipped] };
}

export function wordstatColorClasses(color: WordstatOpportunityColor): {
  card: string;
  badge: string;
  emoji: string;
  legend: string;
} {
  if (color === "green") {
    return {
      card: "border-[#b7d7b0] bg-[#f3faf1]",
      badge: "bg-[#d9efd4] text-[#2f6b2a]",
      emoji: "🟢",
      legend: "подходит для старта",
    };
  }

  if (color === "yellow") {
    return {
      card: "border-[#ead48a] bg-[#fff8e6]",
      badge: "bg-[#ffe9b0] text-[#7a5b12]",
      emoji: "🟡",
      legend: "стоит оценить внимательнее",
    };
  }

  return {
    card: "border-[#efb4b4] bg-[#fff3f3]",
    badge: "bg-[#f8d0d0] text-[#8b2d2d]",
    emoji: "🔴",
    legend: "лучше поискать другой вариант",
  };
}
