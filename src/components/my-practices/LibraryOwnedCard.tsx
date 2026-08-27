import Link from "next/link";

import LibraryFallbackCover from "@/components/my-practices/LibraryFallbackCover";
import { PRODUCT_FORMAT_LINE_CLASS } from "@/lib/author-products/format";
import type {
  UnifiedPersonalLibraryEntry,
  UnifiedPrivateAudioLibraryEntry,
} from "@/lib/library/unified-entry";

type LibraryOwnedEntry =
  | UnifiedPrivateAudioLibraryEntry
  | UnifiedPersonalLibraryEntry;

type LibraryOwnedCardProps = {
  entry: LibraryOwnedEntry;
};

export default function LibraryOwnedCard({ entry }: LibraryOwnedCardProps) {
  const href = entry.href ?? "#";
  const coverUrl = entry.cover.url?.trim() || null;
  const source = entry.author.name?.trim() || "";

  return (
    <article
      data-library-owned-card={entry.kind}
      className="min-w-0 overflow-hidden rounded-[20px] border border-[#eadff8] bg-white shadow-[0_6px_16px_rgba(91,62,145,0.06)]"
    >
      <div
        data-library-owned-media-zone
        className="relative overflow-hidden bg-[#f4ecfb]"
      >
        <Link
          href={href}
          aria-label={entry.title}
          className="block focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
        >
          {coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- owned coverUrl is already resolved
            <img
              src={coverUrl}
              alt={entry.title}
              className="aspect-square w-full object-cover"
              draggable={false}
            />
          ) : (
            <LibraryFallbackCover title={entry.title} />
          )}
        </Link>
      </div>

      <Link
        href={href}
        data-library-owned-info-block
        className="block px-2.5 pb-2.5 pt-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
      >
        {entry.displayLabel ? (
          <p data-library-owned-type className={PRODUCT_FORMAT_LINE_CLASS}>
            {entry.displayLabel}
          </p>
        ) : null}

        <h3 className="line-clamp-2 min-h-10 text-[14px] font-semibold leading-5 text-[#25135c] sm:text-[15px] sm:leading-5">
          {entry.title}
        </h3>

        <p className="mt-1 line-clamp-1 min-h-5 text-sm text-[#7d70a2]">
          {source || "\u00a0"}
        </p>
      </Link>
    </article>
  );
}
