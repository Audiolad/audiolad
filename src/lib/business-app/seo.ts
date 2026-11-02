import type { Metadata, MetadataRoute } from "next";

import { BUSINESS_PUBLIC_PATH_REWRITES, BUSINESS_ORIGIN, COFFEE_HOSTNAME, COFFEE_ORIGIN, coffeeHostEnabled } from "./host";

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

/** Coffee exposes only these public information pages to crawlers. */
export function coffeePublicPaths(): string[] {
  return ["/", "/help", ...Object.keys(BUSINESS_PUBLIC_PATH_REWRITES).filter(
    (path) => path === "/documents" || path.startsWith("/documents/"),
  )];
}

export function buildCoffeeSitemap(): MetadataRoute.Sitemap {
  return coffeePublicPaths().map((path) => ({ url: `${COFFEE_ORIGIN}${path}` }));
}

export function buildCoffeeRobotsRoute(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/$", "/help$", "/documents$", "/documents/"],
      disallow: "/",
    },
    sitemap: `${COFFEE_ORIGIN}/sitemap.xml`,
    host: COFFEE_ORIGIN,
  };
}

/** Page-level opt-in: private pages inherit the noindex layout. */
export function buildCoffeePublicPageMetadata(hostname: string, path: string, title: string, description: string): Metadata {
  if (!coffeeHostEnabled() || hostname !== COFFEE_HOSTNAME || !coffeePublicPaths().includes(path)) return {};
  const url = `${COFFEE_ORIGIN}${path}`;
  return {
    title,
    description,
    alternates: { canonical: url },
    robots: { index: true, follow: true, googleBot: { index: true, follow: true } },
    openGraph: { type: "website", url, siteName: "АудиоЛад Кофе", locale: "ru_RU", title, description },
  };
}
