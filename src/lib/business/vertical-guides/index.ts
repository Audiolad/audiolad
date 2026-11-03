export {
  assertCoffeeExpertRegistry,
  COFFEE_EXPERTS,
  countExperts,
  expertQuote,
  getCoffeeExpert,
} from "./experts";
export type { CoffeeExpert, ExpertQuote } from "./experts";
export { buildVerticalArticleJsonLd } from "./json-ld";
export {
  buildVerticalArticleMetadata,
  buildVerticalIndexMetadata,
  verticalGuideCanonical,
} from "./metadata";
export {
  articlePath,
  buildVerticalArticlePath,
  collectArticleHrefs,
  collectArticleText,
  getVerticalArticle,
  listVerticalArticles,
} from "./registry";
export { listVerticalGuideSitemapEntries, listVerticalGuideSitemapPaths } from "./sitemap";
export type {
  B2BVertical,
  GuideExpertSlot,
  GuideParagraph,
  GuideSection,
  GuideSteps,
  GuideTable,
  TextPart,
  VerticalGuideArticle,
} from "./types";
export {
  B2B_VERTICALS,
  getVertical,
  listActiveVerticals,
  RESERVED_B_PATHS,
  verticalPathConflicts,
} from "./verticals";
