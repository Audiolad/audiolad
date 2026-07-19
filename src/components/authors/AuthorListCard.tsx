import Link from "next/link";

import AuthorAvatarImage from "@/components/authors/AuthorAvatarImage";
import { formatAuthorProductCount } from "@/lib/authors/public-list";
import type { PublicAuthorCard } from "@/lib/authors/public-list-data";
import { parseImageManifest } from "@/lib/images/image-manifest";
import type { ImageManifest } from "@/lib/images/image-types";

type AuthorListCardProps = {
  author: PublicAuthorCard;
};

export default function AuthorListCard({ author }: AuthorListCardProps) {
  const avatarManifest = parseImageManifest(author.avatarImage) as ImageManifest | null;

  return (
    <article className="rounded-[26px] border border-[#eadff8] bg-white p-4 shadow-[0_10px_28px_rgba(91,62,145,0.07)]">
      <Link
        href={author.href}
        className="group block rounded-[20px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
      >
        <div className="flex gap-4">
          <div className="flex h-[112px] w-[112px] shrink-0 overflow-hidden rounded-[24px]">
            <AuthorAvatarImage
              name={author.name}
              avatarUrl={author.avatarUrl}
              avatarManifest={avatarManifest}
              size={112}
            />
          </div>

          <div className="min-w-0 flex-1">
            <h3 className="text-balance break-words text-[19px] font-semibold leading-6 text-[#25135c] group-hover:text-[#7042c5]">
              {author.name}
            </h3>

            <p className="mt-1 line-clamp-3 text-sm font-medium leading-5 text-[#7042c5]">
              {author.shortPositioning}
            </p>

            {author.shortBio ? (
              <p className="mt-2 line-clamp-3 text-sm leading-5 text-[#70628e]">
                {author.shortBio}
              </p>
            ) : null}
          </div>
        </div>
      </Link>

      <div className="mt-4 flex items-center justify-between gap-3 border-t border-[#eee6f7] pt-4">
        <p className="text-sm font-medium text-[#25135c]">
          {formatAuthorProductCount(author.publishedCount)}
        </p>

        <Link
          href={author.href}
          className="inline-flex min-h-11 items-center justify-center rounded-full bg-[#7042c5] px-4 py-2 text-sm font-medium text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
        >
          Открыть
        </Link>
      </div>
    </article>
  );
}
