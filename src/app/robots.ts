import type { MetadataRoute } from "next";

import { PRODUCTION_APP_ORIGIN } from "@/lib/seo/app-origin";
import { isPublicSeoIndexingEnabled } from "@/lib/seo/indexing";

const DISALLOWED_PATHS = [
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
  "/checkout/result",
];

export default function robots(): MetadataRoute.Robots {
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
      disallow: DISALLOWED_PATHS,
    },
    sitemap: `${PRODUCTION_APP_ORIGIN}/sitemap.xml`,
  };
}
