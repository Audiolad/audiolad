import { KAK_RAZVIT_LYUBOV_K_SEBE_ARTICLE } from "./content/kak-razvit-lyubov-k-sebe";
import type { ArticleDefinition } from "./types";

const ARTICLE_DEFINITIONS = [
  KAK_RAZVIT_LYUBOV_K_SEBE_ARTICLE,
] as const satisfies readonly ArticleDefinition[];

const ARTICLE_BY_SLUG = new Map<string, ArticleDefinition>(
  ARTICLE_DEFINITIONS.map((article) => [article.slug, article]),
);

export function listArticleDefinitions(): readonly ArticleDefinition[] {
  return ARTICLE_DEFINITIONS;
}

export function listArticleSlugs(): string[] {
  return ARTICLE_DEFINITIONS.map((article) => article.slug);
}

export function getArticleBySlug(slug: string): ArticleDefinition | null {
  const normalized = slug.trim().toLowerCase();
  return ARTICLE_BY_SLUG.get(normalized) ?? null;
}
