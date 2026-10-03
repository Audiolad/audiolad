import type { Metadata } from "next";

import { classicaIndexPath, classicaPublicAudioPath, classicaWorkPath } from "@/lib/classica/public/paths";
import { getAppOrigin } from "@/lib/seo/app-origin";
import { buildBreadcrumbListJsonLd, type JsonLdNode } from "@/lib/seo/json-ld";
import { secondsToIso8601Duration } from "@/lib/seo/json-ld/duration";
import { sanitizeJsonLdPlainText } from "@/lib/seo/json-ld/sanitize-text";
import { isSafeJsonLdImageUrl } from "@/lib/seo/json-ld/url-policy";
import { SITE_BRAND } from "@/lib/seo/site-copy";

export type ClassicaPublicImage = {
  url: string;
  alt: string | null;
  title: string | null;
};

export type ClassicaPublicWork = {
  id: string;
  composerSlug: string;
  workSlug: string;
  composerName: string;
  title: string;
  heading: string;
  subtitle: string | null;
  shortDescription: string | null;
  body: string;
  aboutWork: string | null;
  aboutComposer: string | null;
  listeningNotes: string | null;
  faq: Array<{ question: string; answer: string }>;
  extraBlocks: Array<{ heading: string; body: string }>;
  seoTitle: string;
  seoDescription: string;
  musicalKey: string | null;
  catalogueNumber: string | null;
  compositionYear: number | null;
  durationSeconds: number | null;
  audioUrl: string | null;
  coverUrl: string | null;
  coverAlt: string | null;
  images: ClassicaPublicImage[];
  publishedAt: string;
};

export function buildClassicaWorkCanonical(work: Pick<ClassicaPublicWork, "composerSlug" | "workSlug">): string {
  return `${getAppOrigin()}${classicaWorkPath(work.composerSlug, work.workSlug)}`;
}

export function buildClassicaWorkMetadata(work: ClassicaPublicWork): Metadata {
  const canonical = buildClassicaWorkCanonical(work);
  const title = work.seoTitle.trim() || `${work.title} — ${work.composerName}`;
  const description = work.seoDescription.trim();

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      title,
      description,
      url: canonical,
      type: "music.song",
      siteName: SITE_BRAND,
      locale: "ru_RU",
      images: work.coverUrl
        ? [{ url: work.coverUrl, alt: work.coverAlt ?? work.title }]
        : undefined,
    },
    twitter: {
      card: work.coverUrl ? "summary_large_image" : "summary",
      title,
      description,
      images: work.coverUrl ? [work.coverUrl] : undefined,
    },
    robots: { index: true, follow: true },
  };
}

export function buildClassicaIndexMetadata(): Metadata {
  const canonical = `${getAppOrigin()}${classicaIndexPath()}`;
  const title = "Classica — АудиоЛад";
  const description =
    "Произведения классической музыки на АудиоЛад: слушать, читать о сочинении и композиторе.";
  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      title,
      description,
      url: canonical,
      siteName: SITE_BRAND,
      locale: "ru_RU",
    },
    robots: { index: true, follow: true },
  };
}

export function buildClassicaWorkJsonLd(work: ClassicaPublicWork): JsonLdNode | null {
  const name = sanitizeJsonLdPlainText(work.heading || work.title);
  const composer = sanitizeJsonLdPlainText(work.composerName);
  if (!name || !composer) {
    return null;
  }

  const description = sanitizeJsonLdPlainText(work.seoDescription || work.shortDescription || "");
  const image = isSafeJsonLdImageUrl(work.coverUrl) ? work.coverUrl : null;
  const duration = secondsToIso8601Duration(work.durationSeconds);
  const node: JsonLdNode = {
    "@context": "https://schema.org",
    "@type": "MusicComposition",
    name,
    composer: { "@type": "Person", name: composer },
    url: buildClassicaWorkCanonical(work),
    description: description || undefined,
    image: image || undefined,
    dateCreated: work.compositionYear ? String(work.compositionYear) : undefined,
    musicalKey: work.musicalKey ? sanitizeJsonLdPlainText(work.musicalKey) : undefined,
    audio: {
      "@type": "AudioObject",
      contentUrl: `${getAppOrigin()}${classicaPublicAudioPath(work.id)}`,
      duration: duration || undefined,
      name,
    },
  };

  return node;
}

export function buildClassicaWorkBreadcrumbs(work: ClassicaPublicWork): JsonLdNode | null {
  return buildBreadcrumbListJsonLd([
    { name: "АудиоЛад", path: "/" },
    { name: "Classica", path: classicaIndexPath() },
    { name: work.composerName, path: classicaIndexPath() },
    {
      name: work.title,
      path: classicaWorkPath(work.composerSlug, work.workSlug),
    },
  ]);
}
