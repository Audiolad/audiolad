import type { Metadata, MetadataRoute } from "next";

import { BUSINESS_ORIGIN } from "./host";

export const BUSINESS_APP_SEO_TITLE = "Аудиолад Бизнес";

export const BUSINESS_APP_SEO_DESCRIPTION =
  "Кабинет владельца точки Аудиолад Бизнес";

/** Private B2B app — never index. */
export function buildBusinessAppMetadata(): Metadata {
  return {
    title: BUSINESS_APP_SEO_TITLE,
    description: BUSINESS_APP_SEO_DESCRIPTION,
    alternates: {
      canonical: `${BUSINESS_ORIGIN}/`,
    },
    robots: {
      index: false,
      follow: false,
      googleBot: {
        index: false,
        follow: false,
      },
    },
  };
}

export function buildBusinessAppRobotsRoute(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      disallow: "/",
    },
  };
}
