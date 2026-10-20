import type { Metadata } from "next";

import ArticleDirectoryPageView from "@/components/articles/ArticleDirectoryPageView";
import {
  buildArticlesDirectoryMetadata,
  loadArticleDirectoryPageData,
} from "@/lib/seo/articles";
import {
  ARTICLE_SEARCH_PARAM,
  sanitizeArticleSearchQuery,
} from "@/lib/seo/articles/directory-search";

export const dynamic = "force-dynamic";

type ArticlesDirectoryPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({
  searchParams,
}: ArticlesDirectoryPageProps): Promise<Metadata> {
  const params = await searchParams;
  const query = sanitizeArticleSearchQuery(params[ARTICLE_SEARCH_PARAM]);

  return buildArticlesDirectoryMetadata({ hasSearchQuery: query.length > 0 });
}

export default async function ArticlesDirectoryPage({
  searchParams,
}: ArticlesDirectoryPageProps) {
  const data = loadArticleDirectoryPageData();
  const params = await searchParams;
  const initialQuery = sanitizeArticleSearchQuery(params[ARTICLE_SEARCH_PARAM]);

  return <ArticleDirectoryPageView data={data} initialQuery={initialQuery} />;
}
