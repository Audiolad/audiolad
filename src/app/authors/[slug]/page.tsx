import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import BottomNav from "@/components/BottomNav";
import { getDisplayFormat, PRODUCT_FORMAT_LINE_CLASS } from "@/lib/author-products/format";
import {
  getAuthorBySlug,
  getAuthorPublishedPractices,
} from "@/lib/authors/lookup";
import { isProductFree } from "@/lib/products/price-format";
import { buildAuthorAvatarAlt } from "@/lib/seo/cover-alt";
import { platformMobileShellClass } from "@/lib/navigation/bottom-nav";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ slug: string }>;
};

function getAuthorInitial(name: string): string {
  const trimmed = name.trim();

  return trimmed ? trimmed[0].toUpperCase() : "А";
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const supabase = await createClient();
  const { author, error } = await getAuthorBySlug(supabase, slug);

  if (error || !author) {
    return {
      title: "Автор – АудиоЛад",
      robots: { index: false, follow: false },
    };
  }

  const description =
    typeof author.description === "string" ? author.description.trim() : "";

  return {
    title: `${author.name} – АудиоЛад`,
    description: description || `Аудиопрактики автора ${author.name} на АудиоЛаде.`,
  };
}

export default async function AuthorPublicPage({ params }: PageProps) {
  const { slug } = await params;
  const supabase = await createClient();
  const { author, error } = await getAuthorBySlug(supabase, slug);

  if (error) {
    notFound();
  }

  if (!author) {
    notFound();
  }

  const { practices, error: practicesError } = await getAuthorPublishedPractices(
    supabase,
    author.id,
    author.slug,
  );

  const description = author.description?.trim() || null;
  const avatarUrl = author.avatar_url?.trim() || null;

  return (
    <main className="min-h-screen bg-platform-surface text-[#25135c]">
      <div
        className={`mx-auto min-h-screen w-full max-w-[430px] bg-platform-surface ${platformMobileShellClass}`}
      >
        <div className="px-5 pt-6">
          <Link
            href="/authors"
            className="inline-flex items-center text-sm font-medium text-[#7042c5] underline-offset-2 hover:underline focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
          >
            ← Все авторы
          </Link>

          <section className="mt-6 overflow-hidden rounded-[28px] border border-[#eadff8] bg-white p-5 shadow-[0_10px_28px_rgba(91,62,145,0.07)]">
            <div className="flex items-start gap-4">
              <div className="flex h-[96px] w-[96px] shrink-0 items-center justify-center overflow-hidden rounded-[24px] bg-gradient-to-br from-[#7042c5] to-[#a27bd9] text-3xl font-semibold text-white">
                {avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={avatarUrl}
                    alt={buildAuthorAvatarAlt(author.name)}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  getAuthorInitial(author.name)
                )}
              </div>

              <div className="min-w-0">
                <h1 className="text-[28px] font-semibold leading-tight">
                  {author.name}
                </h1>
                {description ? (
                  <p className="mt-3 text-[15px] leading-7 text-[#65577f]">
                    {description}
                  </p>
                ) : (
                  <p className="mt-3 text-sm leading-6 text-[#7d70a2]">
                    Аудиопрактики и программы автора на платформе АудиоЛад.
                  </p>
                )}
              </div>
            </div>
          </section>

          <section className="mt-8">
            <h2 className="text-[22px] font-semibold">Опубликованные практики</h2>

            {practicesError ? (
              <p className="mt-4 rounded-[20px] border border-[#eadff8] bg-[#faf6ff] px-4 py-4 text-sm leading-6 text-[#7d70a2]">
                Не удалось загрузить список практик. Попробуйте обновить страницу.
              </p>
            ) : practices.length === 0 ? (
              <p className="mt-4 rounded-[20px] border border-[#eadff8] bg-[#faf6ff] px-4 py-4 text-sm leading-6 text-[#7d70a2]">
                У автора пока нет опубликованных практик.
              </p>
            ) : (
              <div className="mt-4 space-y-3">
                {practices.map((practice) => {
                  const productTypeLabel =
                    getDisplayFormat(practice.format) ?? "Аудиопрактика";
                  const showPrice = !isProductFree(practice.is_free, practice.price);

                  return (
                  <Link
                    key={practice.id}
                    href={practice.href}
                    className="block rounded-[24px] border border-[#eadff8] bg-white p-4 shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className={PRODUCT_FORMAT_LINE_CLASS}>{productTypeLabel}</p>
                        <h3 className="mt-1 text-[17px] font-semibold leading-5">
                          {practice.title}
                        </h3>
                        {practice.subtitle ? (
                          <p className="mt-1 line-clamp-2 text-sm leading-5 text-[#7d70a2]">
                            {practice.subtitle}
                          </p>
                        ) : null}
                        {practice.duration_minutes ? (
                          <p className="mt-2 text-sm text-[#7d70a2]">
                            {practice.duration_minutes} мин
                          </p>
                        ) : null}
                      </div>
                      {showPrice ? (
                      <span className="shrink-0 rounded-full bg-[#f4ecfb] px-3 py-1 text-sm font-semibold text-[#7042c5]">
                        {practice.priceLabel}
                      </span>
                      ) : null}
                    </div>
                  </Link>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        <BottomNav />
      </div>
    </main>
  );
}
