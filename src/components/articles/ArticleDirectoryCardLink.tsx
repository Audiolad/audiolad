import Link from "next/link";

import type { ArticleDirectoryCard } from "@/lib/seo/articles/directory";
import { formatArticleReadingTimeLabel } from "@/lib/seo/articles/reading-time-label";

type ArticleDirectoryCardLinkProps = {
  article: ArticleDirectoryCard;
};

export default function ArticleDirectoryCardLink({
  article,
}: ArticleDirectoryCardLinkProps) {
  return (
    <Link
      href={article.href}
      className="group block rounded-[20px] border border-[#e8def5] bg-[#faf7ff] px-5 py-4 transition hover:border-[#c9b6ea] hover:bg-[#f4ecfb] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
    >
      <span className="flex items-start justify-between gap-3">
        <span className="min-w-0 text-base font-semibold leading-snug text-[#25135c] break-words group-hover:text-[#7042c5]">
          {article.title}
        </span>
        <span
          aria-hidden="true"
          className="mt-0.5 shrink-0 text-lg font-semibold text-[#7042c5]"
        >
          →
        </span>
      </span>
      <span className="mt-2 block text-sm leading-6 text-[#4a3d73] sm:text-[15px] sm:leading-7">
        {article.description}
      </span>
      <span className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-[#6234b5]">
        {article.topicTitle ? <span>{article.topicTitle}</span> : null}
        <span>{formatArticleReadingTimeLabel(article.readingTimeMinutes)}</span>
      </span>
    </Link>
  );
}
