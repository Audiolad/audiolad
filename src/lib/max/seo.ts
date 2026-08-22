import type { Metadata, MetadataRoute } from "next";

import { MAX_ORIGIN } from "./host";

export const MAX_SEO_TITLE = "АудиоЛад";

export const MAX_SEO_DESCRIPTION =
  "Музыка, медитации, аудиопрактики и аудиокурсы";

/** Mini App shell must not become a second indexable homepage. */
export function buildMaxLandingMetadata(): Metadata {
  return {
    title: MAX_SEO_TITLE,
    description: MAX_SEO_DESCRIPTION,
    alternates: {
      canonical: `${MAX_ORIGIN}/`,
    },
    robots: {
      index: false,
      follow: false,
    },
  };
}

export function buildMaxRobotsRoute(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      disallow: "/",
    },
  };
}
