import type { Metadata } from "next";

import MeditationAuthorsLandingPageView from "@/components/meditation-authors-landing/MeditationAuthorsLandingPageView";
import JsonLd from "@/components/seo/JsonLd";
import {
  MEDITATION_AUTHORS_LANDING_DATE_PUBLISHED,
  MEDITATION_AUTHORS_LANDING_PAGE_H1,
  MEDITATION_AUTHORS_LANDING_PATH,
  MEDITATION_AUTHORS_LANDING_SEO_DESCRIPTION,
} from "@/lib/seo/meditation-authors-landing";
import { buildMeditationAuthorsLandingPageJsonLd } from "@/lib/seo/json-ld";
import { buildMeditationAuthorsLandingMetadata } from "@/lib/seo/public-page-metadata";

export function generateMetadata(): Metadata {
  return buildMeditationAuthorsLandingMetadata();
}

export default function MeditationAuthorsLandingPage() {
  const jsonLd = buildMeditationAuthorsLandingPageJsonLd({
    title: MEDITATION_AUTHORS_LANDING_PAGE_H1,
    description: MEDITATION_AUTHORS_LANDING_SEO_DESCRIPTION,
    path: MEDITATION_AUTHORS_LANDING_PATH,
    datePublished: MEDITATION_AUTHORS_LANDING_DATE_PUBLISHED,
  });

  return (
    <>
      <JsonLd data={jsonLd} />
      <MeditationAuthorsLandingPageView />
    </>
  );
}
