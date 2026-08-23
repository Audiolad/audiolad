import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";

import QuickOfferPublicPage from "@/components/quick-offers/QuickOfferPublicPage";
import {
  buildOfferWindowCookieName,
  offerWindowExpiresAtIso,
  verifySignedOfferWindow,
} from "@/lib/quick-offers/offer-window-token";
import { loadPublicQuickOfferCached } from "@/lib/quick-offers/public-page";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const NOINDEX_ROBOTS = {
  index: false,
  follow: false,
  nocache: true,
  googleBot: { index: false, follow: false, noimageindex: true },
} as const;

type PageProps = {
  params: Promise<{ slug: string }>;
};

function readVerifiedWindowExpiresAt(offerId: string, raw: string | undefined) {
  if (!raw) {
    return null;
  }

  const verified = verifySignedOfferWindow(raw, offerId);

  if (!verified.ok) {
    return null;
  }

  return offerWindowExpiresAtIso(verified.payload);
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const normalized = slug.trim();

  if (!normalized) {
    return {
      title: "Оффер – АудиоЛад",
      robots: NOINDEX_ROBOTS,
    };
  }

  const supabase = await createClient();
  const loaded = await loadPublicQuickOfferCached(supabase, normalized);

  if (!loaded.ok) {
    return {
      title: "Оффер – АудиоЛад",
      robots: NOINDEX_ROBOTS,
    };
  }

  const description = loaded.offer.short_description.slice(0, 160);

  return {
    title: `${loaded.offer.title} – АудиоЛад`,
    description,
    robots: NOINDEX_ROBOTS,
    openGraph: {
      title: loaded.offer.title,
      description,
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
  const initialExpiresAt = readVerifiedWindowExpiresAt(
    loaded.offer.id,
    cookieStore.get(buildOfferWindowCookieName(loaded.offer.id))?.value,
  );

  return (
    <QuickOfferPublicPage
      offer={loaded.offer}
      initialExpiresAt={initialExpiresAt}
    />
  );
}
