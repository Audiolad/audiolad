import type { Metadata } from "next";

import KakSozdatIiMuzykuPageView from "@/components/kak-sozdat-ii-muzyku/KakSozdatIiMuzykuPageView";
import JsonLd from "@/components/seo/JsonLd";
import {
  KAK_SOZDAT_II_MUZYKU_DATE_PUBLISHED,
  KAK_SOZDAT_II_MUZYKU_FAQ,
  KAK_SOZDAT_II_MUZYKU_PAGE_H1,
  KAK_SOZDAT_II_MUZYKU_PATH,
  KAK_SOZDAT_II_MUZYKU_SEO_DESCRIPTION,
} from "@/lib/seo/kak-sozdat-ii-muzyku";
import { buildAiMusicHubPageJsonLd } from "@/lib/seo/json-ld";
import { buildKakSozdatIiMuzykuMetadata } from "@/lib/seo/public-page-metadata";

export function generateMetadata(): Metadata {
  return buildKakSozdatIiMuzykuMetadata();
}

export default function KakSozdatIiMuzykuPage() {
  const jsonLd = buildAiMusicHubPageJsonLd({
    title: KAK_SOZDAT_II_MUZYKU_PAGE_H1,
    description: KAK_SOZDAT_II_MUZYKU_SEO_DESCRIPTION,
    path: KAK_SOZDAT_II_MUZYKU_PATH,
    datePublished: KAK_SOZDAT_II_MUZYKU_DATE_PUBLISHED,
    faq: KAK_SOZDAT_II_MUZYKU_FAQ,
  });

  return <><JsonLd data={jsonLd} /><KakSozdatIiMuzykuPageView /></>;
}
