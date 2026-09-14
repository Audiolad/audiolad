import type { Metadata } from "next";

import KakZarabotatNaMuzykeIzSunoPageView from "@/components/kak-zarabotat-na-muzyke-iz-suno/KakZarabotatNaMuzykeIzSunoPageView";
import JsonLd from "@/components/seo/JsonLd";
import {
  KAK_ZARABOTAT_NA_MUZYKE_IZ_SUNO_DATE_PUBLISHED,
  KAK_ZARABOTAT_NA_MUZYKE_IZ_SUNO_FAQ,
  KAK_ZARABOTAT_NA_MUZYKE_IZ_SUNO_PAGE_H1,
  KAK_ZARABOTAT_NA_MUZYKE_IZ_SUNO_PATH,
  KAK_ZARABOTAT_NA_MUZYKE_IZ_SUNO_SEO_DESCRIPTION,
} from "@/lib/seo/kak-zarabotat-na-muzyke-iz-suno";
import { buildAiMusicHubPageJsonLd } from "@/lib/seo/json-ld";
import { buildKakZarabotatNaMuzykeIzSunoMetadata } from "@/lib/seo/public-page-metadata";

export function generateMetadata(): Metadata {
  return buildKakZarabotatNaMuzykeIzSunoMetadata();
}

export default function KakZarabotatNaMuzykeIzSunoPage() {
  const jsonLd = buildAiMusicHubPageJsonLd({
    title: KAK_ZARABOTAT_NA_MUZYKE_IZ_SUNO_PAGE_H1,
    description: KAK_ZARABOTAT_NA_MUZYKE_IZ_SUNO_SEO_DESCRIPTION,
    path: KAK_ZARABOTAT_NA_MUZYKE_IZ_SUNO_PATH,
    datePublished: KAK_ZARABOTAT_NA_MUZYKE_IZ_SUNO_DATE_PUBLISHED,
    faq: KAK_ZARABOTAT_NA_MUZYKE_IZ_SUNO_FAQ,
  });

  return <><JsonLd data={jsonLd} /><KakZarabotatNaMuzykeIzSunoPageView /></>;
}
