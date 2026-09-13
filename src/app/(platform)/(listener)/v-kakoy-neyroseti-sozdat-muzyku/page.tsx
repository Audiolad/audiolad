import type { Metadata } from "next";

import VKakoyNeyrosetiSozdatMuzykuPageView from "@/components/v-kakoy-neyroseti-sozdat-muzyku/VKakoyNeyrosetiSozdatMuzykuPageView";
import JsonLd from "@/components/seo/JsonLd";
import {
  V_KAKOY_NEYROSETI_SOZDAT_MUZYKU_DATE_PUBLISHED,
  V_KAKOY_NEYROSETI_SOZDAT_MUZYKU_FAQ,
  V_KAKOY_NEYROSETI_SOZDAT_MUZYKU_PAGE_H1,
  V_KAKOY_NEYROSETI_SOZDAT_MUZYKU_PATH,
  V_KAKOY_NEYROSETI_SOZDAT_MUZYKU_SEO_DESCRIPTION,
} from "@/lib/seo/v-kakoy-neyroseti-sozdat-muzyku";
import { buildAiMusicHubPageJsonLd } from "@/lib/seo/json-ld";
import { buildVKakoyNeyrosetiSozdatMuzykuMetadata } from "@/lib/seo/public-page-metadata";

export function generateMetadata(): Metadata {
  return buildVKakoyNeyrosetiSozdatMuzykuMetadata();
}

export default function VKakoyNeyrosetiSozdatMuzykuPage() {
  const jsonLd = buildAiMusicHubPageJsonLd({
    title: V_KAKOY_NEYROSETI_SOZDAT_MUZYKU_PAGE_H1,
    description: V_KAKOY_NEYROSETI_SOZDAT_MUZYKU_SEO_DESCRIPTION,
    path: V_KAKOY_NEYROSETI_SOZDAT_MUZYKU_PATH,
    datePublished: V_KAKOY_NEYROSETI_SOZDAT_MUZYKU_DATE_PUBLISHED,
    faq: V_KAKOY_NEYROSETI_SOZDAT_MUZYKU_FAQ,
  });

  return <><JsonLd data={jsonLd} /><VKakoyNeyrosetiSozdatMuzykuPageView /></>;
}
