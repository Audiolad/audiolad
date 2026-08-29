import { WORDSTAT_MAX_PHRASE_LENGTH } from "@/lib/seo/wordstat/types";

export function normalizeWordstatPhrase(
  value: string | null | undefined,
): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const phrase = value.trim().replace(/\s+/g, " ");
  if (!phrase || phrase.length > WORDSTAT_MAX_PHRASE_LENGTH) {
    return null;
  }

  return phrase;
}

export function wordstatPhraseKey(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("ru-RU");
}
