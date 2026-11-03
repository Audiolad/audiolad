import type { Metadata } from "next";

import { PRODUCTION_APP_ORIGIN } from "@/lib/seo/app-origin";
import { SITE_BRAND } from "@/lib/seo/site-copy";

import { articlePath } from "./registry";
import type { VerticalGuideArticle } from "./types";
import { getVertical } from "./verticals";

export function verticalGuideCanonical(path: string): string {
  return `${PRODUCTION_APP_ORIGIN}${path}`;
}

export function buildVerticalIndexMetadata(verticalId: string): Metadata {
  const vertical = getVertical(verticalId);
  if (!vertical) {
    return { title: SITE_BRAND, robots: { index: false, follow: false } };
  }
  const title = `${vertical.title} – ${vertical.byline ?? `${SITE_BRAND} Бизнес`}`;
  const url = verticalGuideCanonical(vertical.path);
  return {
    title,
    description: vertical.intro,
    alternates: { canonical: url },
    robots: { index: true, follow: true },
    openGraph: {
      title,
      description: vertical.intro,
      url,
      type: "website",
      locale: "ru_RU",
      siteName: SITE_BRAND,
    },
  };
}

export function buildVerticalArticleMetadata(article: VerticalGuideArticle): Metadata {
  const path = articlePath(article);
  const url = verticalGuideCanonical(path);
  return {
    title: article.seoTitle,
    description: article.description,
    alternates: { canonical: url },
    robots: { index: true, follow: true },
    openGraph: {
      title: article.seoTitle,
      description: article.description,
      url,
      type: "article",
      locale: "ru_RU",
      siteName: SITE_BRAND,
      // article:published_time / article:modified_time – dates are never shown on the page.
      publishedTime: article.publishedAt,
      modifiedTime: article.updatedAt,
      images: [
        {
          url: `${PRODUCTION_APP_ORIGIN}${article.ogImage.src}`,
          alt: article.ogImage.alt,
          width: article.ogImage.width,
          height: article.ogImage.height,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: article.seoTitle,
      description: article.description,
      images: [`${PRODUCTION_APP_ORIGIN}${article.ogImage.src}`],
    },
  };
}
