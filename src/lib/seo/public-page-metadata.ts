import type { Metadata } from "next";

import { getAppOrigin } from "@/lib/seo/app-origin";
import {
  HOME_SEO_DESCRIPTION,
  HOME_SEO_TITLE,
  SITE_BRAND,
  SITE_TITLE,
} from "@/lib/seo/site-copy";

export {
  HOME_SEO_DESCRIPTION,
  HOME_SEO_TITLE,
  SITE_BRAND,
  SITE_PLATFORM_POSITIONING,
  SITE_TITLE,
} from "@/lib/seo/site-copy";

export function buildSiteCanonicalUrl(path = "/"): string {
  const origin = getAppOrigin().replace(/\/$/, "");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  if (normalizedPath === "/") {
    return `${origin}/`;
  }

  return `${origin}${normalizedPath}`;
}

export function buildHomeMetadata(): Metadata {
  const canonical = buildSiteCanonicalUrl("/");

  return {
    title: HOME_SEO_TITLE,
    description: HOME_SEO_DESCRIPTION,
    alternates: {
      canonical,
    },
    openGraph: {
      title: HOME_SEO_TITLE,
      description: HOME_SEO_DESCRIPTION,
      url: canonical,
      type: "website",
      siteName: SITE_BRAND,
    },
    twitter: {
      card: "summary",
      title: HOME_SEO_TITLE,
      description: HOME_SEO_DESCRIPTION,
    },
  };
}

export function buildCatalogMetadata(options?: {
  robotsNoIndex?: boolean;
}): Metadata {
  const canonical = buildSiteCanonicalUrl("/catalog");

  return {
    title: `Каталог – ${SITE_TITLE}`,
    description:
      "Опубликованные аудиопрактики и программы авторов платформы АудиоЛад.",
    alternates: {
      canonical,
    },
    openGraph: {
      title: `Каталог – ${SITE_TITLE}`,
      description:
        "Опубликованные аудиопрактики и программы авторов платформы АудиоЛад.",
      url: canonical,
      type: "website",
      siteName: SITE_BRAND,
    },
    robots: options?.robotsNoIndex
      ? {
          index: false,
          follow: true,
        }
      : undefined,
  };
}

export function buildAuthorsIndexMetadata(): Metadata {
  const canonical = buildSiteCanonicalUrl("/authors");

  return {
    title: `Авторы – ${SITE_TITLE}`,
    description:
      "Практики от проверенных авторов платформы АудиоЛад: медитации, программы и аудиокурсы.",
    alternates: {
      canonical,
    },
    openGraph: {
      title: `Авторы – ${SITE_TITLE}`,
      description:
        "Практики от проверенных авторов платформы АудиоЛад: медитации, программы и аудиокурсы.",
      url: canonical,
      type: "website",
      siteName: SITE_BRAND,
    },
  };
}
