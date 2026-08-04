import type { Metadata } from "next";

import { SCHOOL_ORIGIN } from "@/lib/school/host";

export const SCHOOL_SEO_TITLE = "Школа Аудиопрактик – АудиоЛад";

export const SCHOOL_SEO_DESCRIPTION =
  "Превратите свои знания, голос и внутреннее состояние в авторские аудиопродукты, чтобы раскрыть своё предназначение, помогать людям и зарабатывать на любимом деле.";

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
      index: false,
      follow: true,
    },
  };
}
