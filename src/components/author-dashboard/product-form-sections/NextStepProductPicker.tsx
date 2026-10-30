"use client";

import { useEffect, useMemo, useState } from "react";

import {
  NEXT_STEP_PRODUCT_OPTIONS_LIMIT,
  filterNextStepProductOptions,
  type NextStepProductOption,
} from "@/lib/products/next-step-product-options";

type NextStepProductPickerViewProps = {
  options: readonly NextStepProductOption[];
  status: "idle" | "loading" | "ready" | "error";
  query: string;
  selectedHref: string;
  disabled: boolean;
  onQueryChange: (value: string) => void;
  onSelect: (option: NextStepProductOption) => void;
};

/** Presentational list; no fetching, so it can be rendered statically. */
export function NextStepProductPickerView({
  options,
  status,
  query,
  selectedHref,
  disabled,
  onQueryChange,
  onSelect,
}: NextStepProductPickerViewProps) {
  const showAuthorName = useMemo(
    () => new Set(options.map((option) => option.authorName)).size > 1,
    [options],
  );
  const trimmedHref = selectedHref.trim();

  return (
    <div className="space-y-3 rounded-[18px] border border-[#eee6f7] bg-[#fbf8ff] p-3 sm:p-4">
      <div>
        <span className="block text-sm font-medium text-[#3f3560]">
          Выбрать свой продукт
        </span>
        <span className="mt-1 block text-xs leading-5 text-[#7d70a2]">
          Ваши опубликованные продукты из всех авторских пространств. Ссылка
          подставится сама.
        </span>
      </div>
      <input
        type="search"
        value={query}
        disabled={disabled}
        onChange={(event) => onQueryChange(event.target.value)}
        placeholder="Найти по названию"
        aria-label="Найти свой продукт по названию"
        className="w-full rounded-[16px] border border-[#e4d7f4] bg-white px-4 py-2.5 text-sm outline-none focus:border-[#9a74d8] disabled:bg-platform-surface"
      />
      {status === "loading" && options.length === 0 ? (
        <p className="px-1 text-sm text-[#7d70a2]">Загружаем ваши продукты…</p>
      ) : status === "error" ? (
        <p role="status" className="px-1 text-sm text-[#9b3d3d]">
          Не удалось загрузить продукты. Можно вставить ссылку вручную ниже.
        </p>
      ) : options.length === 0 ? (
        <p className="px-1 text-sm text-[#7d70a2]">
          {query.trim()
            ? "Ничего не нашлось. Попробуйте другое название."
            : "Пока нет других опубликованных продуктов. После публикации их можно будет выбрать здесь."}
        </p>
      ) : (
        <ul
          role="listbox"
          aria-label="Ваши продукты"
          className="max-h-[320px] space-y-1.5 overflow-y-auto overscroll-contain pr-1"
        >
          {options.map((option) => {
            const selected = option.href === trimmedHref;
            return (
              <li key={option.id} role="option" aria-selected={selected}>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onSelect(option)}
                  className={`flex min-h-14 w-full items-center gap-3 rounded-[14px] border px-2.5 py-2 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#7042c5] ${
                    selected
                      ? "border-[#9a74d8] bg-white shadow-[0_4px_14px_rgba(91,62,145,0.10)]"
                      : "border-transparent bg-white/70 hover:border-[#e4d7f4] hover:bg-white"
                  }`}
                >
                  {option.coverUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={option.coverUrl}
                      alt=""
                      loading="lazy"
                      className="h-11 w-11 shrink-0 rounded-[10px] object-cover"
                    />
                  ) : (
                    <span
                      aria-hidden
                      className="h-11 w-11 shrink-0 rounded-[10px] bg-gradient-to-br from-[#f0d9ff] via-[#dec4ff] to-[#c9b6f4]"
                    />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-2 text-sm font-medium leading-5 text-[#25135c]">
                      {option.title}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-[#7d70a2]">
                      {option.typeLabel}
                      {showAuthorName && option.authorName
                        ? ` · ${option.authorName}`
                        : ""}
                    </span>
                    {selected ? (
                      <span className="mt-0.5 block text-xs font-semibold text-[#6338b0] sm:hidden">
                        Выбрано
                      </span>
                    ) : null}
                  </span>
                  {selected ? (
                    <span className="hidden shrink-0 rounded-full bg-[#efe7fb] px-2.5 py-1 sm:inline-flex text-xs font-semibold text-[#6338b0]">
                      Выбрано
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

type NextStepProductPickerProps = {
  excludeProductId?: string | null;
  selectedHref: string;
  disabled: boolean;
  onSelect: (option: NextStepProductOption) => void;
};

/** Loads the signed-in author's own published products from the author API. */
export default function NextStepProductPicker({
  excludeProductId = null,
  selectedHref,
  disabled,
  onSelect,
}: NextStepProductPickerProps) {
  const [query, setQuery] = useState("");
  const [allOptions, setAllOptions] = useState<NextStepProductOption[]>([]);
  const [searchResult, setSearchResult] = useState<{
    query: string;
    options: NextStepProductOption[];
  } | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("loading");

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams();
    if (excludeProductId) params.set("exclude", excludeProductId);
    void fetch(`/api/author/next-step-products?${params}`, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("next_step_products_failed");
        const payload = (await response.json()) as { options?: NextStepProductOption[] };
        setAllOptions(payload.options ?? []);
        setStatus("ready");
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setStatus("error");
      });
    return () => controller.abort();
  }, [excludeProductId]);

  // Full list fits in one page: filter locally. Otherwise ask the server.
  const trimmedQuery = query.trim();
  const needsServerSearch =
    allOptions.length >= NEXT_STEP_PRODUCT_OPTIONS_LIMIT && trimmedQuery.length >= 2;

  useEffect(() => {
    if (!needsServerSearch) {
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams({ q: trimmedQuery });
      if (excludeProductId) params.set("exclude", excludeProductId);
      void fetch(`/api/author/next-step-products?${params}`, {
        signal: controller.signal,
        cache: "no-store",
      })
        .then((response) => (response.ok ? response.json() : { options: [] }))
        .then((payload: { options?: NextStepProductOption[] }) => {
          setSearchResult({ query: trimmedQuery, options: payload.options ?? [] });
        })
        .catch(() => undefined);
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [needsServerSearch, trimmedQuery, excludeProductId]);

  const visibleOptions =
    needsServerSearch && searchResult?.query === trimmedQuery
      ? searchResult.options
      : filterNextStepProductOptions(allOptions, query);

  return (
    <NextStepProductPickerView
      options={visibleOptions}
      status={status}
      query={query}
      selectedHref={selectedHref}
      disabled={disabled}
      onQueryChange={setQuery}
      onSelect={onSelect}
    />
  );
}
