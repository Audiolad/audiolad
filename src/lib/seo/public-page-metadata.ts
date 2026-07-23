import type { Metadata } from "next";

import { getAppOrigin } from "@/lib/seo/app-origin";

export const SITE_TITLE = "АудиоЛад";
export const SITE_DESCRIPTION =
  "Платформа аудиопрактик, медитаций и энергетических программ";

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
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    alternates: {
      canonical,
    },
    openGraph: {
      title: SITE_TITLE,
      description: SITE_DESCRIPTION,
      url: canonical,
      type: "website",
      siteName: SITE_TITLE,
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
      siteName: SITE_TITLE,
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
      siteName: SITE_TITLE,
    },
  };
}
