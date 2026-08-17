import { ALL_HELP_ARTICLES } from "@/lib/help/articles";
import { isHelpCategoryId } from "@/lib/help/categories";
import {
  findBareRoutesInProse,
  flattenHelpRichText,
  isHelpRichNodes,
} from "@/lib/help/rich-text";
import { buildHelpSearchIndex } from "@/lib/help/search";
import type {
  HelpArticle,
  HelpCategoryId,
  HelpRichText,
  HelpSearchHit,
} from "@/lib/help/types";
import { getHelpStepFigure, getHelpStepText } from "@/lib/help/types";
import type { HelpSearchDocument } from "@/lib/help/search";

function validateRichTextField(
  articleId: string,
  field: string,
  values: readonly HelpRichText[] | undefined,
  errors: string[],
): void {
  if (!values) return;

  values.forEach((value, index) => {
    if (isHelpRichNodes(value)) {
      for (const node of value) {
        if (node.type === "link") {
          if (!node.href?.trim() || !node.label?.trim()) {
            errors.push(`invalid_link:${articleId}:${field}:${index}`);
          } else if (
            !node.external &&
            !node.href.startsWith("/") &&
            !/^https?:\/\//i.test(node.href)
          ) {
            errors.push(`invalid_link_href:${articleId}:${field}:${index}`);
          }
        }
      }
      return;
    }

    for (const bare of findBareRoutesInProse(value)) {
      errors.push(`bare_route_in_prose:${articleId}:${field}:${index}:${bare}`);
    }
  });
}

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

    for (const section of article.sections) {
      validateRichTextField(
        article.id,
        `${section.id}.paragraphs`,
        section.paragraphs,
        errors,
      );
      validateRichTextField(
        article.id,
        `${section.id}.steps`,
        section.steps?.map((step) => getHelpStepText(step)),
        errors,
      );
      validateRichTextField(
        article.id,
        `${section.id}.notes`,
        section.notes,
        errors,
      );
      validateRichTextField(
        article.id,
        `${section.id}.faq`,
        section.faq?.map((item) => item.answer),
        errors,
      );

      const figures = [
        ...(section.figures ?? []),
        ...(section.steps ?? [])
          .map((step) => getHelpStepFigure(step))
          .filter((figure): figure is NonNullable<typeof figure> => figure != null),
      ];
      for (const figure of figures) {
        if (!figure.id?.trim() || !figure.alt?.trim() || !figure.caption?.trim()) {
          errors.push(`invalid_figure:${article.id}:${section.id}:${figure.id ?? "?"}`);
        }
      }

      for (const item of section.faq ?? []) {
        if (!item.question?.trim()) {
          errors.push(`invalid_faq_question:${article.id}:${section.id}`);
        }
      }

      // Ensure search can flatten every rich block.
      for (const value of [
        ...(section.paragraphs ?? []),
        ...(section.steps?.map((step) => getHelpStepText(step)) ?? []),
        ...(section.notes ?? []),
        ...(section.faq?.map((item) => item.answer) ?? []),
      ]) {
        flattenHelpRichText(value);
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
