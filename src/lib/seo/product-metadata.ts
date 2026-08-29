import { AUDIO_POST_KIND_LABEL } from "@/lib/author-products/product-kind";

export const PRODUCT_SEO_BRAND = "АудиоЛад";
export const PRODUCT_SEO_TITLE_SEPARATOR = " – ";
export const PRODUCT_SEO_BRAND_SUFFIX = `${PRODUCT_SEO_TITLE_SEPARATOR}${PRODUCT_SEO_BRAND}`;
export const PRODUCT_SEO_META_SNIPPET_LENGTH = 160;
export const PRODUCT_SEO_DESCRIPTION_QUERY_WINDOW = 250;
export const PRODUCT_SEO_SUBSTANTIAL_DESCRIPTION_LENGTH = 160;

const METADATA_DESCRIPTION_FALLBACK = "Аудиопрактика на платформе АудиоЛад.";
const MUSIC_DESCRIPTION_FALLBACK = "Музыкальный продукт на платформе АудиоЛад.";
const AUDIO_POST_DESCRIPTION_FALLBACK = "Аудиопост на платформе АудиоЛад.";

export type ProductSeoFields = {
  title: string;
  subtitle?: string | null;
  description?: string | null;
  productKind?: string | null;
  seoPrimaryQuery?: string | null;
  seoTitle?: string | null;
  seoDescription?: string | null;
};

export type ProductSeoReadinessCheck = {
  id:
    | "primary_query"
    | "query_in_title"
    | "query_in_description"
    | "substantial_description"
    | "usable_search_description";
  label: string;
  done: boolean;
};

export type ProductSeoReadiness = {
  doneCount: number;
  total: 5;
  checks: ProductSeoReadinessCheck[];
};

export type ProductSeoPreview = {
  title: string;
  displayUrl: string;
  description: string;
};

function isAudioPostKind(productKind?: string | null): boolean {
  return productKind === "audio_post";
}

function isMusicKind(productKind?: string | null): boolean {
  return productKind === "music";
}

export function normalizeSeoPhrase(value: string | null | undefined): string {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("ru-RU");
}

export function containsSeoPhrase(
  haystack: string | null | undefined,
  phrase: string | null | undefined,
): boolean {
  const needle = normalizeSeoPhrase(phrase);
  const source = normalizeSeoPhrase(haystack);

  if (!needle || !source) {
    return false;
  }

  return source.includes(needle);
}

export function truncateSeoSnippet(
  text: string,
  maxLength = PRODUCT_SEO_META_SNIPPET_LENGTH,
): string {
  const characters = [...text];

  if (characters.length <= maxLength) {
    return text;
  }

  return `${characters.slice(0, maxLength).join("").trimEnd()}…`;
}

function trimOrEmpty(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

export function hasExplicitProductSeoTitleFields(input: {
  seoPrimaryQuery?: string | null;
  seoTitle?: string | null;
}): boolean {
  return Boolean(trimOrEmpty(input.seoTitle) || trimOrEmpty(input.seoPrimaryQuery));
}

export function resolveLegacyProductSeoTitle(input: {
  title: string;
  productKind?: string | null;
}): string {
  const title = trimOrEmpty(input.title);

  if (isAudioPostKind(input.productKind)) {
    return `${title}${PRODUCT_SEO_TITLE_SEPARATOR}${AUDIO_POST_KIND_LABEL}${PRODUCT_SEO_BRAND_SUFFIX}`;
  }

  return `${title}${PRODUCT_SEO_BRAND_SUFFIX}`;
}

function appendBrandOnce(titleBase: string): string {
  const trimmed = titleBase.trim();

  if (!trimmed) {
    return PRODUCT_SEO_BRAND;
  }

  if (trimmed.endsWith(PRODUCT_SEO_BRAND_SUFFIX) || trimmed.endsWith(PRODUCT_SEO_BRAND)) {
    return trimmed;
  }

  return `${trimmed}${PRODUCT_SEO_BRAND_SUFFIX}`;
}

export function resolveProductSeoTitleBase(input: ProductSeoFields): string {
  const title = trimOrEmpty(input.title);
  const seoTitle = trimOrEmpty(input.seoTitle);
  const primaryQuery = trimOrEmpty(input.seoPrimaryQuery);

  if (seoTitle) {
    return seoTitle;
  }

  if (primaryQuery && !containsSeoPhrase(title, primaryQuery)) {
    return `${title}${PRODUCT_SEO_TITLE_SEPARATOR}${primaryQuery}`;
  }

  return title;
}

export function resolveProductSeoTitle(input: ProductSeoFields): string {
  if (!hasExplicitProductSeoTitleFields(input)) {
    return resolveLegacyProductSeoTitle(input);
  }

  return appendBrandOnce(resolveProductSeoTitleBase(input));
}

export function resolveProductTypeDescriptionFallback(
  productKind?: string | null,
): string {
  if (isMusicKind(productKind)) {
    return MUSIC_DESCRIPTION_FALLBACK;
  }

  if (isAudioPostKind(productKind)) {
    return AUDIO_POST_DESCRIPTION_FALLBACK;
  }

  return METADATA_DESCRIPTION_FALLBACK;
}

export function resolveProductMetaDescription(input: ProductSeoFields): string {
  const seoDescription = trimOrEmpty(input.seoDescription);

  if (seoDescription) {
    return seoDescription;
  }

  const description = trimOrEmpty(input.description);

  if (description) {
    return truncateSeoSnippet(description);
  }

  const subtitle = trimOrEmpty(input.subtitle);

  if (subtitle) {
    return truncateSeoSnippet(subtitle);
  }

  return resolveProductTypeDescriptionFallback(input.productKind);
}

export function buildProductSeoPreview(
  input: ProductSeoFields & { publicPath?: string | null },
): ProductSeoPreview {
  const publicPath = trimOrEmpty(input.publicPath);

  return {
    title: resolveProductSeoTitle(input),
    displayUrl: publicPath
      ? `audiolad.ru${publicPath.startsWith("/") ? publicPath : `/${publicPath}`}`
      : "audiolad.ru/practice/…",
    description: resolveProductMetaDescription(input),
  };
}

export function evaluateProductSeoReadiness(
  input: ProductSeoFields,
): ProductSeoReadiness {
  const primaryQuery = trimOrEmpty(input.seoPrimaryQuery);
  const seoDescription = trimOrEmpty(input.seoDescription);
  const description = trimOrEmpty(input.description);
  const subtitle = trimOrEmpty(input.subtitle);
  const finalTitle = resolveProductSeoTitle(input);
  const descriptionWindow = [...description]
    .slice(0, PRODUCT_SEO_DESCRIPTION_QUERY_WINDOW)
    .join("");

  const checks: ProductSeoReadinessCheck[] = [
    {
      id: "primary_query",
      label: "Основной запрос указан",
      done: primaryQuery.length > 0,
    },
    {
      id: "query_in_title",
      label: "Запрос есть в заголовке для поиска",
      done: Boolean(primaryQuery && containsSeoPhrase(finalTitle, primaryQuery)),
    },
    {
      id: "query_in_description",
      label: "Добавьте основной запрос в начало описания",
      done: Boolean(
        primaryQuery &&
          (containsSeoPhrase(seoDescription, primaryQuery) ||
            containsSeoPhrase(descriptionWindow, primaryQuery)),
      ),
    },
    {
      id: "substantial_description",
      label: "Описание достаточно подробное",
      done: description.length >= PRODUCT_SEO_SUBSTANTIAL_DESCRIPTION_LENGTH,
    },
    {
      id: "usable_search_description",
      label: "Поисковое описание готово",
      done: Boolean(seoDescription || description || subtitle),
    },
  ];

  return {
    doneCount: checks.filter((check) => check.done).length,
    total: 5,
    checks,
  };
}
