import type { JsonLdNode } from "@/lib/seo/json-ld";
import { SCHOOL_ORIGIN } from "@/lib/school/host";
import { SCHOOL_FAQ_ITEMS } from "@/lib/school/faq";
import {
  SCHOOL_MENTORING_END_DAY,
  SCHOOL_MENTORING_YEAR,
  SCHOOL_START_DAY,
  SCHOOL_START_YEAR,
} from "@/lib/school/start";
import { SCHOOL_SEO_DESCRIPTION, SCHOOL_SEO_TITLE } from "@/lib/school/seo";

const SCHOOL_URL = `${SCHOOL_ORIGIN}/`;
const COURSE_ID = `${SCHOOL_URL}#course`;
const COURSE_INSTANCE_ID = `${SCHOOL_URL}#course-instance`;
const PERSON_ID = `${SCHOOL_URL}#sergey-petrov`;
const ORGANIZATION_ID = "https://audiolad.ru/#organization";

/** Exact names, prices and descriptions published in SchoolTariffsScreen. */
const SCHOOL_OFFERS = [
  {
    id: "standard",
    name: "Стандарт",
    price: "1888",
    description:
      "Для тех, кто хочет познакомиться с профессией автора аудиопрактик и получить полное представление о том, как создавать собственные аудиопродукты.",
  },
  {
    id: "premium",
    name: "Премиум",
    price: "18888",
    description:
      "Полная практическая программа Школы Аудиопрактик с месячным сопровождением Сергея Петрова, восемью живыми встречами, персональной обратной связью и помощью в создании, доработке и публикации собственных аудиопродуктов.",
  },
  {
    id: "vip",
    name: "VIP",
    price: "88888",
    description:
      "Индивидуальная программа для тех, кто хочет максимально быстро создать и развить собственное авторское направление.",
  },
] as const;

export function buildSchoolLandingJsonLd(): JsonLdNode {
  const offers = SCHOOL_OFFERS.map((tariff) => ({
    "@type": "Offer",
    "@id": `${SCHOOL_URL}#offer-${tariff.id}`,
    name: `Школа Аудиопрактик — ${tariff.name}`,
    description: tariff.description,
    url: `${SCHOOL_URL}#tariffs`,
    price: tariff.price,
    priceCurrency: "RUB",
    itemOffered: {
      "@id": COURSE_ID,
    },
  }));

  const faq = SCHOOL_FAQ_ITEMS.map((item) => ({
    "@type": "Question",
    name: item.question,
    acceptedAnswer: {
      "@type": "Answer",
      text: item.answer.join(" "),
    },
  }));

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": ORGANIZATION_ID,
        name: "АудиоЛад",
        url: "https://audiolad.ru/",
      },
      {
        "@type": "Person",
        "@id": PERSON_ID,
        name: "Сергей Петров",
        image: `${SCHOOL_ORIGIN}/school/sergey-petrov-school.webp`,
      },
      {
        "@type": "CourseInstance",
        "@id": COURSE_INSTANCE_ID,
        courseMode: "online",
        startDate: `${SCHOOL_START_YEAR}-08-${SCHOOL_START_DAY}`,
        endDate: `${SCHOOL_MENTORING_YEAR}-09-${SCHOOL_MENTORING_END_DAY}`,
        instructor: {
          "@id": PERSON_ID,
        },
      },
      {
        "@type": "Course",
        "@id": COURSE_ID,
        name: "Школа Аудиопрактик",
        description: SCHOOL_SEO_DESCRIPTION,
        url: SCHOOL_URL,
        image: `${SCHOOL_ORIGIN}/school/hero-school-mobile.webp`,
        inLanguage: "ru-RU",
        provider: {
          "@id": ORGANIZATION_ID,
        },
        hasCourseInstance: {
          "@id": COURSE_INSTANCE_ID,
        },
        offers: offers.map((offer) => ({
          "@id": offer["@id"],
        })),
      },
      ...offers,
      {
        "@type": "WebPage",
        "@id": `${SCHOOL_URL}#webpage`,
        url: SCHOOL_URL,
        name: SCHOOL_SEO_TITLE,
        description: SCHOOL_SEO_DESCRIPTION,
        inLanguage: "ru-RU",
        publisher: {
          "@id": ORGANIZATION_ID,
        },
        mainEntity: {
          "@id": COURSE_ID,
        },
      },
      {
        "@type": "FAQPage",
        "@id": `${SCHOOL_URL}#faq`,
        mainEntity: faq,
      },
    ],
  };
}
