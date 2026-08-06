import type { Metadata } from "next";
import { notFound } from "next/navigation";

import HelpArticleView from "@/components/help/HelpArticleView";
import { isHelpCategoryId } from "@/lib/help/categories";
import { buildHelpArticleMetadata } from "@/lib/help/metadata";
import {
  getHelpArticleById,
  getHelpArticleBySlug,
} from "@/lib/help/registry";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ category: string; slug: string }>;
  searchParams?: Promise<{ author?: string }>;
};

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { category, slug } = await params;
  if (!isHelpCategoryId(category)) {
    return {};
  }
  const article = getHelpArticleBySlug(category, slug);
  if (!article) {
    return {};
  }
  return buildHelpArticleMetadata(article);
}

export default async function HelpArticlePage({
  params,
  searchParams,
}: PageProps) {
  const { category, slug } = await params;
  const query = (await searchParams) ?? {};

  if (!isHelpCategoryId(category)) {
    notFound();
  }

  const article = getHelpArticleBySlug(category, slug);
  if (!article) {
    notFound();
  }

  const related = article.relatedArticleIds
    .map((id) => getHelpArticleById(id))
    .filter((item): item is NonNullable<typeof item> => item != null)
    .slice(0, 5);

  const authorSlug = query.author?.trim() || null;

  return (
    <HelpArticleView
      article={article}
      related={related}
      authorSlug={authorSlug}
    />
  );
}
