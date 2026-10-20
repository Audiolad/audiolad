"use client";

import {
  useDeferredValue,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type MouseEvent,
} from "react";

import { useSearchParams } from "next/navigation";

import ArticleDirectoryCardLink from "@/components/articles/ArticleDirectoryCardLink";
import type { ArticleDirectoryCard } from "@/lib/seo/articles/directory";
import {
  ARTICLE_SEARCH_PARAM,
  ARTICLE_SEARCH_QUERY_MAX_LENGTH,
  buildArticleSearchHaystack,
  buildArticleSearchHref,
  formatArticleSearchCountLabel,
  matchesArticleSearchTokens,
  resolveArticleSearchUrlSync,
  sanitizeArticleSearchQuery,
  tokenizeArticleSearchQuery,
} from "@/lib/seo/articles/directory-search";

type ArticleDirectorySearchProps = {
  /** All directory cards (the whole list – the directory is not paginated). */
  articles: readonly ArticleDirectoryCard[];
  /** Server-read ?q= so the first render already matches the shared URL. */
  initialQuery: string;
  /** Form action for the no-JS fallback (GET ?q=). */
  action: string;
};

/**
 * Progressive search over the /articles list. Without JS the form submits
 * GET ?q= and the server renders the filtered list; with JS filtering is
 * instant and the query is mirrored into the URL via history.replaceState.
 */
export default function ArticleDirectorySearch({
  articles,
  initialQuery,
  action,
}: ArticleDirectorySearchProps) {
  const inputId = useId();
  const countId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState(() => sanitizeArticleSearchQuery(initialQuery));
  const deferredQuery = useDeferredValue(query);
  const searchParams = useSearchParams();
  const urlQuery = sanitizeArticleSearchQuery(
    searchParams ? (searchParams.get(ARTICLE_SEARCH_PARAM) ?? "") : initialQuery,
  );
  /** Last ?q= value this component wrote itself (so our own replaceState is not echoed back). */
  const lastWrittenQueryRef = useRef<string | null>(null);

  // Navigation to /articles or /articles?q=… (links, Back/Forward) keeps this component
  // mounted: adopt the URL query whenever it changed for a reason other than our own write.
  useEffect(() => {
    const next = resolveArticleSearchUrlSync({
      urlQuery,
      lastWrittenQuery: lastWrittenQueryRef.current,
      currentQuery: query,
    });

    if (next !== null) {
      lastWrittenQueryRef.current = null;
      setQuery(next);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- react to URL changes only
  }, [urlQuery]);

  const indexed = useMemo(
    () =>
      articles.map((article) => ({
        article,
        haystack: buildArticleSearchHaystack(article),
      })),
    [articles],
  );

  const tokens = useMemo(
    () => tokenizeArticleSearchQuery(deferredQuery),
    [deferredQuery],
  );
  const hasQuery = tokens.length > 0;
  const visible = useMemo(
    () =>
      hasQuery
        ? indexed
            .filter((entry) => matchesArticleSearchTokens(entry.haystack, tokens))
            .map((entry) => entry.article)
        : articles,
    [articles, hasQuery, indexed, tokens],
  );

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const next = buildArticleSearchHref(
      window.location.pathname,
      window.location.search,
      deferredQuery,
    );
    const current = `${window.location.pathname}${window.location.search}`;

    if (next !== current) {
      lastWrittenQueryRef.current = sanitizeArticleSearchQuery(deferredQuery);
      // null state: Next.js syncs useSearchParams with history.replaceState(null, …).
      window.history.replaceState(null, "", next);
    }
  }, [deferredQuery]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    // JS is on: filtering is already live, keep the page in place.
    event.preventDefault();
  }

  function clearQuery(event?: MouseEvent<HTMLAnchorElement>) {
    // JS is on: clear in place instead of following the no-JS fallback link.
    event?.preventDefault();
    setQuery("");
    inputRef.current?.focus();
  }

  const countLabel = formatArticleSearchCountLabel(
    visible.length,
    articles.length,
    hasQuery,
  );

  return (
    <>
      <form
        role="search"
        action={action}
        method="get"
        onSubmit={handleSubmit}
        className="mt-4"
      >
        <label
          htmlFor={inputId}
          className="block text-sm font-medium text-[#25135c]"
        >
          Поиск по материалам
        </label>
        <div className="mt-2 flex gap-2">
          <input
            ref={inputRef}
            id={inputId}
            type="search"
            name={ARTICLE_SEARCH_PARAM}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            maxLength={ARTICLE_SEARCH_QUERY_MAX_LENGTH}
            placeholder="Например, медитация на деньги"
            autoComplete="off"
            enterKeyHint="search"
            aria-describedby={countId}
            className="min-h-11 w-full min-w-0 flex-1 rounded-[14px] border border-[#e8def5] bg-white px-4 py-2 text-base text-[#25135c] placeholder:text-[#9a8fbd] [&::-webkit-search-cancel-button]:appearance-none focus-visible:border-[#7042c5] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#7042c5]"
          />
          {query ? (
            <a
              href={action}
              onClick={clearQuery}
              className="inline-flex min-h-11 shrink-0 items-center rounded-[14px] border border-[#e8def5] bg-white px-4 text-sm font-medium text-[#7042c5] transition hover:border-[#c9b6ea] hover:bg-[#faf7ff] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
            >
              Очистить
            </a>
          ) : null}
        </div>
        <p
          id={countId}
          role="status"
          aria-live="polite"
          className="mt-2 text-sm text-[#6234b5]"
        >
          {countLabel}
        </p>
      </form>

      {visible.length === 0 ? (
        <div className="mt-4 rounded-[24px] border border-[#e8def5] bg-white p-6 shadow-sm">
          <p className="text-base font-semibold text-[#25135c]">Ничего не нашлось</p>
          <p className="mt-2 text-base leading-7 text-[#4a3d73]">
            Попробуйте другое слово или более короткий запрос.
          </p>
          <a
            href={action}
            onClick={clearQuery}
            className="mt-4 inline-flex min-h-11 items-center rounded-[14px] bg-[#7042c5] px-5 text-sm font-semibold text-white transition hover:bg-[#6234b5] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
          >
            Сбросить поиск
          </a>
        </div>
      ) : (
        <ul className="mt-4 grid list-none gap-3 p-0">
          {visible.map((article) => (
            <li key={article.href}>
              <ArticleDirectoryCardLink article={article} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
