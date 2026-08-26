import type { Metadata } from "next";

import MeditationSolutionsLandingView from "@/components/landings/25-meditation-solutions/MeditationSolutionsLandingView";
import JsonLd from "@/components/seo/JsonLd";
import {
  buildMeditationSolutionsJsonLd,
  buildMeditationSolutionsMetadata,
  loadMeditationSolutionsOffer,
} from "@/lib/landings/25-meditation-solutions";

export const dynamic = "force-dynamic";

export function generateMetadata(): Metadata {
  return buildMeditationSolutionsMetadata();
}

export default async function MeditationSolutionsLandingPage() {
  const offer = await loadMeditationSolutionsOffer();

  return (
    <>
      <JsonLd data={buildMeditationSolutionsJsonLd()} />
      <MeditationSolutionsLandingView offer={offer} />
    </>
  );
}
