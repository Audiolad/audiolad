import Link from "next/link";

import AuthorAvatarImage from "@/components/authors/AuthorAvatarImage";
import type { HomeAuthor } from "@/lib/home/types";
import { formatAuthorProductCount } from "@/lib/authors/public-list";

import HomeSectionHeader from "./HomeSectionHeader";

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
              <div className="flex h-[72px] w-[72px] shrink-0 overflow-hidden rounded-[20px]">
                <AuthorAvatarImage
                  name={author.name}
                  avatarUrl={author.avatarUrl}
                  size={72}
                />
              </div>

              <div className="min-w-0">
                <h3 className="line-clamp-2 text-[17px] font-semibold leading-5 text-[#25135c]">
                  {author.name}
                </h3>
                <p className="mt-1 text-xs text-[#7d70a2]">
                  {formatAuthorProductCount(author.publishedCount)}
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
