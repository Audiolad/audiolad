import type { Metadata } from "next";

import AiMusicHubPageView from "@/components/ai-music-hub/AiMusicHubPageView";
import JsonLd from "@/components/seo/JsonLd";
import {
  AI_MUSIC_HUB_DATE_PUBLISHED,
  AI_MUSIC_HUB_PAGE_H1,
  AI_MUSIC_HUB_PATH,
  AI_MUSIC_HUB_SEO_DESCRIPTION,
} from "@/lib/seo/ai-music-hub";
import { buildAiMusicHubPageJsonLd } from "@/lib/seo/json-ld";
import { buildAiMusicHubMetadata } from "@/lib/seo/public-page-metadata";

export function generateMetadata(): Metadata {
  return buildAiMusicHubMetadata();
}

export default function AiMusicHubPage() {
  const jsonLd = buildAiMusicHubPageJsonLd({
    title: AI_MUSIC_HUB_PAGE_H1,
    description: AI_MUSIC_HUB_SEO_DESCRIPTION,
    path: AI_MUSIC_HUB_PATH,
    datePublished: AI_MUSIC_HUB_DATE_PUBLISHED,
  });

  return (
    <>
      <JsonLd data={jsonLd} />
      <AiMusicHubPageView />
    </>
  );
}
