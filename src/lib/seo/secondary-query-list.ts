import { PRODUCT_CONTENT_LIMITS } from "@/lib/author-products/limits";
import {
  canAddSecondaryQuery,
  clipSeoQuery,
  isSameSeoQuery,
} from "@/lib/seo/wordstat/ui";

const NUMBERED_LIST_PREFIX = /^\d+[.)]\s+/;
const BULLET_LIST_PREFIX = /^[-\u2022]\s+/;

export type ParseSeoSecondaryQueryListOptions = {
  existing?: string[];
  primaryQuery?: string;
};

export type ParseSeoSecondaryQueryListResult = {
  next: string[];
  added: string[];
  addedCount: number;
  skippedEmpty: number;
  skippedDuplicates: number;
  skippedPrimary: number;
  skippedFull: number;
};

export function stripObviousSeoListPrefix(value: string): string {
  return value
    .replace(NUMBERED_LIST_PREFIX, "")
    .replace(BULLET_LIST_PREFIX, "");
}

function splitSecondaryQueryText(text: string): string[] {
  return text.split(/[,;\n]/);
}

function formatRussianPhraseCount(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) {
    return `${count} фразу`;
  }
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return `${count} фразы`;
  }
  return `${count} фраз`;
}

export function parseSeoSecondaryQueryList(
  text: string,
  options: ParseSeoSecondaryQueryListOptions = {},
): ParseSeoSecondaryQueryListResult {
  const existing = options.existing ?? [];
  const primaryQuery = options.primaryQuery?.trim() ?? "";
  const seenInPaste: string[] = [];
  let skippedEmpty = 0;
  let skippedDuplicates = 0;
  let skippedPrimary = 0;
  let skippedFull = 0;
  let next = [...existing];
  const added: string[] = [];

  for (const rawPart of splitSecondaryQueryText(text)) {
    const stripped = stripObviousSeoListPrefix(rawPart.trim()).trim();
    const clipped = clipSeoQuery(
      stripped,
      PRODUCT_CONTENT_LIMITS.seoSecondaryQuery,
    );
    if (!clipped) {
      skippedEmpty += 1;
      continue;
    }

    if (primaryQuery && isSameSeoQuery(clipped, primaryQuery)) {
      skippedPrimary += 1;
      continue;
    }

    if (seenInPaste.some((item) => isSameSeoQuery(item, clipped))) {
      skippedDuplicates += 1;
      continue;
    }
    seenInPaste.push(clipped);

    const result = canAddSecondaryQuery(clipped, next);
    if (!result.ok) {
      if (result.reason === "duplicate") {
        skippedDuplicates += 1;
      } else if (result.reason === "full") {
        skippedFull += 1;
      } else {
        skippedEmpty += 1;
      }
      continue;
    }

    next = result.next;
    added.push(clipped);
  }

  return {
    next,
    added,
    addedCount: added.length,
    skippedEmpty,
    skippedDuplicates,
    skippedPrimary,
    skippedFull,
  };
}

export function formatSeoSecondaryQueryBulkMessage(
  result: ParseSeoSecondaryQueryListResult,
): string | null {
  const parts: string[] = [];

  if (result.addedCount > 0 && result.skippedFull > 0) {
    parts.push(
      `Добавлено ${formatRussianPhraseCount(result.addedCount)}. Можно использовать не больше 10.`,
    );
  }

  if (result.skippedDuplicates > 0) {
    parts.push("Некоторые фразы уже были добавлены.");
  }

  if (parts.length === 0) {
    return null;
  }

  return parts.join(" ");
}
