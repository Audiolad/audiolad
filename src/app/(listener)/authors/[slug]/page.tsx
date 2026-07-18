import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import AuthorAboutSection from "@/components/authors/AuthorAboutSection";
import AuthorFeaturedSection, {
  AuthorProductsSection,
} from "@/components/authors/AuthorPublicSections";
import AuthorPublicHeader from "@/components/authors/AuthorPublicHeader";
import SimilarAuthorsSection from "@/components/authors/SimilarAuthorsSection";
import { loadAuthorPublicPageData } from "@/lib/authors/public-page";
import { getAppOrigin } from "@/lib/seo/app-origin";
import { buildAuthorPublicPath } from "@/lib/products/paths";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ slug: string }>;
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
    data.shortBio ||
    `Аудиопрактики и программы автора ${data.name} на АудиоЛаде.`;
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

export default async function AuthorPublicPage({ params }: PageProps) {
  const { slug } = await params;
  const supabase = await createClient();
  const { data, error } = await loadAuthorPublicPageData(supabase, slug);

  if (error) {
    notFound();
  }

  if (!data) {
    notFound();
  }

  return (
    <>
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
          shortBio={data.shortBio}
          avatarUrl={data.avatarUrl}
          bannerUrl={data.bannerUrl}
          avatarImage={data.avatarImage}
          bannerImage={data.bannerImage}
          publishedCount={data.publishedCount}
        />

        <AuthorFeaturedSection products={data.featuredProducts} />

        <AuthorProductsSection products={data.allProducts} />

        <AuthorAboutSection
          name={data.name}
          avatarUrl={data.avatarUrl}
          fullBio={data.fullBio}
          topics={data.topics}
        />

        <SimilarAuthorsSection authors={data.similarAuthors} />
      </div>
    </>
  );
}
