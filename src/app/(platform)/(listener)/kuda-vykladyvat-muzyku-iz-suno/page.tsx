import type { Metadata } from "next";

import KudaVykladyvatMuzykuIzSunoPageView from "@/components/kuda-vykladyvat-muzyku-iz-suno/KudaVykladyvatMuzykuIzSunoPageView";
import JsonLd from "@/components/seo/JsonLd";
import {
  KUDA_VYKLADYVAT_MUZYKU_IZ_SUNO_DATE_PUBLISHED,
  KUDA_VYKLADYVAT_MUZYKU_IZ_SUNO_FAQ,
  KUDA_VYKLADYVAT_MUZYKU_IZ_SUNO_PAGE_H1,
  KUDA_VYKLADYVAT_MUZYKU_IZ_SUNO_PATH,
  KUDA_VYKLADYVAT_MUZYKU_IZ_SUNO_SEO_DESCRIPTION,
} from "@/lib/seo/kuda-vykladyvat-muzyku-iz-suno";
import { buildAiMusicHubPageJsonLd } from "@/lib/seo/json-ld";
import { buildKudaVykladyvatMuzykuIzSunoMetadata } from "@/lib/seo/public-page-metadata";

export function generateMetadata(): Metadata {
  return buildKudaVykladyvatMuzykuIzSunoMetadata();
}

export default function KudaVykladyvatMuzykuIzSunoPage() {
  const jsonLd = buildAiMusicHubPageJsonLd({
    title: KUDA_VYKLADYVAT_MUZYKU_IZ_SUNO_PAGE_H1,
    description: KUDA_VYKLADYVAT_MUZYKU_IZ_SUNO_SEO_DESCRIPTION,
    path: KUDA_VYKLADYVAT_MUZYKU_IZ_SUNO_PATH,
    datePublished: KUDA_VYKLADYVAT_MUZYKU_IZ_SUNO_DATE_PUBLISHED,
    faq: KUDA_VYKLADYVAT_MUZYKU_IZ_SUNO_FAQ,
  });

  return <><JsonLd data={jsonLd} /><KudaVykladyvatMuzykuIzSunoPageView /></>;
}
