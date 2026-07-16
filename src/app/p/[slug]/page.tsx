import type { Metadata } from "next";
import { notFound } from "next/navigation";

import BottomNav from "@/components/BottomNav";
import PublicPlaylistPageView from "@/components/playlists/PublicPlaylistPageView";
import { platformMobileShellClass } from "@/lib/navigation/bottom-nav";
import { loadPublicPlaylistBySlug } from "@/lib/playlists/public-detail";
import {
  isValidPlaylistPublicSlug,
  normalizePlaylistPublicSlug,
} from "@/lib/playlists/public-slug";
import { buildPublicPlaylistCanonicalUrl } from "@/lib/playlists/public-url";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug: rawSlug } = await params;

  if (!isValidPlaylistPublicSlug(rawSlug)) {
    return {
      title: "Плейлист – АудиоЛад",
      robots: { index: false, follow: false },
    };
  }

  const slug = normalizePlaylistPublicSlug(rawSlug);
  const loaded = await loadPublicPlaylistBySlug(slug);

  if (!loaded.ok) {
    return {
      title: "Плейлист – АудиоЛад",
      robots: { index: false, follow: false },
    };
  }

  const title = loaded.detail.playlist.title;
  const count = loaded.detail.itemsCount;
  const countLabel =
    count === 0
      ? "Бесплатная подборка аудиопрактик на АудиоЛаде."
      : count === 1
        ? "Бесплатная подборка из 1 аудиопрактики на АудиоЛаде."
        : `Бесплатная подборка из ${count} аудиопрактик на АудиоЛаде.`;

  return {
    title: `${title} — АудиоЛад`,
    description: countLabel,
    alternates: {
      canonical: buildPublicPlaylistCanonicalUrl(slug),
    },
    robots: { index: true, follow: true },
    openGraph: {
      title: `${title} — АудиоЛад`,
      description: countLabel,
      url: buildPublicPlaylistCanonicalUrl(slug),
      type: "website",
      // Signed cover URLs are short-lived; do not use as stable OG image.
      siteName: "АудиоЛад",
    },
  };
}

export default async function PublicPlaylistPage({ params }: PageProps) {
  const { slug: rawSlug } = await params;

  if (!isValidPlaylistPublicSlug(rawSlug)) {
    notFound();
  }

  const slug = normalizePlaylistPublicSlug(rawSlug);
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const loaded = await loadPublicPlaylistBySlug(slug);

  if (!loaded.ok && loaded.reason === "not_found") {
    notFound();
  }

  if (!loaded.ok) {
    return (
      <main className="min-h-screen bg-platform-surface text-[#25135c]">
        <div
          className={`mx-auto min-h-screen w-full max-w-[430px] bg-platform-surface ${platformMobileShellClass}`}
        >
          <div className="px-5 pt-6 pb-4">
            <h1 className="mt-2 text-[28px] font-semibold">Плейлист</h1>
            <p className="mt-3 text-sm leading-6 text-[#7d70a2]">
              Не удалось загрузить подборку. Попробуйте ещё раз.
            </p>
          </div>
          <BottomNav />
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-platform-surface text-[#25135c]">
      <div
        className={`mx-auto min-h-screen w-full max-w-[430px] bg-platform-surface ${platformMobileShellClass}`}
      >
        <PublicPlaylistPageView
          detail={loaded.detail}
          isAuthenticated={Boolean(user)}
        />
        <BottomNav />
      </div>
    </main>
  );
}
