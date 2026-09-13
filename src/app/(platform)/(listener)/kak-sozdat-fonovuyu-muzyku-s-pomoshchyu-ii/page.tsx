import type { Metadata } from "next";

import KakSozdatFonovuyuMuzykuSPomoshchyuIiPageView from "@/components/kak-sozdat-fonovuyu-muzyku-s-pomoshchyu-ii/KakSozdatFonovuyuMuzykuSPomoshchyuIiPageView";
import JsonLd from "@/components/seo/JsonLd";
import {
  KAK_SOZDAT_FONOVUYU_MUZYKU_S_POMOSHCHYU_II_DATE_PUBLISHED,
  KAK_SOZDAT_FONOVUYU_MUZYKU_S_POMOSHCHYU_II_FAQ,
  KAK_SOZDAT_FONOVUYU_MUZYKU_S_POMOSHCHYU_II_PAGE_H1,
  KAK_SOZDAT_FONOVUYU_MUZYKU_S_POMOSHCHYU_II_PATH,
  KAK_SOZDAT_FONOVUYU_MUZYKU_S_POMOSHCHYU_II_SEO_DESCRIPTION,
} from "@/lib/seo/kak-sozdat-fonovuyu-muzyku-s-pomoshchyu-ii";
import { buildAiMusicHubPageJsonLd } from "@/lib/seo/json-ld";
import { buildKakSozdatFonovuyuMuzykuSPomoshchyuIiMetadata } from "@/lib/seo/public-page-metadata";

export function generateMetadata(): Metadata {
  return buildKakSozdatFonovuyuMuzykuSPomoshchyuIiMetadata();
}

export default function KakSozdatFonovuyuMuzykuSPomoshchyuIiPage() {
  const jsonLd = buildAiMusicHubPageJsonLd({
    title: KAK_SOZDAT_FONOVUYU_MUZYKU_S_POMOSHCHYU_II_PAGE_H1,
    description: KAK_SOZDAT_FONOVUYU_MUZYKU_S_POMOSHCHYU_II_SEO_DESCRIPTION,
    path: KAK_SOZDAT_FONOVUYU_MUZYKU_S_POMOSHCHYU_II_PATH,
    datePublished: KAK_SOZDAT_FONOVUYU_MUZYKU_S_POMOSHCHYU_II_DATE_PUBLISHED,
    faq: KAK_SOZDAT_FONOVUYU_MUZYKU_S_POMOSHCHYU_II_FAQ,
  });

  return <><JsonLd data={jsonLd} /><KakSozdatFonovuyuMuzykuSPomoshchyuIiPageView /></>;
}
