import { PRODUCT_CONTENT_LIMITS } from "@/lib/author-products/limits";
import { wordstatPhraseKey } from "@/lib/seo/wordstat/phrase";

const WRAP_QUOTES = /^[«»"'“”‘’]+|[«»"'“”‘’]+$/g;

export function sanitizePrimaryQuerySuggestions(
  raw: unknown,
  failedSeed: string,
  maxLength: number = PRODUCT_CONTENT_LIMITS.seoPrimaryQuery,
): string[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  const failedKey = wordstatPhraseKey(failedSeed);
  const seen = new Set<string>();
  const result: string[] = [];

  for (const item of raw) {
    if (typeof item !== "string") {
      continue;
    }

    const phrase = item
      .trim()
      .replace(/\s+/g, " ")
      .replace(WRAP_QUOTES, "")
      .trim();

    if (!phrase || phrase.includes("|")) {
      continue;
    }

    if (phrase.length > maxLength) {
      continue;
    }

    if (!/[\p{L}\p{N}]/u.test(phrase)) {
      continue;
    }

    const key = wordstatPhraseKey(phrase);
    if (!key || seen.has(key) || (failedKey && key === failedKey)) {
      continue;
    }

    seen.add(key);
    result.push(phrase);
  }

  return result;
}

export function parsePrimaryQuerySuggestionsJson(
  value: unknown,
): string[] | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const suggestions = (value as { suggestions?: unknown }).suggestions;
  if (!Array.isArray(suggestions)) {
    return null;
  }

  return suggestions.filter((item) => typeof item === "string");
}

function readClippedString(
  record: Record<string, unknown>,
  key: string,
  max: number,
): string {
  const value = record[key];
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().replace(/\s+/g, " ").slice(0, max);
}

export function parsePrimaryQuerySuggestionsRequest(
  body: unknown,
):
  | {
      ok: true;
      input: {
        title: string;
        subtitle: string;
        description: string;
        productKind: string;
        failedSeed: string;
      };
    }
  | { ok: false } {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false };
  }

  const record = body as Record<string, unknown>;
  const input = {
    title: readClippedString(record, "title", 200),
    subtitle: readClippedString(record, "subtitle", PRODUCT_CONTENT_LIMITS.subtitle),
    description: readClippedString(
      record,
      "description",
      PRODUCT_CONTENT_LIMITS.description,
    ),
    productKind: readClippedString(record, "productKind", 40),
    failedSeed: readClippedString(
      record,
      "failedSeed",
      PRODUCT_CONTENT_LIMITS.seoPrimaryQuery,
    ),
  };

  if (!input.title && !input.failedSeed) {
    return { ok: false };
  }

  return { ok: true, input };
}
