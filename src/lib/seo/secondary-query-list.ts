import { PRODUCT_CONTENT_LIMITS } from "@/lib/author-products/limits";
import {
  canAddSecondaryQuery,
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
  skippedTooLong: number;
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
  let skippedTooLong = 0;
  let next = [...existing];
  const added: string[] = [];

  for (const rawPart of splitSecondaryQueryText(text)) {
    const normalized = stripObviousSeoListPrefix(rawPart.trim())
      .trim()
      .replace(/\s+/g, " ");
    if (!normalized) {
      skippedEmpty += 1;
      continue;
    }
    if (normalized.length > PRODUCT_CONTENT_LIMITS.seoSecondaryQuery) {
      skippedTooLong += 1;
      continue;
    }

    if (primaryQuery && isSameSeoQuery(normalized, primaryQuery)) {
      skippedPrimary += 1;
      continue;
    }

    if (seenInPaste.some((item) => isSameSeoQuery(item, normalized))) {
      skippedDuplicates += 1;
      continue;
    }
    seenInPaste.push(normalized);

    const result = canAddSecondaryQuery(normalized, next);
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
    added.push(normalized);
  }

  return {
    next,
    added,
    addedCount: added.length,
    skippedEmpty,
    skippedDuplicates,
    skippedPrimary,
    skippedFull,
    skippedTooLong,
  };
}

export function formatSeoSecondaryQueryBulkMessage(
  result: ParseSeoSecondaryQueryListResult,
): string | null {
  const parts: string[] = [];

  if (result.addedCount > 0 && result.skippedFull > 0) {
    parts.push(
      `Добавлено ${formatRussianPhraseCount(result.addedCount)}. Можно добавить до двух дополнительных поисковых фраз.`,
    );
  } else if (result.addedCount === 0 && result.skippedFull > 0) {
    parts.push("Можно добавить до двух дополнительных поисковых фраз.");
  }

  if (result.skippedDuplicates > 0) {
    parts.push("Некоторые фразы уже были добавлены.");
  }

  if (result.skippedTooLong > 0) {
    parts.push("Некоторые фразы слишком длинные и не были добавлены.");
  }

  if (parts.length === 0) {
    return null;
  }

  return parts.join(" ");
}
