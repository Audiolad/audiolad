import type { Metadata } from "next";

import { buildSiteCanonicalUrl } from "@/lib/seo/public-page-metadata";
import { SITE_BRAND } from "@/lib/seo/site-copy";

import {
  ARTICLES_DIRECTORY_META_DESCRIPTION,
  ARTICLES_DIRECTORY_PATH,
  ARTICLES_DIRECTORY_SEO_TITLE,
} from "./directory";

export function buildArticlesDirectoryMetadata(): Metadata {
  const title = ARTICLES_DIRECTORY_SEO_TITLE;
  const description = ARTICLES_DIRECTORY_META_DESCRIPTION;
  const canonical = buildSiteCanonicalUrl(ARTICLES_DIRECTORY_PATH);

  return {
    title,
    description,
    alternates: {
      canonical,
    },
    openGraph: {
      title,
      description,
      url: canonical,
      type: "website",
      siteName: SITE_BRAND,
      locale: "ru_RU",
    },
    twitter: {
      card: "summary",
      title,
      description,
    },
    robots: {
      index: true,
      follow: true,
    },
  };
}
