import type { Metadata } from "next";
import { notFound } from "next/navigation";

import GuideArticleView from "@/components/business/vertical-guides/GuideArticleView";
import JsonLd from "@/components/seo/JsonLd";
import { buildVerticalArticleJsonLd } from "@/lib/business/vertical-guides/json-ld";
import { buildVerticalArticleMetadata } from "@/lib/business/vertical-guides/metadata";
import { getVerticalArticle } from "@/lib/business/vertical-guides/registry";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const article = getVerticalArticle("coffee", slug);
  return article ? buildVerticalArticleMetadata(article) : { title: "АудиоЛад", robots: { index: false, follow: false } };
}

export default async function CoffeeGuideArticlePage({ params }: PageProps) {
  const { slug } = await params;
  const article = getVerticalArticle("coffee", slug);
  if (!article) {
    notFound();
  }
  return (
    <>
      <JsonLd data={buildVerticalArticleJsonLd(article)} />
      <GuideArticleView article={article} />
    </>
  );
}
