const CYRILLIC_MAP: Record<string, string> = {
  а: "a",
  б: "b",
  в: "v",
  г: "g",
  д: "d",
  е: "e",
  ё: "e",
  ж: "zh",
  з: "z",
  и: "i",
  й: "y",
  к: "k",
  л: "l",
  м: "m",
  н: "n",
  о: "o",
  п: "p",
  р: "r",
  с: "s",
  т: "t",
  у: "u",
  ф: "f",
  х: "h",
  ц: "ts",
  ч: "ch",
  ш: "sh",
  щ: "sch",
  ъ: "",
  ы: "y",
  ь: "",
  э: "e",
  ю: "yu",
  я: "ya",
};

function transliterateChar(char: string): string {
  const lower = char.toLowerCase();
  const mapped = CYRILLIC_MAP[lower];

  if (mapped === undefined) {
    return lower;
  }

  return mapped;
}

export function slugifyTitle(title: string): string {
  const transliterated = Array.from(title.trim())
    .map((char) => transliterateChar(char))
    .join("");

  return transliterated
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

export async function ensureUniquePracticeSlug(
  baseSlug: string,
  isTaken: (slug: string) => Promise<boolean>,
  excludePracticeId?: string,
): Promise<string> {
  const normalizedBase = baseSlug || "audio-product";
  let candidate = normalizedBase;
  let suffix = 2;

  while (await isTaken(candidate)) {
    if (excludePracticeId) {
      // isTaken should account for exclude internally
    }

    candidate = `${normalizedBase}-${suffix}`;
    suffix += 1;
  }

  return candidate;
}

export function buildPracticePublicPath(slug: string): string {
  return `/practice/${slug}`;
}

export function buildAudioItemStoragePath(
  practiceId: string,
  audioItemId: string,
): string {
  return `practices/${practiceId}/audio/${audioItemId}.mp3`;
}

export function buildCoverStoragePath(
  practiceId: string,
  extension: "jpg" | "png" | "webp",
): string {
  return `practices/${practiceId}/cover.${extension}`;
}

export function getCoverPublicUrl(storagePath: string): string {
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");

  if (!baseUrl) {
    return storagePath;
  }

  return `${baseUrl}/storage/v1/object/public/practice-covers/${storagePath}`;
}

export function minutesFromSeconds(durationSeconds: number): number {
  return Math.max(1, Math.ceil(durationSeconds / 60));
}
