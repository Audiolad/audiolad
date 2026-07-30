import {
  AUTHOR_PROJECT_NAME_MAX,
  AUTHOR_PROJECT_NAME_MIN,
  AUTHOR_PROJECT_SLUG_MAX,
} from "@/lib/author-projects/constants";

const CYRILLIC =
  "абвгдеёжзийклмнопрстуфхцчшщъыьэюя";
const LATIN =
  "abvgdeejzijklmnoprstufhccss_y_eua";

/** Client-side mirror of public.slugify_author_display_name for preview. */
export function slugifyAuthorProjectName(name: string): string {
  const input = name.trim().toLowerCase();

  let transliterated = "";
  for (const char of input) {
    const index = CYRILLIC.indexOf(char);
    transliterated += index >= 0 ? LATIN[index]! : char;
  }

  let output = transliterated
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");

  if (!output || output.length < 2) {
    output = "author";
  }

  return output.slice(0, AUTHOR_PROJECT_SLUG_MAX);
}

export function validateAuthorProjectName(
  name: string,
): string | null {
  const trimmed = name.trim();
  if (
    trimmed.length < AUTHOR_PROJECT_NAME_MIN ||
    trimmed.length > AUTHOR_PROJECT_NAME_MAX
  ) {
    return `Название проекта: от ${AUTHOR_PROJECT_NAME_MIN} до ${AUTHOR_PROJECT_NAME_MAX} символов.`;
  }
  return null;
}

export function validateAuthorProjectSlug(slug: string): string | null {
  const trimmed = slug.trim().toLowerCase();
  if (!trimmed) {
    return null;
  }

  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(trimmed)) {
    return "Slug может содержать только латинские буквы, цифры и дефисы.";
  }

  if (trimmed.length < 2 || trimmed.length > AUTHOR_PROJECT_SLUG_MAX) {
    return `Slug: от 2 до ${AUTHOR_PROJECT_SLUG_MAX} символов.`;
  }

  return null;
}
