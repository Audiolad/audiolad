import type { Metadata } from "next";
import { notFound } from "next/navigation";

import PracticeEmbedCard from "@/components/embed/PracticeEmbedCard";
import { getAudioPostDisplayLabel } from "@/lib/author-products/format";
import {
  getMusicProductTypeLabel,
  isAudioPostProductKind,
  isMusicProductKind,
  normalizeProductKind,
} from "@/lib/author-products/product-kind";
import { resolvePracticeHeroSubtitle } from "@/lib/catalog/product-hero-gallery";
import { isCoursePublication } from "@/lib/course-content/validators";
import { resolvePracticeEmbedMode, withEmbedUtm } from "@/lib/embed/practice-embed";
import { resolveProductAccess } from "@/lib/products/access";
import { getProductCoverDisplayUrl } from "@/lib/products/cover-display";
import { formatProductDuration, sumDurationSeconds } from "@/lib/products/duration";
import { getPracticeByAuthorAndSlug, type PublicPracticeRow } from "@/lib/products/lookup";
import { buildListenApiBase, buildPracticeCanonicalUrl } from "@/lib/products/paths";
import {
  loadPublicAudioItems,
  shouldLoadPublicAudioItemsOnProductPage,
} from "@/lib/products/public-audio-items";
import { canRevealPublicProductPage } from "@/lib/products/publish-preview";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

type PageProps = {
  params: Promise<{ authorSlug: string; productSlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function authorNameOf(practice: PublicPracticeRow): string | null {
  const raw = practice.authors;
  const author = Array.isArray(raw) ? raw[0] : raw;
  return author?.name?.trim() || null;
}

export default async function PracticeEmbedPage({ params, searchParams }: PageProps) {
  const { authorSlug, productSlug } = await params;
  const query = await searchParams;
  const source = typeof query.src === "string" ? query.src : null;
  const supabase = await createClient();
  const { practice, error } = await getPracticeByAuthorAndSlug(supabase, authorSlug, productSlug);
  if (error || !practice) notFound();

  // Always anonymous: the embed never inherits the viewer's session rights.
  const access = await resolveProductAccess(supabase, practice, null);
  if (
    !canRevealPublicProductPage({
      practiceStatus: practice.status,
      access,
      catalogVisibility: practice.catalog_visibility,
      isCatalogListed: practice.is_catalog_listed,
      scheduledPublishAt: practice.scheduled_publish_at,
      publishedAt: practice.published_at,
    })
  ) {
    notFound();
  }

  const isCourse = isCoursePublication(practice.publication_class, practice.product_kind);
  const audioItems = shouldLoadPublicAudioItemsOnProductPage(
    practice.publication_class,
    practice.product_kind,
  )
    ? await loadPublicAudioItems(supabase, {
        practiceId: practice.id,
        practiceStatus: practice.status,
        authorPreview: false,
        entitledAccess: false,
        publicationClass: practice.publication_class,
        productKind: practice.product_kind,
      })
    : [];
  const firstAudio = audioItems[0] ?? null;
  const mode = resolvePracticeEmbedMode({
    accessReason: access.reason,
    canListen: access.canListen,
    isCourse,
    hasPlayableAudio: Boolean(firstAudio),
  });

  const productKind = normalizeProductKind(practice.product_kind);
  const typeLabel = isAudioPostProductKind(productKind)
    ? getAudioPostDisplayLabel(practice.format)
    : isMusicProductKind(productKind)
      ? getMusicProductTypeLabel()
      : practice.format;
  const duration = formatProductDuration(
    sumDurationSeconds(audioItems),
    practice.duration_minutes,
  );
  const authorName = authorNameOf(practice);

  return (
    <PracticeEmbedCard
      mode={mode}
      title={practice.title}
      typeLabel={typeLabel?.trim() || null}
      subtitle={resolvePracticeHeroSubtitle(practice.subtitle, practice.description)}
      metaLine={[authorName, duration].filter(Boolean).join(" · ") || null}
      coverUrl={getProductCoverDisplayUrl(
        practice.cover_url,
        practice.updated_at,
        practice.cover_image,
        640,
        "lg",
      )}
      coverAlt={`Обложка «${practice.title}»${authorName ? ` – ${authorName}` : ""}`}
      practiceUrl={withEmbedUtm(buildPracticeCanonicalUrl(authorSlug, practice.slug), source)}
      apiBase={buildListenApiBase(authorSlug, practice.slug)}
      practiceId={practice.id}
      audioItemId={mode === "play" ? (firstAudio?.id ?? null) : null}
    />
  );
}
