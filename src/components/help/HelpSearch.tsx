"use client";

import Link from "next/link";
import { useDeferredValue, useEffect, useMemo, useState } from "react";

import { trackHelpSearch } from "@/lib/help/analytics";
import { helpSupportHref } from "@/lib/help/paths";
import { searchHelpArticles, type HelpSearchDocument } from "@/lib/help/search";

type HelpSearchProps = {
  index: HelpSearchDocument[];
  path?: string;
};

export default function HelpSearch({
  index,
  path = "/help",
}: HelpSearchProps) {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query.trim());

  const hits = useMemo(
    () => searchHelpArticles(index, deferredQuery, { limit: 12 }),
    [deferredQuery, index],
  );

  useEffect(() => {
    if (deferredQuery.length < 2) return;
    trackHelpSearch({
      path,
      queryLength: deferredQuery.length,
      resultCount: hits.length,
    });
  }, [deferredQuery, hits.length, path]);

  return (
    <section className="mt-8 max-w-3xl" aria-labelledby="help-search-heading">
      <h2 id="help-search-heading" className="sr-only">
        Поиск по справочному центру
      </h2>
      <label htmlFor="help-search-input" className="block text-sm font-medium text-[#5f5484]">
        Поиск инструкций
      </label>
      <input
        id="help-search-input"
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Например: опубликовать практику или не пришло письмо"
        autoComplete="off"
        className="mt-2 min-h-12 w-full rounded-[18px] border border-[#eadff8] bg-white px-4 text-[16px] text-[#25135c] outline-none placeholder:text-[#a89bc4] focus:border-[#7042c5] focus:ring-2 focus:ring-[#7042c5]/40"
      />

      {deferredQuery.length >= 2 ? (
        <div className="mt-4" aria-live="polite">
          {hits.length > 0 ? (
            <ul className="space-y-3">
              {hits.map((hit) => (
                <li key={hit.articleId}>
                  <Link
                    href={hit.href}
                    className="block rounded-[20px] border border-[#eadff8] bg-white px-4 py-4 transition hover:border-[#c9b6ea] hover:bg-[#faf7ff] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
                  >
                    <span className="text-[16px] font-semibold text-[#25135c]">
                      {hit.title}
                    </span>
                    <span className="mt-1 block text-sm leading-6 text-[#5f5484]">
                      {hit.description}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="rounded-[20px] border border-[#eadff8] bg-white px-4 py-5">
              <p className="text-[15px] leading-6 text-[#4c3d78]">
                Ничего не найдено по вашему запросу.
              </p>
              <p className="mt-2 text-sm leading-6 text-[#5f5484]">
                Попробуйте другие слова или задайте вопрос поддержке.
              </p>
              <Link
                href={helpSupportHref({ source: path })}
                className="mt-4 inline-flex min-h-11 items-center justify-center rounded-[16px] bg-[#7042c5] px-5 text-sm font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
              >
                Задать вопрос
              </Link>
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}
