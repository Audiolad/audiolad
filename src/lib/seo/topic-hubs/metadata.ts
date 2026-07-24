import type { Metadata } from "next";

import { SITE_BRAND, SITE_TITLE } from "@/lib/seo/site-copy";

import type { TopicHubPageData } from "./types";

export function buildTopicHubMetadata(data: TopicHubPageData): Metadata {
  const title = `${data.hub.title} – аудиопрактики | ${SITE_TITLE}`;
  const description = data.hub.metaDescription;
  const shouldIndex =
    data.products.length > 0 || data.hub.indexWhenEmpty === true;
  const ogImage = data.products.find((product) => product.coverUrl)?.coverUrl;

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
      type: "website",
      siteName: SITE_BRAND,
      locale: "ru_RU",
      images: ogImage
        ? [{ url: ogImage, alt: data.hub.title }]
        : undefined,
    },
    twitter: {
      card: ogImage ? "summary_large_image" : "summary",
      title,
      description,
      images: ogImage ? [ogImage] : undefined,
    },
    robots: shouldIndex
      ? undefined
      : {
          index: false,
          follow: true,
        },
  };
}
