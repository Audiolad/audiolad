export type {
  HelpArticle,
  HelpArticleCta,
  HelpArticleFigure,
  HelpArticleSection,
  HelpArticleStep,
  HelpArticleStepRecord,
  HelpAudience,
  HelpCategory,
  HelpCategoryId,
  HelpFaqItem,
  HelpInlineLink,
  HelpInlineNode,
  HelpInlineText,
  HelpRichText,
  HelpSearchHit,
  SupportRequestCategory,
  SupportRequestStatus,
} from "@/lib/help/types";

export {
  HELP_AUDIENCES,
  HELP_CATEGORY_IDS,
  SUPPORT_CATEGORY_LABELS,
  SUPPORT_REQUEST_CATEGORIES,
  SUPPORT_REQUEST_STATUSES,
  getHelpStepFigure,
  getHelpStepText,
  isHelpStepRecord,
} from "@/lib/help/types";

export {
  HELP_CATEGORIES,
  getHelpCategory,
  isHelpCategoryId,
  listHelpCategories,
} from "@/lib/help/categories";

export {
  helpArticleHref,
  helpArticlePath,
  helpAuthorsHubHref,
  helpHubHref,
  helpListenersHubHref,
  helpSupportHref,
  withAuthorQuery,
} from "@/lib/help/paths";

export {
  buildHelpSearchDocument,
  buildHelpSearchIndex,
  normalizeHelpSearchText,
  searchHelpArticles,
  tokenizeHelpSearchText,
} from "@/lib/help/search";

export {
  helpArticleDocumentTitle,
  helpArticleHeading,
  helpArticleMetaDescription,
} from "@/lib/help/metadata";

export type { HelpSearchDocument } from "@/lib/help/search";

export { sanitizeSupportSourceUrl } from "@/lib/help/source-url";

export {
  collectHelpRichTexts,
  findBareRoutesInProse,
  flattenHelpRichText,
  helpPublicLink,
  helpRich,
  helpText,
  isHelpRichNodes,
} from "@/lib/help/rich-text";

export { ALL_HELP_ARTICLES } from "@/lib/help/articles";

export {
  getHelpArticleById,
  getHelpArticleBySlug,
  getHelpSearchIndex,
  listHelpArticles,
  listHelpArticlesByCategory,
  listPopularHelpArticles,
  validateHelpRegistry,
} from "@/lib/help/registry";

export type { HelpRegistryValidationResult } from "@/lib/help/registry";
