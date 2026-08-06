import { notFound } from "next/navigation";
import type { Metadata } from "next";

import ArticlePageView from "@/components/articles/ArticlePageView";
import {
  buildArticleMetadata,
  getArticleBySlug,
  isValidArticleSlug,
  listArticleSlugs,
  loadArticlePageData,
} from "@/lib/seo/articles";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ slug: string }>;
};

export function generateStaticParams() {
  return listArticleSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;

  if (!isValidArticleSlug(slug) || !getArticleBySlug(slug)) {
    return {
      title: "Статья – АудиоЛад",
      robots: { index: false, follow: false },
    };
  }

  const supabase = await createClient();
  const data = await loadArticlePageData(supabase, slug);

  if (!data) {
    return {
      title: "Статья – АудиоЛад",
      robots: { index: false, follow: false },
    };
  }

  return buildArticleMetadata(data);
}

export default async function ArticlePage({ params }: PageProps) {
  const { slug } = await params;

  if (!isValidArticleSlug(slug)) {
    notFound();
  }

  const supabase = await createClient();
  const data = await loadArticlePageData(supabase, slug);

  if (!data) {
    notFound();
  }

  return <ArticlePageView data={data} />;
}
