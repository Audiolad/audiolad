import Link from "next/link";

import type { HomeAuthor } from "@/lib/home/types";

import HomeSectionHeader from "./HomeSectionHeader";

function formatPublishedCount(count: number): string {
  const abs = Math.abs(count);
  const mod10 = abs % 10;
  const mod100 = abs % 100;

  let word = "продуктов";

  if (mod10 === 1 && mod100 !== 11) {
    word = "продукт";
  } else if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    word = "продукта";
  }

  return `${count} ${word}`;
}

function getAuthorInitial(name: string): string {
  const trimmed = name.trim();
  return trimmed ? trimmed[0].toUpperCase() : "А";
}

type AuthorsRailProps = {
  authors: HomeAuthor[];
};

export default function AuthorsRail({ authors }: AuthorsRailProps) {
  if (authors.length === 0) {
    return null;
  }

  return (
    <section className="home-section-carousel mt-8" aria-label="Авторы">
      <HomeSectionHeader title="Авторы" href="/authors" linkLabel="Все авторы" />

      <div className="home-carousel-track catalog-carousel mt-4 flex gap-3 overflow-x-auto pb-1">
        {authors.map((author) => (
          <article
            key={author.id}
            className="flex w-[220px] shrink-0 snap-start flex-col rounded-[24px] border border-[#eadff8] bg-white p-4 shadow-sm sm:w-[240px]"
          >
            <div className="flex items-start gap-3">
              <div className="flex h-[72px] w-[72px] shrink-0 items-center justify-center overflow-hidden rounded-[20px] bg-gradient-to-br from-[#7042c5] to-[#a27bd9] text-2xl font-semibold text-white">
                {author.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={author.avatarUrl}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  getAuthorInitial(author.name)
                )}
              </div>

              <div className="min-w-0">
                <h3 className="line-clamp-2 text-[17px] font-semibold leading-5 text-[#25135c]">
                  {author.name}
                </h3>
                <p className="mt-1 text-xs text-[#7d70a2]">
                  {formatPublishedCount(author.publishedCount)}
                </p>
              </div>
            </div>

            {author.description ? (
              <p className="mt-3 line-clamp-3 text-sm leading-5 text-[#7d70a2]">
                {author.description}
              </p>
            ) : null}

            <Link
              href={author.href}
              className="mt-4 inline-flex min-h-10 items-center justify-center rounded-2xl border border-[#7042c5] px-4 py-2 text-sm font-semibold text-[#7042c5] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
            >
              Открыть автора
            </Link>
          </article>
        ))}
      </div>
    </section>
  );
}
