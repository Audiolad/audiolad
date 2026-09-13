import type { Metadata } from "next";

import KakSozdatPesnyuSPomoshchyuIiPageView from "@/components/kak-sozdat-pesnyu-s-pomoshchyu-ii/KakSozdatPesnyuSPomoshchyuIiPageView";
import JsonLd from "@/components/seo/JsonLd";
import {
  KAK_SOZDAT_PESNYU_S_POMOSHCHYU_II_DATE_PUBLISHED,
  KAK_SOZDAT_PESNYU_S_POMOSHCHYU_II_FAQ,
  KAK_SOZDAT_PESNYU_S_POMOSHCHYU_II_PAGE_H1,
  KAK_SOZDAT_PESNYU_S_POMOSHCHYU_II_PATH,
  KAK_SOZDAT_PESNYU_S_POMOSHCHYU_II_SEO_DESCRIPTION,
} from "@/lib/seo/kak-sozdat-pesnyu-s-pomoshchyu-ii";
import { buildAiMusicHubPageJsonLd } from "@/lib/seo/json-ld";
import { buildKakSozdatPesnyuSPomoshchyuIiMetadata } from "@/lib/seo/public-page-metadata";

export function generateMetadata(): Metadata {
  return buildKakSozdatPesnyuSPomoshchyuIiMetadata();
}

export default function KakSozdatPesnyuSPomoshchyuIiPage() {
  const jsonLd = buildAiMusicHubPageJsonLd({
    title: KAK_SOZDAT_PESNYU_S_POMOSHCHYU_II_PAGE_H1,
    description: KAK_SOZDAT_PESNYU_S_POMOSHCHYU_II_SEO_DESCRIPTION,
    path: KAK_SOZDAT_PESNYU_S_POMOSHCHYU_II_PATH,
    datePublished: KAK_SOZDAT_PESNYU_S_POMOSHCHYU_II_DATE_PUBLISHED,
    faq: KAK_SOZDAT_PESNYU_S_POMOSHCHYU_II_FAQ,
  });

  return <><JsonLd data={jsonLd} /><KakSozdatPesnyuSPomoshchyuIiPageView /></>;
}
