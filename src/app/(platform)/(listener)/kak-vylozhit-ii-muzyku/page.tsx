import type { Metadata } from "next";

import KakVylozhitIiMuzykuPageView from "@/components/kak-vylozhit-ii-muzyku/KakVylozhitIiMuzykuPageView";
import JsonLd from "@/components/seo/JsonLd";
import {
  KAK_VYLOZHIT_II_MUZYKU_DATE_PUBLISHED,
  KAK_VYLOZHIT_II_MUZYKU_FAQ,
  KAK_VYLOZHIT_II_MUZYKU_PAGE_H1,
  KAK_VYLOZHIT_II_MUZYKU_PATH,
  KAK_VYLOZHIT_II_MUZYKU_SEO_DESCRIPTION,
} from "@/lib/seo/kak-vylozhit-ii-muzyku";
import { buildAiMusicHubPageJsonLd } from "@/lib/seo/json-ld";
import { buildKakVylozhitIiMuzykuMetadata } from "@/lib/seo/public-page-metadata";

export function generateMetadata(): Metadata {
  return buildKakVylozhitIiMuzykuMetadata();
}

export default function KakVylozhitIiMuzykuPage() {
  const jsonLd = buildAiMusicHubPageJsonLd({
    title: KAK_VYLOZHIT_II_MUZYKU_PAGE_H1,
    description: KAK_VYLOZHIT_II_MUZYKU_SEO_DESCRIPTION,
    path: KAK_VYLOZHIT_II_MUZYKU_PATH,
    datePublished: KAK_VYLOZHIT_II_MUZYKU_DATE_PUBLISHED,
    faq: KAK_VYLOZHIT_II_MUZYKU_FAQ,
  });

  return <><JsonLd data={jsonLd} /><KakVylozhitIiMuzykuPageView /></>;
}
