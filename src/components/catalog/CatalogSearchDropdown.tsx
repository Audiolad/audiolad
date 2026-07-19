"use client";

import Link from "next/link";

import AuthorAvatarImage from "@/components/authors/AuthorAvatarImage";
import {
  buildCatalogSearchResultsHref,
  getCatalogSuggestAuthorOptionId,
  getCatalogSuggestProductOptionId,
  isCatalogSuggestResponseEmpty,
  type CatalogAuthorSuggestion,
  type CatalogProductSuggestion,
} from "@/lib/catalog/search-suggestions";
import { parseImageManifest } from "@/lib/images/image-manifest";
import type { ImageManifest } from "@/lib/images/image-types";

type CatalogSearchDropdownProps = {
  listboxId: string;
  query: string;
  activeTopicKey: string | null;
  authors: CatalogAuthorSuggestion[];
  products: CatalogProductSuggestion[];
  activeIndex: number;
  authorOffset: number;
  isLoading: boolean;
  hasError: boolean;
  onOptionHover: (index: number) => void;
};

function SuggestionSkeleton() {
  return (
    <div className="flex animate-pulse items-center gap-3 px-3 py-2.5">
      <div className="h-11 w-11 shrink-0 rounded-full bg-[#f3ebfc]" />
      <div className="min-w-0 flex-1 space-y-2">
        <div className="h-3.5 w-3/4 rounded bg-[#f3ebfc]" />
        <div className="h-3 w-1/2 rounded bg-[#f3ebfc]" />
      </div>
    </div>
  );
}

function ProductCover({ suggestion }: { suggestion: CatalogProductSuggestion }) {
  if (suggestion.coverUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={suggestion.coverUrl}
        alt=""
        className="h-11 w-11 shrink-0 rounded-[12px] object-cover"
      />
    );
  }

  return (
    <div
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] bg-gradient-to-br from-[#f0d9ff] via-[#dec4ff] to-[#c9b6f4] text-sm text-[#7042c5]"
      aria-hidden="true"
    >
      ♡
    </div>
  );
}

function SectionHeading({ children }: { children: string }) {
  return (
    <p className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-[0.08em] text-[#9485b4]">
      {children}
    </p>
  );
}

export default function CatalogSearchDropdown({
  listboxId,
  query,
  activeTopicKey,
  authors,
  products,
  activeIndex,
  authorOffset,
  isLoading,
  hasError,
  onOptionHover,
}: CatalogSearchDropdownProps) {
  const showAllHref = buildCatalogSearchResultsHref(query, activeTopicKey);
  const isEmpty = isCatalogSuggestResponseEmpty({ authors, products });

  return (
    <div
      id={listboxId}
      role="listbox"
      aria-label="Быстрые результаты поиска"
      className="absolute left-0 right-0 top-[calc(100%+8px)] z-40 max-h-[min(420px,calc(100dvh-12rem))] overflow-hidden rounded-[18px] border border-[#e8def5] bg-white shadow-[0_16px_40px_rgba(90,60,145,0.12)]"
    >
      <div className="max-h-[min(360px,calc(100dvh-14rem))] overflow-y-auto overscroll-contain py-1">
        {isLoading ? (
          <div className="px-1 py-1" aria-busy="true">
            <p className="px-3 py-2 text-sm text-[#7d70a2]">Ищем…</p>
            <SuggestionSkeleton />
            <SuggestionSkeleton />
            <SuggestionSkeleton />
          </div>
        ) : hasError ? (
          <p className="px-4 py-3 text-sm text-[#7d70a2]">
            Не удалось загрузить подсказки. Нажмите Enter для полного поиска.
          </p>
        ) : (
          <>
            {authors.length > 0 ? (
              <div>
                <SectionHeading>Авторы</SectionHeading>
                {authors.map((author, index) => {
                  const flatIndex = index;
                  const isActive = activeIndex === flatIndex;
                  const optionId = getCatalogSuggestAuthorOptionId(index);

                  return (
                    <Link
                      key={author.id}
                      id={optionId}
                      href={author.href}
                      role="option"
                      aria-selected={isActive}
                      onMouseEnter={() => onOptionHover(flatIndex)}
                      onMouseDown={(event) => event.preventDefault()}
                      className={`flex items-center gap-3 px-3 py-2.5 transition ${
                        isActive ? "bg-[#faf6ff]" : "hover:bg-[#faf6ff]"
                      }`}
                    >
                      <div className="h-11 w-11 shrink-0 overflow-hidden rounded-full">
                        <AuthorAvatarImage
                          name={author.name}
                          avatarUrl={author.avatarUrl}
                          avatarManifest={
                            parseImageManifest(null) as ImageManifest | null
                          }
                          size={44}
                          className="h-11 w-11 object-cover"
                        />
                      </div>

                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px] font-medium leading-5 text-[#25135c]">
                          {author.name}
                        </span>
                        <span className="mt-0.5 block truncate text-sm text-[#7d70a2]">
                          {author.positioningText
                            ? `${author.positioningText} · Автор`
                            : "Автор"}
                        </span>
                      </span>
                    </Link>
                  );
                })}
              </div>
            ) : null}

            {products.length > 0 ? (
              <div>
                <SectionHeading>Аудиопродукты</SectionHeading>
                {products.map((suggestion, index) => {
                  const flatIndex = authorOffset + index;
                  const isActive = activeIndex === flatIndex;
                  const optionId = getCatalogSuggestProductOptionId(index);
                  const meta = suggestion.subtitle || suggestion.format;

                  return (
                    <Link
                      key={suggestion.id}
                      id={optionId}
                      href={suggestion.href}
                      role="option"
                      aria-selected={isActive}
                      onMouseEnter={() => onOptionHover(flatIndex)}
                      onMouseDown={(event) => event.preventDefault()}
                      className={`flex items-center gap-3 px-3 py-2.5 transition ${
                        isActive ? "bg-[#faf6ff]" : "hover:bg-[#faf6ff]"
                      }`}
                    >
                      <ProductCover suggestion={suggestion} />

                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px] font-medium leading-5 text-[#25135c]">
                          {suggestion.title}
                        </span>
                        <span className="mt-0.5 block truncate text-sm text-[#7d70a2]">
                          {suggestion.authorName}
                          {meta ? ` · ${meta}` : ""}
                        </span>
                      </span>

                      <span className="shrink-0 text-xs font-medium text-[#7042c5]">
                        {suggestion.isFree ? "В подарок" : suggestion.priceLabel}
                      </span>
                    </Link>
                  );
                })}
              </div>
            ) : null}

            {isEmpty ? (
              <p className="px-4 py-3 text-sm text-[#7d70a2]">Ничего не найдено</p>
            ) : null}
          </>
        )}
      </div>

      <div className="border-t border-[#eee6f7] px-3 py-2">
        <Link
          href={showAllHref}
          onMouseDown={(event) => event.preventDefault()}
          className="flex min-h-11 items-center justify-center rounded-[12px] px-3 text-sm font-medium text-[#7042c5] transition hover:bg-[#faf6ff] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
        >
          {`Показать все результаты по запросу «${query}»`}
        </Link>
      </div>
    </div>
  );
}
