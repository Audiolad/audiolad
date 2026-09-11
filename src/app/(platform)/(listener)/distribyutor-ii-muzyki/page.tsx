import type { Metadata } from "next";

import DistribyutorIiMuzykiPageView from "@/components/distribyutor-ii-muzyki/DistribyutorIiMuzykiPageView";
import JsonLd from "@/components/seo/JsonLd";
import {
  DISTRIBYUTOR_II_MUZYKI_DATE_PUBLISHED,
  DISTRIBYUTOR_II_MUZYKI_FAQ,
  DISTRIBYUTOR_II_MUZYKI_PAGE_H1,
  DISTRIBYUTOR_II_MUZYKI_PATH,
  DISTRIBYUTOR_II_MUZYKI_SEO_DESCRIPTION,
} from "@/lib/seo/distribyutor-ii-muzyki";
import { buildAiMusicHubPageJsonLd } from "@/lib/seo/json-ld";
import { buildDistribyutorIiMuzykiMetadata } from "@/lib/seo/public-page-metadata";

export function generateMetadata(): Metadata {
  return buildDistribyutorIiMuzykiMetadata();
}

export default function DistribyutorIiMuzykiPage() {
  const jsonLd = buildAiMusicHubPageJsonLd({
    title: DISTRIBYUTOR_II_MUZYKI_PAGE_H1,
    description: DISTRIBYUTOR_II_MUZYKI_SEO_DESCRIPTION,
    path: DISTRIBYUTOR_II_MUZYKI_PATH,
    datePublished: DISTRIBYUTOR_II_MUZYKI_DATE_PUBLISHED,
    faq: DISTRIBYUTOR_II_MUZYKI_FAQ,
  });

  return <><JsonLd data={jsonLd} /><DistribyutorIiMuzykiPageView /></>;
}
