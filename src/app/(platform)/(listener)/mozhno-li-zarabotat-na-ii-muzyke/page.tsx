import type { Metadata } from "next";

import MozhnoLiZarabotatNaIiMuzykePageView from "@/components/mozhno-li-zarabotat-na-ii-muzyke/MozhnoLiZarabotatNaIiMuzykePageView";
import JsonLd from "@/components/seo/JsonLd";
import {
  MOZHNO_LI_ZARABOTAT_NA_II_MUZYKE_DATE_PUBLISHED,
  MOZHNO_LI_ZARABOTAT_NA_II_MUZYKE_FAQ,
  MOZHNO_LI_ZARABOTAT_NA_II_MUZYKE_PAGE_H1,
  MOZHNO_LI_ZARABOTAT_NA_II_MUZYKE_PATH,
  MOZHNO_LI_ZARABOTAT_NA_II_MUZYKE_SEO_DESCRIPTION,
} from "@/lib/seo/mozhno-li-zarabotat-na-ii-muzyke";
import { buildAiMusicHubPageJsonLd } from "@/lib/seo/json-ld";
import { buildMozhnoLiZarabotatNaIiMuzykeMetadata } from "@/lib/seo/public-page-metadata";

export function generateMetadata(): Metadata {
  return buildMozhnoLiZarabotatNaIiMuzykeMetadata();
}

export default function MozhnoLiZarabotatNaIiMuzykePage() {
  const jsonLd = buildAiMusicHubPageJsonLd({
    title: MOZHNO_LI_ZARABOTAT_NA_II_MUZYKE_PAGE_H1,
    description: MOZHNO_LI_ZARABOTAT_NA_II_MUZYKE_SEO_DESCRIPTION,
    path: MOZHNO_LI_ZARABOTAT_NA_II_MUZYKE_PATH,
    datePublished: MOZHNO_LI_ZARABOTAT_NA_II_MUZYKE_DATE_PUBLISHED,
    faq: MOZHNO_LI_ZARABOTAT_NA_II_MUZYKE_FAQ,
  });

  return <><JsonLd data={jsonLd} /><MozhnoLiZarabotatNaIiMuzykePageView /></>;
}
