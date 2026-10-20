import * as distribyutorIiMuzyki from "@/lib/seo/distribyutor-ii-muzyki/content";
import * as kakProdatMuzykuSozdannuyuIi from "@/lib/seo/kak-prodat-muzyku-sozdannuyu-ii/content";
import * as kakSozdatFonovuyuMuzykuSPomoshchyuIi from "@/lib/seo/kak-sozdat-fonovuyu-muzyku-s-pomoshchyu-ii/content";
import * as kakSozdatIiMuzyku from "@/lib/seo/kak-sozdat-ii-muzyku/content";
import * as kakSozdatMuzykuPoTekstuSPomoshchyuIi from "@/lib/seo/kak-sozdat-muzyku-po-tekstu-s-pomoshchyu-ii/content";
import * as kakSozdatMuzykuVSuno from "@/lib/seo/kak-sozdat-muzyku-v-suno/content";
import * as kakSozdatPesnyuSPomoshchyuIi from "@/lib/seo/kak-sozdat-pesnyu-s-pomoshchyu-ii/content";
import * as kakVylozhitIiMuzyku from "@/lib/seo/kak-vylozhit-ii-muzyku/content";
import * as kakZarabotatNaMuzykeIzSuno from "@/lib/seo/kak-zarabotat-na-muzyke-iz-suno/content";
import * as kudaVykladyvatMuzykuIzSuno from "@/lib/seo/kuda-vykladyvat-muzyku-iz-suno/content";
import * as mozhnoLiZarabotatNaIiMuzyke from "@/lib/seo/mozhno-li-zarabotat-na-ii-muzyke/content";
import * as vKakoyNeyrosetiSozdatMuzyku from "@/lib/seo/v-kakoy-neyroseti-sozdat-muzyku/content";

import type { ArticleDirectoryCard } from "./directory";

/**
 * Editorial guides that live on their own top-level routes (not under
 * /articles/[slug]) but must still be listed in the /articles directory.
 * Title, description, path and publish date are read from each page's own
 * content module, so the directory never drifts from the published page.
 */
export type StandaloneArticleDefinition = {
  /** Public path of the page – used as-is, never rewritten. */
  path: string;
  /** Visible H1 of the page. */
  title: string;
  /** Meta description of the page. */
  description: string;
  /** Short breadcrumb title – used as an extra search keyword. */
  breadcrumbTitle: string;
  /** ISO date (YYYY-MM-DD) from the page's JSON-LD datePublished. */
  publishedAt: string;
  topicSlug: string;
  topicTitle: string;
  /**
   * Reading time of the live page body (180 words/min, measured on the
   * rendered article). The body copy lives in the page's TSX view, so it
   * cannot be counted from the content module.
   */
  readingTimeMinutes: number;
  indexable?: boolean;
};

export const NEUROMUSIC_TOPIC_SLUG = "neyromuzyka";
export const NEUROMUSIC_TOPIC_TITLE = "Нейромузыка";

type StandaloneContentModule = {
  path: string;
  title: string;
  description: string;
  breadcrumbTitle: string;
  publishedAt: string;
};

function neuromusicGuide(
  content: StandaloneContentModule,
  readingTimeMinutes: number,
): StandaloneArticleDefinition {
  return {
    ...content,
    topicSlug: NEUROMUSIC_TOPIC_SLUG,
    topicTitle: NEUROMUSIC_TOPIC_TITLE,
    readingTimeMinutes,
  };
}

const STANDALONE_ARTICLE_DEFINITIONS: readonly StandaloneArticleDefinition[] = [
  neuromusicGuide(
    {
      path: distribyutorIiMuzyki.DISTRIBYUTOR_II_MUZYKI_PATH,
      title: distribyutorIiMuzyki.DISTRIBYUTOR_II_MUZYKI_PAGE_H1,
      description: distribyutorIiMuzyki.DISTRIBYUTOR_II_MUZYKI_SEO_DESCRIPTION,
      breadcrumbTitle: distribyutorIiMuzyki.DISTRIBYUTOR_II_MUZYKI_BREADCRUMB_TITLE,
      publishedAt: distribyutorIiMuzyki.DISTRIBYUTOR_II_MUZYKI_DATE_PUBLISHED,
    },
    12,
  ),
  neuromusicGuide(
    {
      path: kakSozdatIiMuzyku.KAK_SOZDAT_II_MUZYKU_PATH,
      title: kakSozdatIiMuzyku.KAK_SOZDAT_II_MUZYKU_PAGE_H1,
      description: kakSozdatIiMuzyku.KAK_SOZDAT_II_MUZYKU_SEO_DESCRIPTION,
      breadcrumbTitle: kakSozdatIiMuzyku.KAK_SOZDAT_II_MUZYKU_BREADCRUMB_TITLE,
      publishedAt: kakSozdatIiMuzyku.KAK_SOZDAT_II_MUZYKU_DATE_PUBLISHED,
    },
    9,
  ),
  neuromusicGuide(
    {
      path: kakVylozhitIiMuzyku.KAK_VYLOZHIT_II_MUZYKU_PATH,
      title: kakVylozhitIiMuzyku.KAK_VYLOZHIT_II_MUZYKU_PAGE_H1,
      description: kakVylozhitIiMuzyku.KAK_VYLOZHIT_II_MUZYKU_SEO_DESCRIPTION,
      breadcrumbTitle: kakVylozhitIiMuzyku.KAK_VYLOZHIT_II_MUZYKU_BREADCRUMB_TITLE,
      publishedAt: kakVylozhitIiMuzyku.KAK_VYLOZHIT_II_MUZYKU_DATE_PUBLISHED,
    },
    9,
  ),
  neuromusicGuide(
    {
      path: vKakoyNeyrosetiSozdatMuzyku.V_KAKOY_NEYROSETI_SOZDAT_MUZYKU_PATH,
      title: vKakoyNeyrosetiSozdatMuzyku.V_KAKOY_NEYROSETI_SOZDAT_MUZYKU_PAGE_H1,
      description:
        vKakoyNeyrosetiSozdatMuzyku.V_KAKOY_NEYROSETI_SOZDAT_MUZYKU_SEO_DESCRIPTION,
      breadcrumbTitle:
        vKakoyNeyrosetiSozdatMuzyku.V_KAKOY_NEYROSETI_SOZDAT_MUZYKU_BREADCRUMB_TITLE,
      publishedAt:
        vKakoyNeyrosetiSozdatMuzyku.V_KAKOY_NEYROSETI_SOZDAT_MUZYKU_DATE_PUBLISHED,
    },
    16,
  ),
  neuromusicGuide(
    {
      path: kakSozdatMuzykuVSuno.KAK_SOZDAT_MUZYKU_V_SUNO_PATH,
      title: kakSozdatMuzykuVSuno.KAK_SOZDAT_MUZYKU_V_SUNO_PAGE_H1,
      description: kakSozdatMuzykuVSuno.KAK_SOZDAT_MUZYKU_V_SUNO_SEO_DESCRIPTION,
      breadcrumbTitle: kakSozdatMuzykuVSuno.KAK_SOZDAT_MUZYKU_V_SUNO_BREADCRUMB_TITLE,
      publishedAt: kakSozdatMuzykuVSuno.KAK_SOZDAT_MUZYKU_V_SUNO_DATE_PUBLISHED,
    },
    17,
  ),
  neuromusicGuide(
    {
      path: kakSozdatPesnyuSPomoshchyuIi.KAK_SOZDAT_PESNYU_S_POMOSHCHYU_II_PATH,
      title: kakSozdatPesnyuSPomoshchyuIi.KAK_SOZDAT_PESNYU_S_POMOSHCHYU_II_PAGE_H1,
      description:
        kakSozdatPesnyuSPomoshchyuIi.KAK_SOZDAT_PESNYU_S_POMOSHCHYU_II_SEO_DESCRIPTION,
      breadcrumbTitle:
        kakSozdatPesnyuSPomoshchyuIi.KAK_SOZDAT_PESNYU_S_POMOSHCHYU_II_BREADCRUMB_TITLE,
      publishedAt:
        kakSozdatPesnyuSPomoshchyuIi.KAK_SOZDAT_PESNYU_S_POMOSHCHYU_II_DATE_PUBLISHED,
    },
    13,
  ),
  neuromusicGuide(
    {
      path: kakSozdatMuzykuPoTekstuSPomoshchyuIi.KAK_SOZDAT_MUZYKU_PO_TEKSTU_S_POMOSHCHYU_II_PATH,
      title:
        kakSozdatMuzykuPoTekstuSPomoshchyuIi.KAK_SOZDAT_MUZYKU_PO_TEKSTU_S_POMOSHCHYU_II_PAGE_H1,
      description:
        kakSozdatMuzykuPoTekstuSPomoshchyuIi.KAK_SOZDAT_MUZYKU_PO_TEKSTU_S_POMOSHCHYU_II_SEO_DESCRIPTION,
      breadcrumbTitle:
        kakSozdatMuzykuPoTekstuSPomoshchyuIi.KAK_SOZDAT_MUZYKU_PO_TEKSTU_S_POMOSHCHYU_II_BREADCRUMB_TITLE,
      publishedAt:
        kakSozdatMuzykuPoTekstuSPomoshchyuIi.KAK_SOZDAT_MUZYKU_PO_TEKSTU_S_POMOSHCHYU_II_DATE_PUBLISHED,
    },
    15,
  ),
  neuromusicGuide(
    {
      path: kakSozdatFonovuyuMuzykuSPomoshchyuIi.KAK_SOZDAT_FONOVUYU_MUZYKU_S_POMOSHCHYU_II_PATH,
      title:
        kakSozdatFonovuyuMuzykuSPomoshchyuIi.KAK_SOZDAT_FONOVUYU_MUZYKU_S_POMOSHCHYU_II_PAGE_H1,
      description:
        kakSozdatFonovuyuMuzykuSPomoshchyuIi.KAK_SOZDAT_FONOVUYU_MUZYKU_S_POMOSHCHYU_II_SEO_DESCRIPTION,
      breadcrumbTitle:
        kakSozdatFonovuyuMuzykuSPomoshchyuIi.KAK_SOZDAT_FONOVUYU_MUZYKU_S_POMOSHCHYU_II_BREADCRUMB_TITLE,
      publishedAt:
        kakSozdatFonovuyuMuzykuSPomoshchyuIi.KAK_SOZDAT_FONOVUYU_MUZYKU_S_POMOSHCHYU_II_DATE_PUBLISHED,
    },
    16,
  ),
  neuromusicGuide(
    {
      path: kakProdatMuzykuSozdannuyuIi.KAK_PRODAT_MUZYKU_SOZDANNUYU_II_PATH,
      title: kakProdatMuzykuSozdannuyuIi.KAK_PRODAT_MUZYKU_SOZDANNUYU_II_PAGE_H1,
      description:
        kakProdatMuzykuSozdannuyuIi.KAK_PRODAT_MUZYKU_SOZDANNUYU_II_SEO_DESCRIPTION,
      breadcrumbTitle:
        kakProdatMuzykuSozdannuyuIi.KAK_PRODAT_MUZYKU_SOZDANNUYU_II_BREADCRUMB_TITLE,
      publishedAt:
        kakProdatMuzykuSozdannuyuIi.KAK_PRODAT_MUZYKU_SOZDANNUYU_II_DATE_PUBLISHED,
    },
    14,
  ),
  neuromusicGuide(
    {
      path: mozhnoLiZarabotatNaIiMuzyke.MOZHNO_LI_ZARABOTAT_NA_II_MUZYKE_PATH,
      title: mozhnoLiZarabotatNaIiMuzyke.MOZHNO_LI_ZARABOTAT_NA_II_MUZYKE_PAGE_H1,
      description:
        mozhnoLiZarabotatNaIiMuzyke.MOZHNO_LI_ZARABOTAT_NA_II_MUZYKE_SEO_DESCRIPTION,
      breadcrumbTitle:
        mozhnoLiZarabotatNaIiMuzyke.MOZHNO_LI_ZARABOTAT_NA_II_MUZYKE_BREADCRUMB_TITLE,
      publishedAt:
        mozhnoLiZarabotatNaIiMuzyke.MOZHNO_LI_ZARABOTAT_NA_II_MUZYKE_DATE_PUBLISHED,
    },
    14,
  ),
  neuromusicGuide(
    {
      path: kudaVykladyvatMuzykuIzSuno.KUDA_VYKLADYVAT_MUZYKU_IZ_SUNO_PATH,
      title: kudaVykladyvatMuzykuIzSuno.KUDA_VYKLADYVAT_MUZYKU_IZ_SUNO_PAGE_H1,
      description:
        kudaVykladyvatMuzykuIzSuno.KUDA_VYKLADYVAT_MUZYKU_IZ_SUNO_SEO_DESCRIPTION,
      breadcrumbTitle:
        kudaVykladyvatMuzykuIzSuno.KUDA_VYKLADYVAT_MUZYKU_IZ_SUNO_BREADCRUMB_TITLE,
      publishedAt:
        kudaVykladyvatMuzykuIzSuno.KUDA_VYKLADYVAT_MUZYKU_IZ_SUNO_DATE_PUBLISHED,
    },
    11,
  ),
  neuromusicGuide(
    {
      path: kakZarabotatNaMuzykeIzSuno.KAK_ZARABOTAT_NA_MUZYKE_IZ_SUNO_PATH,
      title: kakZarabotatNaMuzykeIzSuno.KAK_ZARABOTAT_NA_MUZYKE_IZ_SUNO_PAGE_H1,
      description:
        kakZarabotatNaMuzykeIzSuno.KAK_ZARABOTAT_NA_MUZYKE_IZ_SUNO_SEO_DESCRIPTION,
      breadcrumbTitle:
        kakZarabotatNaMuzykeIzSuno.KAK_ZARABOTAT_NA_MUZYKE_IZ_SUNO_BREADCRUMB_TITLE,
      publishedAt:
        kakZarabotatNaMuzykeIzSuno.KAK_ZARABOTAT_NA_MUZYKE_IZ_SUNO_DATE_PUBLISHED,
    },
    8,
  ),
  // /kak-zarabatyvat-na-ii-muzyke-v-audiolad is intentionally not listed:
  // it is a noindex production-test landing excluded from the sitemap.
];

export function listStandaloneArticleDefinitions(): readonly StandaloneArticleDefinition[] {
  return STANDALONE_ARTICLE_DEFINITIONS;
}

const STANDALONE_PATH_PATTERN = /^\/[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isStandaloneArticleDirectoryListed(
  article: StandaloneArticleDefinition,
): boolean {
  if (article.indexable === false) {
    return false;
  }

  const path = article.path?.trim() ?? "";

  if (!STANDALONE_PATH_PATTERN.test(path) || path === "/articles") {
    return false;
  }

  if (!article.title?.trim() || !article.description?.trim()) {
    return false;
  }

  const publishedAt = article.publishedAt?.trim() ?? "";

  return Boolean(publishedAt) && !Number.isNaN(Date.parse(publishedAt));
}

export function toStandaloneArticleDirectoryCard(
  article: StandaloneArticleDefinition,
): ArticleDirectoryCard {
  const path = article.path.trim();
  const title = article.title.trim();
  const keywords = [article.breadcrumbTitle?.trim() ?? ""].filter(
    (value) => value && value !== title,
  );

  return {
    slug: path.slice(1),
    title,
    href: path,
    description: article.description.replace(/\s+/g, " ").trim(),
    topicSlug: article.topicSlug,
    topicTitle: article.topicTitle,
    topicHref: null,
    readingTimeMinutes: Math.max(1, Math.round(article.readingTimeMinutes)),
    publishedAt: article.publishedAt.trim(),
    searchKeywords: keywords,
  };
}

export function listStandaloneArticleDirectoryCards(
  articles: readonly StandaloneArticleDefinition[] = listStandaloneArticleDefinitions(),
): ArticleDirectoryCard[] {
  const seen = new Set<string>();
  const cards: ArticleDirectoryCard[] = [];

  for (const article of articles) {
    if (!isStandaloneArticleDirectoryListed(article)) {
      continue;
    }

    const card = toStandaloneArticleDirectoryCard(article);

    if (seen.has(card.href)) {
      continue;
    }

    seen.add(card.href);
    cards.push(card);
  }

  return cards;
}
