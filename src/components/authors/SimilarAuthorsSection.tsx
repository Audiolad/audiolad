import Link from "next/link";

import { buildAuthorAvatarAlt } from "@/lib/seo/cover-alt";
import type { SimilarAuthorCard } from "@/lib/authors/similar-authors";

function getAuthorInitial(name: string): string {
  const trimmed = name.trim();

  return trimmed ? trimmed[0].toUpperCase() : "А";
}

type SimilarAuthorsSectionProps = {
  authors: SimilarAuthorCard[];
};

export default function SimilarAuthorsSection({
  authors,
}: SimilarAuthorsSectionProps) {
  if (authors.length === 0) {
    return null;
  }

  return (
    <section className="mt-10" aria-labelledby="similar-authors-heading">
      <h2 id="similar-authors-heading" className="text-[22px] font-semibold xl:text-[24px]">
        Вам также могут понравиться
      </h2>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {authors.map((author) => (
          <Link
            key={author.id}
            href={author.href}
            className="group flex flex-col rounded-[24px] border border-[#eadff8] bg-white p-4 shadow-sm transition-shadow hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
          >
            <div className="mx-auto flex h-20 w-20 items-center justify-center overflow-hidden rounded-[20px] bg-gradient-to-br from-[#7042c5] to-[#a27bd9] text-2xl font-semibold text-white">
              {author.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={author.avatarUrl}
                  alt={buildAuthorAvatarAlt(author.name)}
                  className="h-full w-full object-cover"
                />
              ) : (
                getAuthorInitial(author.name)
              )}
            </div>

            <h3 className="mt-3 line-clamp-2 text-center text-[16px] font-semibold leading-5 text-[#25135c] group-hover:text-[#7042c5]">
              {author.name}
            </h3>

            {author.shortBio ? (
              <p className="mt-2 line-clamp-3 text-center text-sm leading-5 text-[#7d70a2]">
                {author.shortBio}
              </p>
            ) : null}
          </Link>
        ))}
      </div>
    </section>
  );
}
