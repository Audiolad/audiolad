import type { Metadata } from "next";

import { buildSiteCanonicalUrl } from "@/lib/seo/public-page-metadata";
import { SITE_BRAND } from "@/lib/seo/site-copy";

import {
  ARTICLES_DIRECTORY_META_DESCRIPTION,
  ARTICLES_DIRECTORY_PATH,
  ARTICLES_DIRECTORY_SEO_TITLE,
} from "./directory";

export type ArticlesDirectoryMetadataOptions = {
  /** True when the request carries a search query (?q=…). */
  hasSearchQuery?: boolean;
};

/**
 * Search result URLs (?q=…) keep the /articles canonical and are marked
 * noindex, follow so filtered variants never compete with the full list.
 */
export function buildArticlesDirectoryMetadata(
  options: ArticlesDirectoryMetadataOptions = {},
): Metadata {
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
      index: !options.hasSearchQuery,
      follow: true,
    },
  };
}
