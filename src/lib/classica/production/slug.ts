const RU_TO_LATIN: Record<string, string> = {
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

export const CLASSICA_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isClassicaSlug(value: string | null | undefined): value is string {
  return typeof value === "string" && CLASSICA_SLUG_PATTERN.test(value);
}

/** Stable public slug. Not a scholarly transliteration; the card can override it. */
export function slugifyClassicaName(value: string): string {
  const mapped = value
    .trim()
    .toLowerCase()
    .split("")
    .map((char) => RU_TO_LATIN[char] ?? char)
    .join("");

  return mapped
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}
