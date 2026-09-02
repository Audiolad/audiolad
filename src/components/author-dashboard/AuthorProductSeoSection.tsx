"use client";

import { useEffect, useMemo, useState } from "react";

import AuthorProductSeoStyleControls from "@/components/author-dashboard/AuthorProductSeoStyleControls";
import ProductCoverThumbnail from "@/components/products/ProductCoverThumbnail";
import { PRODUCT_FORMAT_LINE_CLASS } from "@/lib/author-products/format";
import {
  PRODUCT_CONTENT_LIMITS,
} from "@/lib/author-products/limits";
import {
  buildProductSeoPreview,
  evaluateProductSeoReadiness,
} from "@/lib/seo/product-metadata";
import {
  getPracticeSeoUsageHeading,
  type PracticeSeoContentInput,
} from "@/lib/products/practice-seo-content";
import {
  formatSeoSecondaryQueryBulkMessage,
  parseSeoSecondaryQueryList,
} from "@/lib/seo/secondary-query-list";
import { PRODUCT_SEO_AI_ERROR_MESSAGE } from "@/lib/seo/product-autofill/errors";
import {
  hasFilledGeneratedSeoFields,
  PRODUCT_SEO_ACCORDION_BADGE_COPY,
  PRODUCT_SEO_ACCORDION_TITLE,
  PRODUCT_SEO_ADD_OWN_FAQ,
  PRODUCT_SEO_CLOSED_TEASER,
  PRODUCT_SEO_GENERATE_CTA,
  PRODUCT_SEO_GENERATE_LOADING,
  PRODUCT_SEO_GENERATE_STAGE_TEXT,
  PRODUCT_SEO_OVERWRITE_CANCEL,
  PRODUCT_SEO_OVERWRITE_CONFIRM,
  PRODUCT_SEO_OVERWRITE_LOCKED_CONFIRM,
  PRODUCT_SEO_OVERWRITE_REPLACE,
  PRODUCT_SEO_READINESS_HINT,
  PRODUCT_SEO_SELLING_COPY,
  getProductSeoSecondaryUsage,
  resolveProductSeoAccordionBadge,
} from "@/lib/seo/product-autofill/ui";
import {
  createDefaultProductSeoStyleProfile,
  sanitizeProductSeoStyleProfile,
} from "@/lib/seo/product-autofill/style-profile";
import {
  AUTHOR_RECOMMENDATIONS_HELPER_COPY,
  AUTHOR_RECOMMENDATIONS_LIMIT_COPY,
  MAX_AUTHOR_RECOMMENDATIONS,
  RELATED_PRODUCT_SEARCH_DEBOUNCE_MS,
  canAddRelatedProductId,
  getRelatedProductPickerMode,
  shouldListDefaultAuthorProducts,
  shouldSearchRelatedProducts,
  type RelatedProductSearchOption,
} from "@/lib/seo/related-product-search";

type SelectOption = { value: string; label: string };

function CharCounter({ value, max }: { value: string; max: number }) {
  return (
    <p className="mt-1 text-right text-xs text-[#7d70a2]">
      {value.length} / {max}
    </p>
  );
}

function moveItem<T>(items: T[], index: number, direction: -1 | 1): T[] {
  const nextIndex = index + direction;
  if (nextIndex < 0 || nextIndex >= items.length) return items;
  const next = [...items];
  [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
  return next;
}

export type AuthorProductSeoSectionProps = {
  title: string;
  subtitle: string;
  description: string;
  productKind: string;
  seoPrimaryQuery: string;
  seoSecondaryQueries: string[];
  seoTitle: string;
  seoDescription: string;
  authorRecommendationsTitle: string;
  seoContent: PracticeSeoContentInput;
  relatedProductOptions: SelectOption[];
  relatedProductSourceId?: string;
  publicPath: string;
  fieldErrors: {
    seoPrimaryQuery?: string;
    seoSecondaryQueries?: string;
    seoTitle?: string;
    seoDescription?: string;
    authorRecommendationsTitle?: string;
  };
  onChange: (
    patch: Partial<{
      seoPrimaryQuery: string;
      seoSecondaryQueries: string[];
      seoTitle: string;
      seoDescription: string;
      authorRecommendationsTitle: string;
      seoContent: PracticeSeoContentInput;
    }>,
  ) => void;
  disabled?: boolean;
};

export default function AuthorProductSeoSection({
  title,
  subtitle,
  description,
  productKind,
  seoPrimaryQuery,
  seoSecondaryQueries,
  seoTitle,
  seoDescription,
  authorRecommendationsTitle,
  seoContent,
  relatedProductOptions,
  relatedProductSourceId,
  publicPath,
  fieldErrors,
  onChange,
  disabled = false,
}: AuthorProductSeoSectionProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [relatedProductQuery, setRelatedProductQuery] = useState("");
  const [searchedRelatedProducts, setSearchedRelatedProducts] =
    useState<RelatedProductSearchOption[]>([]);
  const [defaultAuthorProducts, setDefaultAuthorProducts] = useState<
    RelatedProductSearchOption[]
  >([]);
  const [completedDefaultAuthorSourceId, setCompletedDefaultAuthorSourceId] =
    useState<string | null>(null);
  const [selectedRelatedProducts, setSelectedRelatedProducts] = useState<
    Record<string, SelectOption>
  >({});
  const [completedRelatedProductQuery, setCompletedRelatedProductQuery] =
    useState("");
  const [generateLoading, setGenerateLoading] = useState(false);
  const [generateStage, setGenerateStage] = useState<"text" | null>(null);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [overwriteOpen, setOverwriteOpen] = useState(false);
  const [styleProfile, setStyleProfile] = useState(
    createDefaultProductSeoStyleProfile,
  );
  const [secondaryDraft, setSecondaryDraft] = useState("");
  const [secondaryBulkMessage, setSecondaryBulkMessage] = useState<string | null>(
    null,
  );
  const selectedRelatedIds = useMemo(
    () => seoContent.relatedPracticeIds.filter(Boolean),
    [seoContent.relatedPracticeIds],
  );
  const selectedRelatedLabels = useMemo(() => {
    const next: Record<string, SelectOption> = { ...selectedRelatedProducts };
    for (const option of relatedProductOptions) {
      if (!next[option.value]) {
        next[option.value] = option;
      }
    }
    return next;
  }, [relatedProductOptions, selectedRelatedProducts]);
  const relatedPickerMode = getRelatedProductPickerMode(relatedProductQuery);
  const relatedProductSearching = Boolean(
    relatedProductSourceId && relatedPickerMode === "search",
  );
  const relatedProductListingDefaults = Boolean(
    relatedProductSourceId && relatedPickerMode === "default",
  );
  const relatedRecommendationsFull =
    selectedRelatedIds.length >= MAX_AUTHOR_RECOMMENDATIONS;
  const relatedProductSearchSettled =
    relatedProductSearching &&
    completedRelatedProductQuery === relatedProductQuery;
  const defaultAuthorProductsReady =
    relatedProductListingDefaults &&
    completedDefaultAuthorSourceId === relatedProductSourceId;
  const visibleRelatedProductResults = relatedProductSearching
    ? searchedRelatedProducts
    : relatedProductListingDefaults
      ? defaultAuthorProducts
      : [];
  useEffect(() => {
    if (!relatedProductSourceId || !selectedRelatedIds.length) {
      return;
    }

    const controller = new AbortController();
    const query = new URLSearchParams({
      source: relatedProductSourceId,
      ids: selectedRelatedIds.join(","),
    });
    void fetch(`/api/author/seo/related-product-options?${query}`, {
      signal: controller.signal,
    })
      .then((response) => (response.ok ? response.json() : { options: [] }))
      .then((payload: { options?: SelectOption[] }) => {
        setSelectedRelatedProducts((current) => {
          const next = { ...current };
          for (const option of payload.options ?? []) {
            next[option.value] = option;
          }
          return next;
        });
      })
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          return;
        }
      });

    return () => controller.abort();
  }, [relatedProductSourceId, selectedRelatedIds]);
  useEffect(() => {
    if (
      !relatedProductSourceId ||
      !shouldListDefaultAuthorProducts(relatedProductQuery)
    ) {
      return;
    }

    const controller = new AbortController();
    const query = new URLSearchParams({
      source: relatedProductSourceId,
    });
    void fetch(`/api/author/seo/related-product-options?${query}`, {
      signal: controller.signal,
    })
      .then((response) => (response.ok ? response.json() : { options: [] }))
      .then((payload: { options?: RelatedProductSearchOption[] }) => {
        if (controller.signal.aborted) {
          return;
        }
        setDefaultAuthorProducts(payload.options ?? []);
      })
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setDefaultAuthorProducts([]);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setCompletedDefaultAuthorSourceId(relatedProductSourceId);
        }
      });

    return () => controller.abort();
  }, [relatedProductSourceId, relatedProductQuery]);
  useEffect(() => {
    if (!relatedProductSourceId || !shouldSearchRelatedProducts(relatedProductQuery)) {
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      const query = new URLSearchParams({
        source: relatedProductSourceId,
        q: relatedProductQuery,
      });
      void fetch(`/api/author/seo/related-product-options?${query}`, {
        signal: controller.signal,
      })
        .then((response) => (response.ok ? response.json() : { options: [] }))
        .then((payload: { options?: RelatedProductSearchOption[] }) =>
          setSearchedRelatedProducts(payload.options ?? []),
        )
        .catch((error: unknown) => {
          if (!(error instanceof DOMException && error.name === "AbortError")) {
            setSearchedRelatedProducts([]);
          }
        })
        .finally(() => {
          setCompletedRelatedProductQuery(relatedProductQuery);
        });
    }, RELATED_PRODUCT_SEARCH_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [relatedProductSourceId, relatedProductQuery]);
  const seoInput = {
    title,
    subtitle,
    description,
    productKind,
    seoPrimaryQuery,
    seoSecondaryQueries,
    seoTitle,
    seoDescription,
    seoUsageItems: seoContent.usageItems.map((item) => item.content),
    seoFaqCount: seoContent.faqItems.filter((item) => item.question.trim() && item.answer.trim()).length,
    seoRelatedCount: seoContent.relatedPracticeIds.filter(Boolean).length,
    publicPath,
  };
  const preview = buildProductSeoPreview(seoInput);
  const readiness = evaluateProductSeoReadiness(seoInput);
  const accordionBadge = resolveProductSeoAccordionBadge(readiness, {
    seoPrimaryQuery,
    seoTitle,
    seoDescription,
  });
  const secondariesFull =
    seoSecondaryQueries.length >= PRODUCT_CONTENT_LIMITS.seoSecondaryQueries;
  const secondaryUsage = getProductSeoSecondaryUsage({
    seoSecondaryQueries,
    productDescription: description,
    seoTitle,
    seoDescription,
    usageItems: seoContent.usageItems,
    faqItems: seoContent.faqItems,
    productKind,
  });
  const secondaryUsageByQuery = Object.fromEntries(
    seoSecondaryQueries.map((query) => [
      query,
      secondaryUsage
        .filter((field) => field.queries.includes(query))
        .map((field) => field.label),
    ]),
  );

  function addSecondaryPhrasesFromDraft() {
    const result = parseSeoSecondaryQueryList(secondaryDraft, {
      existing: seoSecondaryQueries,
      primaryQuery: seoPrimaryQuery,
    });
    if (result.added.length > 0) {
      onChange({ seoSecondaryQueries: result.next });
      setSecondaryDraft("");
    }
    setSecondaryBulkMessage(formatSeoSecondaryQueryBulkMessage(result));
  }

  function applyGeneratedDraft(draft: {
    seoSecondaryQueries: string[];
    seoTitle: string;
    seoDescription: string;
    usageItems: Array<{ content: string }>;
    faqItems: Array<{ question: string; answer: string }>;
  }) {
    onChange({
      // The server returns the canonical normalized list, including locked lists.
      seoSecondaryQueries: draft.seoSecondaryQueries,
      seoTitle: draft.seoTitle,
      seoDescription: draft.seoDescription,
      seoContent: {
        ...seoContent,
        usageItems: draft.usageItems,
        faqItems: draft.faqItems,
      },
    });
  }

  async function generateProductSeo() {
    if (generateLoading || disabled) {
      return;
    }

    setGenerateLoading(true);
    setGenerateStage("text");
    setGenerateError(null);
    setOverwriteOpen(false);
    const stageTimer = window.setTimeout(() => {
      setGenerateStage("text");
    }, 1200);

    try {
      const response = await fetch("/api/author/seo/product-autofill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          subtitle,
          description,
          productKind,
          seoPrimaryQuery,
          seoSecondaryQueries,
          usageItems: seoContent.usageItems.map((item) => item.content),
          styleProfile: (() => {
            const sanitized = sanitizeProductSeoStyleProfile(styleProfile);
            return sanitized.ok
              ? sanitized.profile
              : createDefaultProductSeoStyleProfile();
          })(),
        }),
      });
      const payload = (await response.json().catch(() => null)) as
        | {
            seoSecondaryQueries?: string[];
            seoTitle?: string;
            seoDescription?: string;
            usageItems?: Array<{ content: string }>;
            faqItems?: Array<{ question: string; answer: string }>;
            error?: string;
            code?: string;
          }
        | null;

      if (
        !response.ok ||
        !payload ||
        typeof payload.seoTitle !== "string" ||
        typeof payload.seoDescription !== "string" ||
        !Array.isArray(payload.seoSecondaryQueries) ||
        !Array.isArray(payload.usageItems) ||
        !Array.isArray(payload.faqItems)
      ) {
        setGenerateError(
          (payload && typeof payload.error === "string" && payload.error) ||
            PRODUCT_SEO_AI_ERROR_MESSAGE,
        );
        return;
      }

      applyGeneratedDraft({
        seoSecondaryQueries: payload.seoSecondaryQueries,
        seoTitle: payload.seoTitle,
        seoDescription: payload.seoDescription,
        usageItems: payload.usageItems,
        faqItems: payload.faqItems,
      });
    } catch {
      setGenerateError(PRODUCT_SEO_AI_ERROR_MESSAGE);
    } finally {
      window.clearTimeout(stageTimer);
      setGenerateLoading(false);
      setGenerateStage(null);
    }
  }

  function requestGenerateProductSeo() {
    if (generateLoading || disabled) {
      return;
    }

    if (
      hasFilledGeneratedSeoFields({
        seoSecondaryQueries,
        seoTitle,
        seoDescription,
        seoContent,
      })
    ) {
      setOverwriteOpen(true);
      setGenerateError(null);
      return;
    }

    void generateProductSeo();
  }

  return (
    <section className="rounded-[22px] border border-[#e4d7f4] bg-[#fcf8ff] px-4 py-5 sm:px-5">
      <button
        type="button"
        className="flex w-full items-center justify-between text-left text-base font-semibold text-[#2b2140]"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((current) => !current)}
      >
        <span>{isOpen ? "−" : "＋"} {PRODUCT_SEO_ACCORDION_TITLE}</span>
      </button>
      {!isOpen ? (
        <div className="mt-2 space-y-1">
          <p className="text-sm text-[#7d70a2]">
            {PRODUCT_SEO_ACCORDION_BADGE_COPY[accordionBadge]}
          </p>
          {accordionBadge === "recommend" ? (
            <p className="text-sm leading-5 text-[#5c5278]">
              {PRODUCT_SEO_CLOSED_TEASER}
            </p>
          ) : null}
        </div>
      ) : null}

      {isOpen ? <><p className="mt-2 text-sm leading-6 text-[#5c5278]">
        {PRODUCT_SEO_SELLING_COPY}
      </p>

      <label
        className="mt-4 block"
        data-submit-issue={fieldErrors.seoPrimaryQuery ? "" : undefined}
      >
        <span className="mb-2 block text-sm font-medium">
          Основной поисковый запрос
        </span>
        <input
          value={seoPrimaryQuery}
          maxLength={PRODUCT_CONTENT_LIMITS.seoPrimaryQuery}
          disabled={disabled}
          onChange={(event) =>
            onChange({ seoPrimaryQuery: event.target.value })
          }
          className="w-full rounded-[18px] border border-[#e4d7f4] bg-white px-4 py-3 outline-none focus:border-[#9a74d8] disabled:cursor-not-allowed disabled:opacity-60"
          placeholder="Например: медитация для сна"
        />
        <p className="mt-2 text-sm leading-5 text-[#7d70a2]">
          Одна главная фраза, по которой человек может искать именно такой
          продукт. Поле можно оставить пустым.
        </p>
        {!seoPrimaryQuery.trim() && title.trim() ? (
          <button
            type="button"
            disabled={disabled}
            onClick={() => onChange({ seoPrimaryQuery: title.trim() })}
            className="mt-2 text-sm font-medium text-[#7042c5] disabled:cursor-not-allowed disabled:opacity-60"
          >
            Использовать название продукта
          </button>
        ) : null}
        <CharCounter
          value={seoPrimaryQuery}
          max={PRODUCT_CONTENT_LIMITS.seoPrimaryQuery}
        />
        {fieldErrors.seoPrimaryQuery ? (
          <p className="mt-2 text-sm text-[#9b3d3d]">
            {fieldErrors.seoPrimaryQuery}
          </p>
        ) : null}
      </label>

      <div className="mt-4">
        <span className="mb-2 block text-sm font-medium">Дополнительные поисковые фразы</span>
        <div className="flex flex-wrap gap-2">
          {seoSecondaryQueries.map((query, index) => (
            <div key={`${query}-${index}`} className="inline-flex items-center gap-1">
              <span className="inline-flex items-center gap-1 rounded-full bg-[#f0e7fb] px-3 py-1 text-sm text-[#4d336f]">
                {query}
                <button
                  type="button"
                  aria-label={`Удалить фразу ${query}`}
                  disabled={disabled}
                  onClick={() => onChange({ seoSecondaryQueries: seoSecondaryQueries.filter((_, itemIndex) => itemIndex !== index) })}
                >
                  ×
                </button>
              </span>
              {secondaryUsageByQuery[query]?.map((label) => (
                <span
                  key={`${query}-${label}`}
                  className="rounded-full bg-[#f0e7fb] px-2 py-1 text-xs text-[#4d336f]"
                >
                  {label}
                </span>
              ))}
            </div>
          ))}
        </div>
        {secondariesFull ? null : (
          <div className="mt-2">
            <textarea
              aria-label="Введите дополнительные фразы"
              disabled={disabled}
              value={secondaryDraft}
              onChange={(event) => {
                setSecondaryDraft(event.target.value);
                setSecondaryBulkMessage(null);
              }}
              rows={3}
              className="w-full rounded-[18px] border border-[#e4d7f4] bg-white px-4 py-3 outline-none focus:border-[#9a74d8] disabled:cursor-not-allowed disabled:opacity-60"
              placeholder="Введите одну или несколько фраз через запятую или с новой строки"
            />
            <button
              type="button"
              disabled={disabled}
              onClick={addSecondaryPhrasesFromDraft}
              className="mt-2 rounded-full bg-[#7042c5] px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              Добавить фразы
            </button>
          </div>
        )}
        {secondaryBulkMessage ? (
          <p className="mt-2 text-sm leading-5 text-[#7d70a2]">
            {secondaryBulkMessage}
          </p>
        ) : null}
        <p className="mt-2 text-sm leading-5 text-[#7d70a2]">
          Добавьте несколько близких вариантов основного запроса. Они должны
          описывать тот же продукт и ту же потребность человека.
        </p>
        {secondariesFull ? (
          <p className="mt-2 text-sm leading-5 text-[#7d70a2]">
            Можно добавить не больше 10 фраз. Удалите одну, чтобы добавить другую.
          </p>
        ) : null}
        {fieldErrors.seoSecondaryQueries ? <p className="mt-2 text-sm text-[#9b3d3d]">{fieldErrors.seoSecondaryQueries}</p> : null}
      </div>

      <div className="mt-4 rounded-[18px] border border-[#e4d7f4] bg-white px-4 py-4">
        <AuthorProductSeoStyleControls
          profile={styleProfile}
          onChange={setStyleProfile}
          disabled={disabled}
        />
        <button
          type="button"
          disabled={disabled || generateLoading}
          onClick={requestGenerateProductSeo}
          className="mt-3 rounded-full bg-[#7042c5] px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          {generateLoading
            ? generateStage === "text"
              ? PRODUCT_SEO_GENERATE_STAGE_TEXT
              : PRODUCT_SEO_GENERATE_LOADING
            : PRODUCT_SEO_GENERATE_CTA}
        </button>
        {overwriteOpen ? (
          <div className="mt-3 rounded-[14px] border border-[#ead48a] bg-[#fff8e6] px-3 py-3">
            <p className="text-sm leading-5 text-[#5c5278]">
              {seoSecondaryQueries.length > 0
                ? PRODUCT_SEO_OVERWRITE_LOCKED_CONFIRM
                : PRODUCT_SEO_OVERWRITE_CONFIRM}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={disabled || generateLoading}
                onClick={() => {
                  void generateProductSeo();
                }}
                className="rounded-full bg-[#7042c5] px-3 py-1.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                {PRODUCT_SEO_OVERWRITE_REPLACE}
              </button>
              <button
                type="button"
                disabled={generateLoading}
                onClick={() => setOverwriteOpen(false)}
                className="rounded-full border border-[#d4c4ee] bg-white px-3 py-1.5 text-sm text-[#4d336f]"
              >
                {PRODUCT_SEO_OVERWRITE_CANCEL}
              </button>
            </div>
          </div>
        ) : null}
        {generateError ? (
          <p className="mt-3 text-sm text-[#9b3d3d]">{generateError}</p>
        ) : null}
      </div>

      <p className="mt-4 text-sm font-medium text-[#2b2140]">
        SEO-готовность: {readiness.doneCount} из {readiness.total}
      </p>
      <p className="mt-1 text-sm leading-5 text-[#7d70a2]">
        {PRODUCT_SEO_READINESS_HINT}
      </p>
      <ul className="mt-2 space-y-1.5 text-sm leading-5 text-[#5c5278]">
        {readiness.checks.map((check) => (
          <li key={check.id}>
            {check.done ? "✓" : "○"} {check.label}
          </li>
        ))}
      </ul>

      <label
        className="mt-4 block"
        data-submit-issue={fieldErrors.seoTitle ? "" : undefined}
      >
        <span className="mb-2 block text-sm font-medium">
          Заголовок для поиска
        </span>
        <input
          value={seoTitle}
          maxLength={PRODUCT_CONTENT_LIMITS.seoTitle}
          disabled={disabled}
          onChange={(event) => onChange({ seoTitle: event.target.value })}
          className="w-full rounded-[18px] border border-[#e4d7f4] bg-white px-4 py-3 outline-none focus:border-[#9a74d8] disabled:cursor-not-allowed disabled:opacity-60"
          placeholder={preview.title}
        />
        <p className="mt-2 text-sm leading-5 text-[#7d70a2]">
          Поле необязательное. Напишите понятный заголовок результата поиска.
          Основной запрос желательно использовать один раз и ближе к началу.
          Не перечисляйте ключевые фразы через | или запятые.
        </p>
        <p className="mt-1 text-sm leading-5 text-[#7d70a2]">
          Например: Медитация для сна – расслабление перед сном
        </p>
        <p className="mt-1 text-sm leading-5 text-[#7d70a2]">
          Ориентир: около 50–70 символов. Это рекомендация, а не обязательный лимит.
        </p>
        <CharCounter value={seoTitle} max={PRODUCT_CONTENT_LIMITS.seoTitle} />
        {fieldErrors.seoTitle ? (
          <p className="mt-2 text-sm text-[#9b3d3d]">{fieldErrors.seoTitle}</p>
        ) : null}
      </label>

      <label
        className="mt-4 block"
        data-submit-issue={fieldErrors.seoDescription ? "" : undefined}
      >
        <span className="mb-2 block text-sm font-medium">
          Описание для поиска
        </span>
        <textarea
          value={seoDescription}
          maxLength={PRODUCT_CONTENT_LIMITS.seoDescription}
          disabled={disabled}
          onChange={(event) =>
            onChange({ seoDescription: event.target.value })
          }
          rows={4}
          className="w-full rounded-[18px] border border-[#e4d7f4] bg-white px-4 py-3 outline-none focus:border-[#9a74d8] disabled:cursor-not-allowed disabled:opacity-60"
        />
        <p className="mt-2 text-sm leading-5 text-[#7d70a2]">
          Коротко ответьте: что это за продукт, для кого он и что получит
          слушатель. Основной запрос можно естественно использовать один раз.
        </p>
        <p className="mt-1 text-sm leading-5 text-[#7d70a2]">
          Ориентир: 120–180 символов.
        </p>
        <p className="mt-1 text-sm leading-5 text-[#7d70a2]">
          Яндекс может изменить заголовок и описание в результатах поиска.
        </p>
        <CharCounter
          value={seoDescription}
          max={PRODUCT_CONTENT_LIMITS.seoDescription}
        />
        {fieldErrors.seoDescription ? (
          <p className="mt-2 text-sm text-[#9b3d3d]">
            {fieldErrors.seoDescription}
          </p>
        ) : null}
      </label>

      <div className="mt-5 border-t border-[#e4d7f4] pt-5">
        <p className="text-sm font-medium">{getPracticeSeoUsageHeading(productKind)}</p>
        <p className="mt-2 text-sm leading-5 text-[#7d70a2]">
          Добавьте 3–5 конкретных ситуаций, когда человеку может пригодиться
          этот продукт.
        </p>
        <p className="mt-1 text-sm leading-5 text-[#7d70a2]">
          Например: Перед сном, после напряжённого дня, во время вечернего отдыха.
        </p>
        {seoContent.usageItems.map((item, index) => (
          <div className="mt-2 flex gap-2" key={`usage-${index}`}>
            <input
              value={item.content}
              maxLength={PRODUCT_CONTENT_LIMITS.seoUsageItem}
              disabled={disabled}
              onChange={(event) => onChange({ seoContent: { ...seoContent, usageItems: seoContent.usageItems.map((current, itemIndex) => itemIndex === index ? { content: event.target.value } : current) } })}
              className="min-w-0 flex-1 rounded-[14px] border border-[#e4d7f4] bg-white px-3 py-2"
            />
            <button type="button" disabled={disabled || index === 0} onClick={() => onChange({ seoContent: { ...seoContent, usageItems: moveItem(seoContent.usageItems, index, -1) } })}>↑</button>
            <button type="button" disabled={disabled || index === seoContent.usageItems.length - 1} onClick={() => onChange({ seoContent: { ...seoContent, usageItems: moveItem(seoContent.usageItems, index, 1) } })}>↓</button>
            <button type="button" disabled={disabled} onClick={() => onChange({ seoContent: { ...seoContent, usageItems: seoContent.usageItems.filter((_, itemIndex) => itemIndex !== index) } })}>Удалить</button>
          </div>
        ))}
        {seoContent.usageItems.length < PRODUCT_CONTENT_LIMITS.seoUsageItems ? <button type="button" disabled={disabled} className="mt-2 text-sm text-[#7042c5]" onClick={() => onChange({ seoContent: { ...seoContent, usageItems: [...seoContent.usageItems, { content: "" }] } })}>+ Добавить пункт</button> : null}
      </div>

      <div className="mt-5 border-t border-[#e4d7f4] pt-5">
        <p className="text-sm font-medium">Вопросы и ответы</p>
        <p className="mt-2 text-sm leading-5 text-[#7d70a2]">
          Добавьте реальные вопросы, которые человек может задать перед
          прослушиванием или покупкой. Обычно достаточно 3–5.
        </p>
        <p className="mt-1 text-sm leading-5 text-[#7d70a2]">
          Например: «Когда лучше слушать?» «Нужен ли опыт?» «Можно ли слушать в
          наушниках?»
        </p>
        {seoContent.faqItems.map((item, index) => (
          <div className="mt-2 grid gap-2" key={`faq-${index}`}>
            <input value={item.question} disabled={disabled} placeholder="Вопрос" maxLength={PRODUCT_CONTENT_LIMITS.seoFaqQuestion} onChange={(event) => onChange({ seoContent: { ...seoContent, faqItems: seoContent.faqItems.map((current, itemIndex) => itemIndex === index ? { ...current, question: event.target.value } : current) } })} className="rounded-[14px] border border-[#e4d7f4] bg-white px-3 py-2" />
            <textarea value={item.answer} disabled={disabled} placeholder="Ответ" maxLength={PRODUCT_CONTENT_LIMITS.seoFaqAnswer} rows={3} onChange={(event) => onChange({ seoContent: { ...seoContent, faqItems: seoContent.faqItems.map((current, itemIndex) => itemIndex === index ? { ...current, answer: event.target.value } : current) } })} className="rounded-[14px] border border-[#e4d7f4] bg-white px-3 py-2" />
            <div className="flex gap-2"><button type="button" disabled={disabled || index === 0} onClick={() => onChange({ seoContent: { ...seoContent, faqItems: moveItem(seoContent.faqItems, index, -1) } })}>↑</button><button type="button" disabled={disabled || index === seoContent.faqItems.length - 1} onClick={() => onChange({ seoContent: { ...seoContent, faqItems: moveItem(seoContent.faqItems, index, 1) } })}>↓</button></div>
            <button type="button" disabled={disabled} className="justify-self-start text-sm text-[#7042c5]" onClick={() => onChange({ seoContent: { ...seoContent, faqItems: seoContent.faqItems.filter((_, itemIndex) => itemIndex !== index) } })}>Удалить</button>
          </div>
        ))}
        {seoContent.faqItems.length < PRODUCT_CONTENT_LIMITS.seoFaqItems ? <button type="button" disabled={disabled} className="mt-2 text-sm text-[#7042c5]" onClick={() => onChange({ seoContent: { ...seoContent, faqItems: [...seoContent.faqItems, { question: "", answer: "" }] } })}>{PRODUCT_SEO_ADD_OWN_FAQ}</button> : null}
      </div>

      <div className="mt-5 border-t border-[#e4d7f4] pt-5">
        <p className="text-sm font-medium">Рекомендации автора</p>
        <p className="mt-2 text-sm leading-5 text-[#7d70a2]">
          {AUTHOR_RECOMMENDATIONS_HELPER_COPY}
        </p>
        <label className="mt-3 block" htmlFor="author-recommendations-title">
          <span className="text-sm font-medium">Заголовок блока</span>
          <input
            id="author-recommendations-title"
            value={authorRecommendationsTitle}
            maxLength={PRODUCT_CONTENT_LIMITS.authorRecommendationsTitle}
            disabled={disabled}
            placeholder="Рекомендации автора"
            onChange={(event) =>
              onChange({ authorRecommendationsTitle: event.target.value })
            }
            className="mt-2 w-full rounded-[14px] border border-[#e4d7f4] bg-white px-3 py-2"
          />
          <p className="mt-2 text-sm leading-5 text-[#7d70a2]">
            Можно оставить стандартный заголовок или написать свой – например
            „Послушайте ещё“ или „Ещё про сон“.
          </p>
          <CharCounter
            value={authorRecommendationsTitle}
            max={PRODUCT_CONTENT_LIMITS.authorRecommendationsTitle}
          />
          {fieldErrors.authorRecommendationsTitle ? (
            <p className="mt-2 text-sm text-[#9b3d3d]">
              {fieldErrors.authorRecommendationsTitle}
            </p>
          ) : null}
        </label>
        <label className="mt-3 block" htmlFor="related-product-search">
          <span className="text-sm font-medium">Найти продукт</span>
          <input
            id="related-product-search"
            aria-label="Найти продукт"
            aria-controls="related-product-search-results"
            aria-busy={relatedProductSearching && !relatedProductSearchSettled}
            value={relatedProductQuery}
            disabled={disabled || !relatedProductSourceId}
            onChange={(event) => setRelatedProductQuery(event.target.value)}
            className="mt-2 w-full rounded-[14px] border border-[#e4d7f4] bg-white px-3 py-2"
            placeholder={relatedProductSourceId ? "Введите название или слово из названия" : "Сначала сохраните продукт"}
          />
        </label>
        <div id="related-product-search-results" role="status">
        {!relatedProductSourceId ? (
          <p className="mt-2 text-sm leading-5 text-[#7d70a2]">Сначала сохраните продукт</p>
        ) : relatedPickerMode === "hint" ? (
          <p className="mt-2 text-sm leading-5 text-[#7d70a2]">Начните вводить название</p>
        ) : relatedProductSearching && !relatedProductSearchSettled ? (
          <p className="mt-2 text-sm leading-5 text-[#7d70a2]">Ищем…</p>
        ) : relatedProductListingDefaults && !defaultAuthorProductsReady ? (
          <p className="mt-2 text-sm leading-5 text-[#7d70a2]">Загружаем…</p>
        ) : null}
        {visibleRelatedProductResults.length ? (
          <ul className="mt-2 max-h-64 space-y-1 overflow-y-auto">
            {visibleRelatedProductResults.map((option) => {
              const alreadySelected = selectedRelatedIds.includes(option.value);
              const addDisabled =
                disabled || alreadySelected || relatedRecommendationsFull;
              return (
                <li key={option.value}>
                  <button
                    type="button"
                    disabled={addDisabled}
                    aria-label={
                      alreadySelected
                        ? `«${option.label}» уже добавлен`
                        : relatedRecommendationsFull
                          ? AUTHOR_RECOMMENDATIONS_LIMIT_COPY
                          : `Добавить «${option.label}»`
                    }
                    className="flex w-full min-w-0 items-center gap-3 rounded-[14px] border border-[#eadff8] bg-white px-3 py-2 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5] disabled:cursor-not-allowed disabled:opacity-60"
                    onClick={() => {
                      const result = canAddRelatedProductId(
                        option.value,
                        seoContent.relatedPracticeIds,
                        MAX_AUTHOR_RECOMMENDATIONS,
                      );
                      if (!result.ok) {
                        return;
                      }
                      setSelectedRelatedProducts((current) => ({
                        ...current,
                        [option.value]: option,
                      }));
                      onChange({
                        seoContent: {
                          ...seoContent,
                          relatedPracticeIds: result.next,
                        },
                      });
                    }}
                  >
                    <div className="h-12 w-12 shrink-0 overflow-hidden rounded-[10px]" aria-hidden="true">
                      <ProductCoverThumbnail
                        slug={option.value}
                        title={option.label}
                        coverUrl={option.coverUrl}
                        authorName={option.authorName}
                        format={option.formatLabel}
                        displayWidth={48}
                        className="h-full w-full rounded-[10px]"
                      />
                    </div>
                    <span className="min-w-0 flex-1">
                      {option.formatLabel ? (
                        <span className={`block ${PRODUCT_FORMAT_LINE_CLASS}`}>{option.formatLabel}</span>
                      ) : null}
                      <span className="block text-sm font-medium text-[#2b2140]">{option.label}</span>
                      {option.authorName ? (
                        <span className="mt-0.5 block truncate text-xs text-[#5c4f82]">{option.authorName}</span>
                      ) : null}
                    </span>
                    {alreadySelected ? (
                      <span className="shrink-0 text-xs font-medium text-[#7d70a2]">Добавлено</span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        ) : relatedProductSearchSettled && !visibleRelatedProductResults.length ? (
          <p className="mt-2 text-sm leading-5 text-[#7d70a2]">Ничего не найдено</p>
        ) : relatedProductListingDefaults &&
          defaultAuthorProductsReady &&
          !visibleRelatedProductResults.length ? (
          <p className="mt-2 text-sm leading-5 text-[#7d70a2]">Пока нет других опубликованных продуктов</p>
        ) : null}
        {relatedRecommendationsFull ? (
          <p className="mt-2 text-sm leading-5 text-[#7d70a2]">
            {AUTHOR_RECOMMENDATIONS_LIMIT_COPY}
          </p>
        ) : null}
        </div>
        {selectedRelatedIds.map((id, index) => (
          <div className="mt-2 flex min-w-0 items-center gap-2" key={`product-${id}`}>
            <p className="min-w-0 flex-1 rounded-[14px] border border-[#e4d7f4] bg-[#fbf8ff] px-3 py-2 text-sm text-[#2b2140]">
              {selectedRelatedLabels[id]?.label ?? "Выбранный продукт"}
            </p>
            <button type="button" disabled={disabled || index === 0} onClick={() => onChange({ seoContent: { ...seoContent, relatedPracticeIds: moveItem(selectedRelatedIds, index, -1) } })}>↑</button>
            <button type="button" disabled={disabled || index === selectedRelatedIds.length - 1} onClick={() => onChange({ seoContent: { ...seoContent, relatedPracticeIds: moveItem(selectedRelatedIds, index, 1) } })}>↓</button>
            <button type="button" disabled={disabled} onClick={() => onChange({ seoContent: { ...seoContent, relatedPracticeIds: selectedRelatedIds.filter((current) => current !== id) } })}>Удалить</button>
          </div>
        ))}
      </div>

      <div className="mt-5 rounded-[18px] border border-[#e4d7f4] bg-white px-4 py-4">
        <p className="text-sm font-medium leading-6 text-[#1a0dab]">
          {preview.title}
        </p>
        <p className="mt-1 text-sm text-[#006621]">{preview.displayUrl}</p>
        <p className="mt-2 text-sm leading-6 text-[#4d5156]">
          {preview.description}
        </p>
      </div>
      <p className="mt-2 text-xs leading-5 text-[#7d70a2]">
        Яндекс может изменить заголовок и описание в результатах поиска.
      </p>
      </> : null}
    </section>
  );
}
