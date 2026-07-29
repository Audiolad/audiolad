import { ALL_HELP_ARTICLES } from "@/lib/help/articles";
import { isHelpCategoryId } from "@/lib/help/categories";
import { buildHelpSearchIndex } from "@/lib/help/search";
import type {
  HelpArticle,
  HelpCategoryId,
  HelpSearchHit,
} from "@/lib/help/types";
import type { HelpSearchDocument } from "@/lib/help/search";

const BY_ID = new Map<string, HelpArticle>();
const BY_CATEGORY_SLUG = new Map<string, HelpArticle>();

for (const article of ALL_HELP_ARTICLES) {
  BY_ID.set(article.id, article);
  BY_CATEGORY_SLUG.set(`${article.category}/${article.slug}`, article);
}

/** Curated entry points shown on help hubs. */
const POPULAR_ARTICLE_IDS: readonly string[] = [
  "help.listeners.sign-up-and-sign-in",
  "help.listeners.save-to-library",
  "help.authors.create-first-product",
  "help.authors.publish-product",
  "help.personal-work.create-personal-material",
  "help.finance.commercial-status",
  "help.troubleshooting.email-not-received",
] as const;

let cachedSearchIndex: HelpSearchDocument[] | null = null;

export function listHelpArticles(): HelpArticle[] {
  return [...ALL_HELP_ARTICLES].sort((a, b) => {
    if (a.category !== b.category) {
      return a.category.localeCompare(b.category, "ru");
    }
    return a.order - b.order;
  });
}

export function getHelpArticleById(id: string): HelpArticle | undefined {
  return BY_ID.get(id);
}

export function getHelpArticleBySlug(
  category: HelpCategoryId,
  slug: string,
): HelpArticle | undefined {
  return BY_CATEGORY_SLUG.get(`${category}/${slug}`);
}

export function listHelpArticlesByCategory(
  categoryId: HelpCategoryId,
): HelpArticle[] {
  return ALL_HELP_ARTICLES.filter((article) => article.category === categoryId).sort(
    (a, b) => a.order - b.order,
  );
}

export function listPopularHelpArticles(): HelpArticle[] {
  return POPULAR_ARTICLE_IDS.map((id) => BY_ID.get(id)).filter(
    (article): article is HelpArticle => article != null,
  );
}

export function getHelpSearchIndex(): HelpSearchDocument[] {
  if (!cachedSearchIndex) {
    cachedSearchIndex = buildHelpSearchIndex(ALL_HELP_ARTICLES);
  }
  return cachedSearchIndex;
}

export type HelpRegistryValidationResult = {
  ok: boolean;
  errors: string[];
};

export function validateHelpRegistry(): HelpRegistryValidationResult {
  const errors: string[] = [];
  const seenIds = new Set<string>();
  const seenSlugs = new Set<string>();

  for (const article of ALL_HELP_ARTICLES) {
    if (seenIds.has(article.id)) {
      errors.push(`duplicate_id:${article.id}`);
    }
    seenIds.add(article.id);

    const slugKey = `${article.category}/${article.slug}`;
    if (seenSlugs.has(slugKey)) {
      errors.push(`duplicate_slug:${slugKey}`);
    }
    seenSlugs.add(slugKey);

    if (!isHelpCategoryId(article.category)) {
      errors.push(`invalid_category:${article.id}:${article.category}`);
    }

    for (const relatedId of article.relatedArticleIds) {
      if (!BY_ID.has(relatedId)) {
        errors.push(`missing_related_article:${article.id}:${relatedId}`);
      }
    }
  }

  return { ok: errors.length === 0, errors };
}

if (typeof process !== "undefined" && process.env.NODE_ENV !== "production") {
  const validation = validateHelpRegistry();
  if (!validation.ok) {
    throw new Error(
      `help_registry_invalid:${validation.errors.join(",")}`,
    );
  }
}

export type { HelpSearchDocument, HelpSearchHit };
