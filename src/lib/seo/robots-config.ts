import type { MetadataRoute } from "next";

import { PRODUCTION_APP_ORIGIN } from "@/lib/seo/app-origin";
import { isPublicSeoIndexingEnabled } from "@/lib/seo/indexing";

/** Paths blocked in robots.txt — not a substitute for auth or noindex metadata. */
export const SEO_ROBOTS_DISALLOWED_PATHS = [
  "/admin/",
  "/api/",
  "/auth/",
  "/d/",
  "/listen/",
  "/profile/",
  "/my-practices/",
  "/my-materials/",
  "/favorites/",
  "/history/",
  "/downloads/",
  "/purchases/",
  "/playlists/",
  "/playlist/",
  "/settings/",
  "/author-dashboard/",
  "/personal-materials/",
  "/checkout/",
  "/checkout/result",
] as const;

export function buildRobotsRoute(): MetadataRoute.Robots {
  if (!isPublicSeoIndexingEnabled()) {
    return {
      rules: {
        userAgent: "*",
        disallow: "/",
      },
    };
  }

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [...SEO_ROBOTS_DISALLOWED_PATHS],
    },
    sitemap: `${PRODUCTION_APP_ORIGIN}/sitemap.xml`,
  };
}
