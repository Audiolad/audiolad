import type { Metadata } from "next";

import { SITE_BRAND } from "@/lib/seo/site-copy";

import type { ListenPageData } from "./types";

export function buildListenPageMetadata(data: ListenPageData): Metadata {
  const title = data.definition.title;
  const description = data.definition.description;
  const shouldIndex = data.definition.indexable !== false;

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
    },
    twitter: {
      card: "summary",
      title,
      description,
    },
    robots: shouldIndex
      ? {
          index: true,
          follow: true,
        }
      : {
          index: false,
          follow: true,
        },
  };
}
