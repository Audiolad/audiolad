import type { Metadata } from "next";

import { SITE_BRAND } from "@/lib/seo/site-copy";

import { isPracticeArticlePageData, type ArticlePageData } from "./types";

export function buildArticleMetadata(data: ArticlePageData): Metadata {
  const title = data.article.metaTitle;
  const description = data.article.metaDescription;
  const practiceData = isPracticeArticlePageData(data) ? data : null;
  const ogImage = practiceData?.primaryPractice.coverUrl ?? null;
  const ogImageAlt =
    practiceData?.primaryPractice.title;

  return {
    title,
    description,
    alternates: {
      canonical: data.canonicalUrl,
    },
    openGraph: {
      title,
      description,
      url: data.canonicalUrl,
      type: "article",
      siteName: SITE_BRAND,
      locale: "ru_RU",
      images: ogImage
        ? [{ url: ogImage, alt: ogImageAlt }]
        : undefined,
    },
    twitter: {
      card: ogImage ? "summary_large_image" : "summary",
      title,
      description,
      images: ogImage ? [ogImage] : undefined,
    },
    robots: {
      index: true,
      follow: true,
    },
  };
}
