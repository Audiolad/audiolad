import type { Metadata } from "next";

import { getAppOrigin } from "@/lib/seo/app-origin";
import {
  PHILOSOPHY_SEO_DESCRIPTION,
  PHILOSOPHY_SEO_TITLE,
} from "@/lib/seo/philosophy/content";
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

export {
  PHILOSOPHY_PAGE_H1,
  PHILOSOPHY_SEO_DESCRIPTION,
  PHILOSOPHY_SEO_TITLE,
} from "@/lib/seo/philosophy/content";

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

export const ABOUT_SEO_TITLE =
  "АудиоЛад – платформа авторских аудиопрактик, медитаций и программ";

export const ABOUT_SEO_DESCRIPTION =
  "АудиоЛад – платформа авторских аудиопрактик, медитаций и программ. Бесплатные и платные материалы, страницы авторов, личная аудиотека и удобное прослушивание онлайн.";

export const ABOUT_PAGE_H1 = "О платформе АудиоЛад";

export function buildAboutMetadata(): Metadata {
  const canonical = buildSiteCanonicalUrl("/about");

  return {
    title: ABOUT_SEO_TITLE,
    description: ABOUT_SEO_DESCRIPTION,
    alternates: {
      canonical,
    },
    openGraph: {
      title: ABOUT_SEO_TITLE,
      description: ABOUT_SEO_DESCRIPTION,
      url: canonical,
      type: "website",
      siteName: SITE_BRAND,
      locale: "ru_RU",
    },
    twitter: {
      card: "summary",
      title: ABOUT_SEO_TITLE,
      description: ABOUT_SEO_DESCRIPTION,
    },
  };
}

export function buildPhilosophyMetadata(): Metadata {
  const canonical = buildSiteCanonicalUrl("/philosophy");

  return {
    title: PHILOSOPHY_SEO_TITLE,
    description: PHILOSOPHY_SEO_DESCRIPTION,
    alternates: {
      canonical,
    },
    openGraph: {
      title: PHILOSOPHY_SEO_TITLE,
      description: PHILOSOPHY_SEO_DESCRIPTION,
      url: canonical,
      type: "website",
      siteName: SITE_BRAND,
      locale: "ru_RU",
    },
    twitter: {
      card: "summary",
      title: PHILOSOPHY_SEO_TITLE,
      description: PHILOSOPHY_SEO_DESCRIPTION,
    },
  };
}
