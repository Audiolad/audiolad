import type { Metadata } from "next";

import BusinessLandingView from "@/components/business/BusinessLandingView";
import JsonLd from "@/components/seo/JsonLd";
import { loadBusinessListenExamples } from "@/lib/business/load-listen-examples";
import {
  buildBusinessLandingJsonLd,
  buildBusinessLandingMetadata,
} from "@/lib/business/metadata";

export const dynamic = "force-dynamic";

export function generateMetadata(): Metadata {
  return buildBusinessLandingMetadata();
}

export default async function BusinessLandingPage() {
  const listenExamples = await loadBusinessListenExamples();

  return (
    <>
      <JsonLd data={buildBusinessLandingJsonLd()} />
      <BusinessLandingView listenExamples={listenExamples} />
    </>
  );
}
