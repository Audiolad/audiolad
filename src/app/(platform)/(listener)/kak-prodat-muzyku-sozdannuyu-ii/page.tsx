import type { Metadata } from "next";

import KakProdatMuzykuSozdannuyuIiPageView from "@/components/kak-prodat-muzyku-sozdannuyu-ii/KakProdatMuzykuSozdannuyuIiPageView";
import JsonLd from "@/components/seo/JsonLd";
import {
  KAK_PRODAT_MUZYKU_SOZDANNUYU_II_DATE_PUBLISHED,
  KAK_PRODAT_MUZYKU_SOZDANNUYU_II_FAQ,
  KAK_PRODAT_MUZYKU_SOZDANNUYU_II_PAGE_H1,
  KAK_PRODAT_MUZYKU_SOZDANNUYU_II_PATH,
  KAK_PRODAT_MUZYKU_SOZDANNUYU_II_SEO_DESCRIPTION,
} from "@/lib/seo/kak-prodat-muzyku-sozdannuyu-ii";
import { buildAiMusicHubPageJsonLd } from "@/lib/seo/json-ld";
import { buildKakProdatMuzykuSozdannuyuIiMetadata } from "@/lib/seo/public-page-metadata";

export function generateMetadata(): Metadata {
  return buildKakProdatMuzykuSozdannuyuIiMetadata();
}

export default function KakProdatMuzykuSozdannuyuIiPage() {
  const jsonLd = buildAiMusicHubPageJsonLd({
    title: KAK_PRODAT_MUZYKU_SOZDANNUYU_II_PAGE_H1,
    description: KAK_PRODAT_MUZYKU_SOZDANNUYU_II_SEO_DESCRIPTION,
    path: KAK_PRODAT_MUZYKU_SOZDANNUYU_II_PATH,
    datePublished: KAK_PRODAT_MUZYKU_SOZDANNUYU_II_DATE_PUBLISHED,
    faq: KAK_PRODAT_MUZYKU_SOZDANNUYU_II_FAQ,
  });

  return <><JsonLd data={jsonLd} /><KakProdatMuzykuSozdannuyuIiPageView /></>;
}
