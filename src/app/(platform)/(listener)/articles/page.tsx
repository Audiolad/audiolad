import type { Metadata } from "next";

import ArticleDirectoryPageView from "@/components/articles/ArticleDirectoryPageView";
import {
  buildArticlesDirectoryMetadata,
  loadArticleDirectoryPageData,
} from "@/lib/seo/articles";

export const dynamic = "force-dynamic";

export function generateMetadata(): Metadata {
  return buildArticlesDirectoryMetadata();
}

export default function ArticlesDirectoryPage() {
  const data = loadArticleDirectoryPageData();

  return <ArticleDirectoryPageView data={data} />;
}
