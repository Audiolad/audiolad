import type { Metadata } from "next";

import KakSozdatMuzykuVSunoPageView from "@/components/kak-sozdat-muzyku-v-suno/KakSozdatMuzykuVSunoPageView";
import JsonLd from "@/components/seo/JsonLd";
import {
  KAK_SOZDAT_MUZYKU_V_SUNO_DATE_PUBLISHED,
  KAK_SOZDAT_MUZYKU_V_SUNO_FAQ,
  KAK_SOZDAT_MUZYKU_V_SUNO_PAGE_H1,
  KAK_SOZDAT_MUZYKU_V_SUNO_PATH,
  KAK_SOZDAT_MUZYKU_V_SUNO_SEO_DESCRIPTION,
} from "@/lib/seo/kak-sozdat-muzyku-v-suno";
import { buildAiMusicHubPageJsonLd } from "@/lib/seo/json-ld";
import { buildKakSozdatMuzykuVSunoMetadata } from "@/lib/seo/public-page-metadata";

export function generateMetadata(): Metadata {
  return buildKakSozdatMuzykuVSunoMetadata();
}

export default function KakSozdatMuzykuVSunoPage() {
  const jsonLd = buildAiMusicHubPageJsonLd({
    title: KAK_SOZDAT_MUZYKU_V_SUNO_PAGE_H1,
    description: KAK_SOZDAT_MUZYKU_V_SUNO_SEO_DESCRIPTION,
    path: KAK_SOZDAT_MUZYKU_V_SUNO_PATH,
    datePublished: KAK_SOZDAT_MUZYKU_V_SUNO_DATE_PUBLISHED,
    faq: KAK_SOZDAT_MUZYKU_V_SUNO_FAQ,
  });

  return <><JsonLd data={jsonLd} /><KakSozdatMuzykuVSunoPageView /></>;
}
