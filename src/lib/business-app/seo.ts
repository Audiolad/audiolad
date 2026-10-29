import type { Metadata, MetadataRoute } from "next";

import { BUSINESS_ORIGIN, COFFEE_HOSTNAME, COFFEE_ORIGIN, coffeeHostEnabled } from "./host";

export const BUSINESS_APP_SEO_TITLE = "Аудиолад Бизнес";

export const BUSINESS_APP_SEO_DESCRIPTION =
  "Кабинет владельца кофейни Аудиолад Бизнес";

/** Private B2B app — never index. */
export function buildBusinessAppMetadata(hostname?: string): Metadata {
  return {
    title: BUSINESS_APP_SEO_TITLE,
    description: BUSINESS_APP_SEO_DESCRIPTION,
    alternates: {
      canonical: `${coffeeHostEnabled() && hostname === COFFEE_HOSTNAME ? COFFEE_ORIGIN : BUSINESS_ORIGIN}/`,
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

/**
 * Page-level metadata without `alternates`: the page inherits the host-aware canonical of
 * business-app/layout.tsx (coffee → coffee, otherwise business). A page-level `alternates`
 * would replace it with the business origin on coffee.
 */
export function buildBusinessAppPageMetadata(): Metadata {
  const { alternates: _hostAwareInLayout, ...rest } = buildBusinessAppMetadata();
  void _hostAwareInLayout;
  return rest;
}

export function buildBusinessAppRobotsRoute(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      disallow: "/",
    },
  };
}
