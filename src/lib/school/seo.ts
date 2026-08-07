import type { Metadata, MetadataRoute } from "next";

import { SCHOOL_ORIGIN } from "@/lib/school/host";

export const SCHOOL_SEO_TITLE =
  "Школа Аудиопрактик — обучение созданию авторских медитаций и аудиопродуктов";

export const SCHOOL_SEO_DESCRIPTION =
  "Научитесь создавать авторские медитации, аудиопрактики, аудиокурсы и программы своим голосом. Онлайн-интенсив и практическое сопровождение Сергея Петрова.";

export function buildSchoolLandingMetadata(): Metadata {
  return {
    title: SCHOOL_SEO_TITLE,
    description: SCHOOL_SEO_DESCRIPTION,
    alternates: {
      canonical: `${SCHOOL_ORIGIN}/`,
    },
    openGraph: {
      title: SCHOOL_SEO_TITLE,
      description: SCHOOL_SEO_DESCRIPTION,
      url: `${SCHOOL_ORIGIN}/`,
      siteName: "АудиоЛад",
      locale: "ru_RU",
      type: "website",
      images: [
        {
          url: `${SCHOOL_ORIGIN}/school/hero-school-mobile.webp`,
          width: 946,
          height: 816,
          alt: "Женщина записывает голос на телефон дома — Школа Аудиопрактик",
        },
      ],
    },
    robots: {
      index: true,
      follow: true,
    },
  };
}

export function buildSchoolRobotsRoute(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
    },
    sitemap: `${SCHOOL_ORIGIN}/sitemap.xml`,
  };
}
