import type { HelpArticle, HelpCategoryId } from "@/lib/help/types";

export function helpArticleHref(
  category: HelpCategoryId,
  slug: string,
): string {
  return `/help/${category}/${slug}`;
}

export function helpArticlePath(article: Pick<HelpArticle, "category" | "slug">): string {
  return helpArticleHref(article.category, article.slug);
}

export function helpHubHref(): string {
  return "/help";
}

export function helpSupportHref(params?: {
  source?: string;
  author?: string;
}): string {
  const search = new URLSearchParams();
  if (params?.source) search.set("source", params.source);
  if (params?.author) search.set("author", params.author);
  const query = search.toString();
  return query ? `/help/support?${query}` : "/help/support";
}

export function helpAuthorsHubHref(): string {
  return "/help/authors";
}

export function helpListenersHubHref(): string {
  return "/help/listeners";
}

/** Preserve author workspace when linking into author-dashboard from help CTAs. */
export function withAuthorQuery(href: string, authorId?: string | null): string {
  if (!authorId) return href;
  if (!href.startsWith("/author-dashboard")) return href;
  const url = new URL(href, "https://audiolad.local");
  if (!url.searchParams.has("author")) {
    url.searchParams.set("author", authorId);
  }
  return `${url.pathname}${url.search}`;
}
