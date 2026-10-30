/**
 * «Следующий шаг» product picker: pure helpers shared by the author API route
 * and the editor UI. The picker only ever stores a relative in-app path
 * (`/practice/<author>/<slug>`) in the existing `promo_url` field, so saved
 * next-step data keeps its shape and no migration is needed.
 */

import {
  getAudioPostDisplayLabel,
  getDisplayFormat,
} from "@/lib/author-products/format";
import {
  MUSIC_KIND_LABEL,
  PRACTICE_KIND_LABEL,
  normalizeProductKind,
  PRODUCT_KIND,
} from "@/lib/author-products/product-kind";
import { AUTHOR_PUBLICATION_CLASS_LABELS } from "@/lib/author-products/publication-class";
import { buildPracticePublicPath } from "@/lib/products/paths";
import {
  PROMO_RECOMMENDATION_BUTTON_TEXT_MAX_LENGTH,
  PROMO_RECOMMENDATION_TITLE_MAX_LENGTH,
} from "@/lib/products/promo-recommendation";

export const NEXT_STEP_PRODUCT_OPTIONS_LIMIT = 50;
export const NEXT_STEP_PRODUCT_QUERY_MAX_LENGTH = 120;
/** Published products a listener can open by link: catalog or link-only. */
export const NEXT_STEP_PRODUCT_VISIBILITIES = ["listed", "unlisted"] as const;
export const NEXT_STEP_DEFAULT_BUTTON_TEXT = "Перейти";

export type NextStepProductOption = {
  id: string;
  title: string;
  typeLabel: string;
  authorName: string;
  coverUrl: string | null;
  href: string;
};

export type NextStepProductRow = {
  id?: unknown;
  title?: unknown;
  slug?: unknown;
  format?: unknown;
  product_kind?: unknown;
  publication_class?: unknown;
  status?: unknown;
  deleted_at?: unknown;
  catalog_visibility?: unknown;
  author_id?: unknown;
  authors?: unknown;
};

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readAuthor(value: unknown): { name: string; slug: string } {
  const author = Array.isArray(value) ? value[0] : value;
  if (!author || typeof author !== "object") {
    return { name: "", slug: "" };
  }
  const record = author as { name?: unknown; slug?: unknown };
  return { name: readString(record.name), slug: readString(record.slug) };
}

export function getNextStepProductTypeLabel(row: {
  format?: unknown;
  product_kind?: unknown;
  publication_class?: unknown;
}): string {
  const format = readString(row.format) || null;
  const kind = normalizeProductKind(readString(row.product_kind) || null);

  if (kind === PRODUCT_KIND.AUDIO_POST) {
    return getAudioPostDisplayLabel(format);
  }
  if (kind === PRODUCT_KIND.MUSIC) {
    return MUSIC_KIND_LABEL;
  }

  const displayFormat = getDisplayFormat(format);
  if (displayFormat) {
    return displayFormat;
  }

  const publicationClass = readString(row.publication_class);
  if (publicationClass === "course" || publicationClass === "audiobook") {
    return AUTHOR_PUBLICATION_CLASS_LABELS[publicationClass];
  }

  return PRACTICE_KIND_LABEL;
}

/** Trim, cap and strip characters that have meaning in ILIKE / PostgREST filters. */
export function normalizeNextStepProductQuery(value: string | null | undefined): string {
  return (value ?? "")
    .replace(/[%_\\,()*"]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, NEXT_STEP_PRODUCT_QUERY_MAX_LENGTH)
    .trim();
}

/**
 * Defense in depth on top of the DB filter: only published, non-deleted,
 * link-reachable products of the caller's own author workspaces, never the
 * product being edited.
 */
export function mapNextStepProductRows(
  rows: readonly NextStepProductRow[],
  options: {
    allowedAuthorIds: readonly string[];
    excludeProductId?: string | null;
    resolveCoverUrl?: (row: NextStepProductRow) => string | null;
  },
): NextStepProductOption[] {
  const allowed = new Set(options.allowedAuthorIds);
  const exclude = options.excludeProductId?.trim() || null;
  const result: NextStepProductOption[] = [];

  for (const row of rows) {
    const id = readString(row.id);
    const title = readString(row.title);
    const slug = readString(row.slug);
    const authorId = readString(row.author_id);
    const author = readAuthor(row.authors);
    const visibility = readString(row.catalog_visibility);

    if (!id || !title || !slug || !author.slug) continue;
    if (exclude && id === exclude) continue;
    if (!allowed.has(authorId)) continue;
    if (readString(row.status) !== "published") continue;
    if (row.deleted_at) continue;
    if (
      !(NEXT_STEP_PRODUCT_VISIBILITIES as readonly string[]).includes(visibility)
    ) {
      continue;
    }

    result.push({
      id,
      title,
      typeLabel: getNextStepProductTypeLabel(row),
      authorName: author.name,
      coverUrl: options.resolveCoverUrl?.(row) ?? null,
      href: buildPracticePublicPath(author.slug, slug),
    });
  }

  return result;
}

export type NextStepPromoFields = {
  promoTitle: string;
  promoButtonText: string;
  promoUrl: string;
};

/**
 * Picking a product always sets the link; title and button text are only
 * filled when the author left them empty.
 */
export function applyNextStepProductSelection<T extends NextStepPromoFields>(
  current: T,
  option: Pick<NextStepProductOption, "title" | "href">,
): T {
  return {
    ...current,
    promoUrl: option.href,
    promoTitle: current.promoTitle.trim()
      ? current.promoTitle
      : option.title.slice(0, PROMO_RECOMMENDATION_TITLE_MAX_LENGTH),
    promoButtonText: current.promoButtonText.trim()
      ? current.promoButtonText
      : NEXT_STEP_DEFAULT_BUTTON_TEXT.slice(0, PROMO_RECOMMENDATION_BUTTON_TEXT_MAX_LENGTH),
  };
}

/** Client-side filter so typing narrows the loaded list instantly. */
export function filterNextStepProductOptions(
  options: readonly NextStepProductOption[],
  query: string,
): NextStepProductOption[] {
  const needle = query.trim().toLocaleLowerCase("ru");
  if (!needle) return [...options];
  return options.filter((option) =>
    `${option.title} ${option.typeLabel} ${option.authorName}`
      .toLocaleLowerCase("ru")
      .includes(needle),
  );
}

export function findSelectedNextStepProduct(
  options: readonly NextStepProductOption[],
  promoUrl: string,
): NextStepProductOption | null {
  const href = promoUrl.trim();
  if (!href) return null;
  return options.find((option) => option.href === href) ?? null;
}
