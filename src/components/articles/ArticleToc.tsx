"use client";

import { useArticlePlayback } from "@/components/articles/ArticlePlaybackProvider";

export type ArticleTocItem = {
  id: string;
  title: string;
};

type ArticleTocProps = {
  items: readonly ArticleTocItem[];
};

export default function ArticleToc({ items }: ArticleTocProps) {
  const { trackEvent } = useArticlePlayback();

  if (items.length === 0) {
    return null;
  }

  return (
    <nav
      aria-label="Оглавление статьи"
      className="mt-8 rounded-[24px] border border-[#e8def5] bg-[#faf7ff] p-4 sm:p-5"
    >
      <details className="group" open>
        <summary className="cursor-pointer list-none text-base font-semibold text-[#25135c] marker:content-none [&::-webkit-details-marker]:hidden">
          <span className="flex items-center justify-between gap-3">
            Оглавление
            <span
              aria-hidden
              className="text-[#7042c5] transition group-open:rotate-45 md:hidden"
            >
              +
            </span>
          </span>
        </summary>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-6 text-[#4a3d73] sm:text-[15px] sm:leading-7">
          {items.map((item) => (
            <li key={item.id}>
              <a
                href={`#${item.id}`}
                className="font-medium text-[#7042c5] underline-offset-2 hover:underline focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
                onClick={() =>
                  trackEvent("article_toc_click", {
                    placement: "toc",
                    section_id: item.id,
                  })
                }
              >
                {item.title}
              </a>
            </li>
          ))}
        </ol>
      </details>
    </nav>
  );
}
