import type { Metadata } from "next";

import { PRODUCTION_APP_ORIGIN } from "@/lib/seo/app-origin";
import {
  BUSINESS_LANDING_CANONICAL,
  BUSINESS_LANDING_DESCRIPTION,
  BUSINESS_LANDING_TITLE,
  businessAssetPath,
} from "@/lib/business/landing";

export function buildBusinessLandingMetadata(): Metadata {
  const imageUrl = `${PRODUCTION_APP_ORIGIN}${businessAssetPath("01-business-music.webp")}`;

  return {
    title: BUSINESS_LANDING_TITLE,
    description: BUSINESS_LANDING_DESCRIPTION,
    alternates: {
      canonical: BUSINESS_LANDING_CANONICAL,
    },
    robots: {
      index: true,
      follow: true,
    },
    openGraph: {
      title: BUSINESS_LANDING_TITLE,
      description: BUSINESS_LANDING_DESCRIPTION,
      url: BUSINESS_LANDING_CANONICAL,
      type: "website",
      locale: "ru_RU",
      siteName: "Аудиолад",
      images: [
        {
          url: imageUrl,
          width: 1254,
          height: 1254,
          alt: BUSINESS_LANDING_TITLE,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: BUSINESS_LANDING_TITLE,
      description: BUSINESS_LANDING_DESCRIPTION,
    },
  };
}

export function buildBusinessLandingJsonLd(): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: BUSINESS_LANDING_TITLE,
    description: BUSINESS_LANDING_DESCRIPTION,
    url: BUSINESS_LANDING_CANONICAL,
    inLanguage: "ru-RU",
    isPartOf: {
      "@type": "WebSite",
      name: "Аудиолад",
      url: `${PRODUCTION_APP_ORIGIN}/`,
    },
  };
}
