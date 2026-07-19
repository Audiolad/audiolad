import Link from "next/link";

import AuthorAvatarImage from "@/components/authors/AuthorAvatarImage";
import type { SimilarAuthorCard } from "@/lib/authors/similar-authors";

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
            <div className="mx-auto flex h-20 w-20 overflow-hidden rounded-[20px]">
              <AuthorAvatarImage
                name={author.name}
                avatarUrl={author.avatarUrl}
                size={80}
              />
            </div>

            <h3 className="mt-3 line-clamp-2 text-center text-[16px] font-semibold leading-5 text-[#25135c] group-hover:text-[#7042c5]">
              {author.name}
            </h3>

            {author.positioningText ? (
              <p className="mt-2 line-clamp-3 text-center text-sm leading-5 text-[#7d70a2]">
                {author.positioningText}
              </p>
            ) : null}
          </Link>
        ))}
      </div>
    </section>
  );
}
