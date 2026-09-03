import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import AuthorPageViewTracker from "@/components/analytics/AuthorPageViewTracker";
import AuthorAboutSection from "@/components/authors/AuthorAboutSection";
import AuthorContactsSection from "@/components/authors/AuthorContactsSection";
import AuthorFeaturedSection, {
  AuthorProductsSection,
} from "@/components/authors/AuthorPublicSections";
import AuthorPublicHeader from "@/components/authors/AuthorPublicHeader";
import AuthorAppreciationPrototype from "@/components/author-appreciation/AuthorAppreciationPrototype";
import SimilarAuthorsSection from "@/components/authors/SimilarAuthorsSection";
import { collectAuthorContactSameAs } from "@/lib/authors/contacts";
import {
  isAuthorAppreciationPreviewActive,
  resolveAuthorAppreciationVisibility,
} from "@/lib/author-appreciation/effective-visibility";
import {
  getAuthorAppreciationRolloutConfig,
  isAuthorAppreciationRolloutEnabled,
} from "@/lib/author-appreciation/config";
import JsonLd from "@/components/seo/JsonLd";
import { loadAuthorPublicPageData } from "@/lib/authors/public-page";
import {
  DEFAULT_AUTHOR_SHORT_POSITIONING,
} from "@/lib/authors/brand-assets";
import { getAppOrigin } from "@/lib/seo/app-origin";
import { buildAuthorJsonLd, shouldEmitAuthorJsonLd } from "@/lib/seo/json-ld";
import { buildAuthorPublicPath } from "@/lib/products/paths";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ author_appreciation_preview?: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const supabase = await createClient();
  const { data, error } = await loadAuthorPublicPageData(supabase, slug);

  if (error || !data) {
    return {
      title: "Автор – АудиоЛад",
      robots: { index: false, follow: false },
    };
  }

  const description =
    data.shortPositioning !== DEFAULT_AUTHOR_SHORT_POSITIONING
      ? data.shortPositioning
      : `Аудиопрактики и программы автора ${data.name} на АудиоЛаде.`;
  const canonicalUrl = `${getAppOrigin()}${buildAuthorPublicPath(data.slug)}`;
  const ogImage = data.bannerUrl || data.avatarUrl || undefined;

  return {
    title: `${data.name} – АудиоЛад`,
    description,
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      title: `${data.name} – АудиоЛад`,
      description,
      url: canonicalUrl,
      type: "profile",
      images: ogImage ? [{ url: ogImage, alt: data.name }] : undefined,
    },
  };
}

export default async function AuthorPublicPage({
  params,
  searchParams,
}: PageProps) {
  const { slug } = await params;
  const { author_appreciation_preview: authorAppreciationPreview } =
    await searchParams;
  const supabase = await createClient();
  const { data, error } = await loadAuthorPublicPageData(supabase, slug);

  if (error) {
    notFound();
  }

  if (!data) {
    notFound();
  }

  const authorDescription =
    data.shortPositioning !== DEFAULT_AUTHOR_SHORT_POSITIONING
      ? data.shortPositioning
      : data.fullBio;
  const structuredData = shouldEmitAuthorJsonLd({ isFixtureMarked: false })
    ? buildAuthorJsonLd({
        name: data.name,
        slug: data.slug,
        authorType: data.authorType,
        description: authorDescription,
        imageUrl: data.bannerUrl || data.avatarUrl,
        topics: data.topics,
        sameAs: collectAuthorContactSameAs(data.contacts),
      })
    : null;

  const authorPath = buildAuthorPublicPath(data.slug);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // Stage 1 design prototype only. Phase 2 will replace this explicit preview
  // flag with commercial eligibility and persisted author/product preferences.
  const rollout = getAuthorAppreciationRolloutConfig();
  const showAuthorAppreciationPrototype =
    isAuthorAppreciationRolloutEnabled(rollout, data.id) &&
    resolveAuthorAppreciationVisibility({
      surface: "author",
      previewActive: isAuthorAppreciationPreviewActive(authorAppreciationPreview),
      accessStatus: data.accessStatus,
      settings: data.appreciationSettings,
    });

  return (
    <>
      <AuthorPageViewTracker authorId={data.id} path={authorPath} />
      <JsonLd data={structuredData} />
      <div className="hidden px-5 pt-2 xl:block xl:px-6">
        <Link
          href="/authors"
          className="inline-flex items-center text-sm font-medium text-[#7042c5] underline-offset-2 hover:underline focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
        >
          ← Все авторы
        </Link>
      </div>

      <div className="listener-author-content px-5 pb-8 pt-4 lg:px-10 xl:px-6 xl:pb-10 xl:pt-4">
        <Link
          href="/authors"
          className="inline-flex items-center text-sm font-medium text-[#7042c5] underline-offset-2 hover:underline focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5] xl:hidden"
        >
          ← Все авторы
        </Link>

        <AuthorPublicHeader
          name={data.name}
          shortPositioning={
            data.shortPositioning === DEFAULT_AUTHOR_SHORT_POSITIONING
              ? null
              : data.shortPositioning
          }
          avatarUrl={data.avatarUrl}
          bannerUrl={data.bannerUrl}
          avatarImage={data.avatarImage}
          bannerImage={data.bannerImage}
          bannerPositionX={data.bannerPositionX}
          bannerPositionY={data.bannerPositionY}
          publishedCount={data.publishedCount}
        />

        {showAuthorAppreciationPrototype ? (
          <div className="mt-4">
            <AuthorAppreciationPrototype
              authorName={data.name}
              authorId={data.id}
              practiceId={null}
              isAuthenticated={Boolean(user)}
              surface="author"
            />
          </div>
        ) : null}

        <AuthorFeaturedSection products={data.featuredProducts} />

        <AuthorProductsSection products={data.allProducts} />

        <AuthorAboutSection
          name={data.name}
          avatarUrl={data.avatarUrl}
          fullBio={data.fullBio}
          topics={data.topics}
        />

        <AuthorContactsSection contacts={data.contacts} />

        <SimilarAuthorsSection authors={data.similarAuthors} />
      </div>
    </>
  );
}
