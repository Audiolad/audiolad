import type { Metadata } from "next";

import { buildSiteCanonicalUrl } from "@/lib/seo/public-page-metadata";
import { SITE_BRAND } from "@/lib/seo/site-copy";

import {
  MEDITATION_SOLUTIONS_HERO_IMAGE,
  MEDITATION_SOLUTIONS_H1,
  MEDITATION_SOLUTIONS_PUBLIC_PATH,
  MEDITATION_SOLUTIONS_SEO_DESCRIPTION,
  MEDITATION_SOLUTIONS_SEO_TITLE,
} from "./content";

export function buildMeditationSolutionsMetadata(): Metadata {
  const canonical = buildSiteCanonicalUrl(MEDITATION_SOLUTIONS_PUBLIC_PATH);

  return {
    title: MEDITATION_SOLUTIONS_SEO_TITLE,
    description: MEDITATION_SOLUTIONS_SEO_DESCRIPTION,
    alternates: {
      canonical,
    },
    robots: {
      index: true,
      follow: true,
    },
    openGraph: {
      title: MEDITATION_SOLUTIONS_SEO_TITLE,
      description: MEDITATION_SOLUTIONS_SEO_DESCRIPTION,
      url: canonical,
      type: "website",
      siteName: SITE_BRAND,
      locale: "ru_RU",
      images: [
        {
          url: MEDITATION_SOLUTIONS_HERO_IMAGE,
          alt: MEDITATION_SOLUTIONS_H1,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: MEDITATION_SOLUTIONS_SEO_TITLE,
      description: MEDITATION_SOLUTIONS_SEO_DESCRIPTION,
    },
  };
}
