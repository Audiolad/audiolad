import Link from "next/link";
import BottomNav from "@/components/BottomNav";
import { buildPracticePublicPath } from "@/lib/products/paths";
import { formatProductMeta } from "@/lib/products/duration";
import {
  groupAudioSummariesByPractice,
  loadPublishedAudioSummaries,
} from "@/lib/products/public-audio-items";
import { createClient } from "@/lib/supabase/server";
import { platformNavPaddingClass } from "@/lib/navigation/bottom-nav";

export const dynamic = "force-dynamic";

type Practice = {
  id: string;
  title: string;
  slug: string;
  subtitle: string | null;
  description: string | null;
  format: string | null;
  duration_minutes: number | null;
  price: number | null;
  is_free: boolean | null;
  authors: { name: string; slug: string } | { name: string; slug: string }[] | null;
};

type CatalogPractice = Practice & {
  meta: string | null;
  authorName: string | null;
  authorSlug: string | null;
};

async function getCatalogPractices(): Promise<CatalogPractice[]> {
  const supabase = await createClient();

  const { data: practices, error } = await supabase
    .from("practices")
    .select(
      `
      id,
      title,
      slug,
      subtitle,
      description,
      format,
      duration_minutes,
      price,
      is_free,
      authors (
        name,
        slug
      )
    `,
    )
    .eq("status", "published")
    .order("created_at", { ascending: false });

  if (error) {
    return [];
  }

  const practiceRows = (practices ?? []) as Practice[];

  if (practiceRows.length === 0) {
    return [];
  }

  let audioSummaryMap = new Map<
    string,
    { audioCount: number; totalDurationSeconds: number }
  >();

  try {
    const summaries = await loadPublishedAudioSummaries(
      supabase,
      practiceRows.map((practice) => practice.id),
    );
    audioSummaryMap = groupAudioSummariesByPractice(summaries);
  } catch {
    audioSummaryMap = new Map();
  }

  return practiceRows.map((practice) => {
    const audioSummary = audioSummaryMap.get(practice.id);
    const author = Array.isArray(practice.authors)
      ? practice.authors[0]
      : practice.authors;

    return {
      ...practice,
      authorName: author?.name?.trim() ?? null,
      authorSlug: author?.slug?.trim() ?? null,
      meta: formatProductMeta({
        format: practice.format,
        audioCount: audioSummary?.audioCount ?? 0,
        totalDurationSeconds: audioSummary?.totalDurationSeconds ?? 0,
        durationMinutesFallback: practice.duration_minutes,
      }),
    };
  });
}

const categories = [
  ["Любовь и отношения", "♡"],
  ["Деньги и изобилие", "₽"],
  ["Спокойствие и сон", "☾"],
  ["Энергия и восстановление", "✦"],
];

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none">
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8" />
      <path d="m16.5 16.5 4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export default async function CatalogPage() {
  const practices = await getCatalogPractices();

  return (
    <main className="min-h-screen bg-[#f7f2fc] text-[#25135c]">
      <div
        className={`mx-auto min-h-screen w-full max-w-[430px] bg-[#fffdfd] shadow-sm ${platformNavPaddingClass}`}
      >
        <div className="px-5 pt-6">
          <header className="flex items-center justify-between">
            <Link href="/" aria-label="Назад" className="flex h-11 w-11 items-center justify-center rounded-full border border-[#e4d7f4] text-3xl text-[#7042c5]">
              ‹
            </Link>

            <h1 className="text-[28px] font-semibold">Каталог практик</h1>

            <button type="button" aria-label="Поиск" className="flex h-11 w-11 items-center justify-center rounded-full border border-[#e4d7f4] text-[#7042c5]">
              <SearchIcon />
            </button>
          </header>

          <label className="mt-6 flex items-center gap-3 rounded-[22px] border border-[#ded1f1] bg-white px-4 py-3.5">
            <span className="text-[#7042c5]"><SearchIcon /></span>
            <input type="search" placeholder="Поиск практик, авторов и тем" className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-[#9485b4]" />
          </label>

          <section className="mt-6">
            <h2 className="text-[22px] font-semibold">Категории</h2>

            <div className="mt-4 grid grid-cols-2 gap-3">
              {categories.map(([title, icon]) => (
                <button key={title} type="button" className="min-h-[120px] rounded-[24px] bg-gradient-to-br from-[#f4ddf5] to-[#dcd9f7] p-4 text-left">
                  <span className="text-4xl text-[#7042c5]">{icon}</span>
                  <span className="mt-4 block text-[16px] font-semibold leading-5">{title}</span>
                  <span className="mt-2 block text-sm text-[#76679d]">Подборка практик</span>
                </button>
              ))}
            </div>
          </section>

          <section className="mt-8">
            <h2 className="text-[22px] font-semibold">Практики из базы</h2>

            <div className="mt-4 space-y-3">
              {practices.map((practice) => (
                <Link
                  key={practice.id}
                  href={
                    practice.authorSlug
                      ? buildPracticePublicPath(
                          practice.authorSlug,
                          practice.slug,
                        )
                      : `/practice/${practice.slug}`
                  }
                  className="block rounded-[24px] border border-[#e8def5] bg-white p-4 shadow-sm"
                >
                  <div className="flex gap-4">
                    <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-[20px] bg-gradient-to-br from-[#8d6ad8] to-[#f1c4d6] text-4xl text-white">
                      ✦
                    </div>

                    <div className="min-w-0">
                      <h3 className="line-clamp-2 text-[17px] font-semibold leading-5">
                        {practice.title}
                      </h3>
                      {practice.subtitle ? (
                        <p className="mt-1 line-clamp-2 text-sm leading-5 text-[#7d70a2]">
                          {practice.subtitle}
                        </p>
                      ) : null}
                      <p className="mt-1 text-sm text-[#7042c5]">
                        {practice.authorName ?? "Автор"}
                      </p>
                      {practice.meta ? (
                        <p className="mt-1 text-sm text-[#7d70a2]">{practice.meta}</p>
                      ) : null}
                      {practice.description ? (
                        <p className="mt-2 line-clamp-3 whitespace-pre-line text-sm leading-5 text-[#7d70a2]">
                          {practice.description}
                        </p>
                      ) : null}
                      <p className="mt-2 font-semibold text-[#7042c5]">
                        {practice.is_free ? "Бесплатно" : `${practice.price} ₽`}
                      </p>
                    </div>
                  </div>
                </Link>
              ))}

              {practices.length === 0 && (
                <div className="rounded-[24px] border border-[#e8def5] bg-[#faf6ff] p-5 text-center text-sm text-[#7d70a2]">
                  Практики пока не загрузились из базы.
                </div>
              )}
            </div>
          </section>
        </div>

        <BottomNav />
      </div>
    </main>
  );
}
