import type { Metadata } from "next";

import { buildSiteCanonicalUrl } from "@/lib/seo/public-page-metadata";
import { SITE_BRAND } from "@/lib/seo/site-copy";

import {
  TOPICS_DIRECTORY_META_DESCRIPTION,
  TOPICS_DIRECTORY_PATH,
  TOPICS_DIRECTORY_SEO_TITLE,
} from "./directory";

export function buildTopicsDirectoryMetadata(): Metadata {
  const title = TOPICS_DIRECTORY_SEO_TITLE;
  const description = TOPICS_DIRECTORY_META_DESCRIPTION;
  const canonical = buildSiteCanonicalUrl(TOPICS_DIRECTORY_PATH);

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
