import Link from "next/link";

import {
  buildCatalogClearSearchHref,
} from "@/lib/catalog/topic-filter";

type CatalogSearchFormProps = {
  query: string;
  activeTopicKey: string | null;
};

function SearchIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5 shrink-0 text-[#7042c5]"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </svg>
  );
}

function ClearIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}

export default function CatalogSearchForm({
  query,
  activeTopicKey,
}: CatalogSearchFormProps) {
  const clearHref = buildCatalogClearSearchHref(activeTopicKey);

  return (
    <form
      method="get"
      action="/catalog"
      className="mt-6 flex items-center gap-2 rounded-[22px] border border-[#ded1f1] bg-white px-3 py-2 shadow-[0_2px_10px_rgba(90,60,145,0.04)] sm:gap-3 sm:px-4 sm:py-2.5"
      role="search"
    >
      <label htmlFor="catalog-search" className="sr-only">
        Поиск аудиопродуктов
      </label>

      <span className="pl-1 text-[#7042c5]">
        <SearchIcon />
      </span>

      <input
        id="catalog-search"
        name="q"
        type="search"
        defaultValue={query}
        placeholder="Поиск аудиопродуктов"
        autoComplete="off"
        enterKeyHint="search"
        maxLength={100}
        className="min-w-0 flex-1 border-0 bg-transparent py-2 text-[15px] text-[#25135c] placeholder:text-[#9485b4] focus:outline-none"
      />

      {activeTopicKey ? (
        <input type="hidden" name="topic" value={activeTopicKey} />
      ) : null}

      {query ? (
        <Link
          href={clearHref}
          aria-label="Очистить поиск"
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[#9485b4] transition hover:bg-[#faf6ff] hover:text-[#7042c5] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
        >
          <ClearIcon />
        </Link>
      ) : (
        <button
          type="submit"
          className="inline-flex h-10 shrink-0 items-center justify-center rounded-full bg-[#7042c5] px-4 text-sm font-medium text-white transition hover:bg-[#6338b0] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
        >
          Найти
        </button>
      )}

      {query ? (
        <button
          type="submit"
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
        >
          Найти
        </button>
      ) : null}
    </form>
  );
}