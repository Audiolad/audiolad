import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";

import QuickOfferPublicPage from "@/components/quick-offers/QuickOfferPublicPage";
import { buildQuickOfferCanonicalUrl } from "@/lib/quick-offers/paths";
import { loadPublicQuickOfferCached } from "@/lib/quick-offers/public-page";
import { buildOfferTimerCookieName } from "@/lib/quick-offers/timer";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const normalized = slug.trim();

  if (!normalized) {
    return {
      title: "Оффер – АудиоЛад",
      robots: { index: false, follow: false },
    };
  }

  const supabase = await createClient();
  const loaded = await loadPublicQuickOfferCached(supabase, normalized);

  if (!loaded.ok) {
    return {
      title: "Оффер – АудиоЛад",
      robots: { index: false, follow: false },
    };
  }

  const canonical = buildQuickOfferCanonicalUrl(loaded.offer.slug);
  const description = loaded.offer.short_description.slice(0, 160);

  return {
    title: `${loaded.offer.title} – АудиоЛад`,
    description,
    alternates: { canonical },
    robots: { index: true, follow: true },
    openGraph: {
      title: loaded.offer.title,
      description,
      url: canonical,
      images: loaded.offer.hero_image_url
        ? [{ url: loaded.offer.hero_image_url, alt: loaded.offer.title }]
        : undefined,
    },
  };
}

export default async function QuickOfferPage({ params }: PageProps) {
  const { slug } = await params;
  const supabase = await createClient();
  const loaded = await loadPublicQuickOfferCached(supabase, slug.trim());

  if (!loaded.ok) {
    notFound();
  }

  const cookieStore = await cookies();
  const initialExpiresAt =
    cookieStore.get(buildOfferTimerCookieName(loaded.offer.id))?.value ?? null;

  return (
    <QuickOfferPublicPage
      offer={loaded.offer}
      initialExpiresAt={initialExpiresAt}
    />
  );
}
