"use client";

import { useEffect, useState } from "react";

import AuthorProductSeoWordstatPicker from "@/components/author-dashboard/AuthorProductSeoWordstatPicker";
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
  canAddSecondaryQuery,
  clipSeoQuery,
  getWordstatPrimaryCtaLabel,
  resolveWordstatSeed,
} from "@/lib/seo/wordstat/ui";
import { WORDSTAT_ERROR_MESSAGES } from "@/lib/seo/wordstat/errors";
import type { WordstatSuggestionsPayload } from "@/lib/seo/wordstat/types";
import { PRODUCT_SEO_AI_ERROR_MESSAGE } from "@/lib/seo/product-autofill/errors";
import {
  hasFilledGeneratedSeoFields,
  PRODUCT_SEO_ACCORDION_BADGE_COPY,
  PRODUCT_SEO_ACCORDION_TITLE,
  PRODUCT_SEO_ADD_OWN_FAQ,
  PRODUCT_SEO_AFTER_PRIMARY_COPY,
  PRODUCT_SEO_CLOSED_TEASER,
  PRODUCT_SEO_GENERATE_CTA,
  PRODUCT_SEO_GENERATE_LOADING,
  PRODUCT_SEO_GENERATE_STAGE_QUERIES,
  PRODUCT_SEO_GENERATE_STAGE_TEXT,
  PRODUCT_SEO_OVERWRITE_CANCEL,
  PRODUCT_SEO_OVERWRITE_CONFIRM,
  PRODUCT_SEO_OVERWRITE_REPLACE,
  PRODUCT_SEO_PICK_PRIMARY_CTA,
  PRODUCT_SEO_READINESS_HINT,
  PRODUCT_SEO_SELLING_COPY,
  PRODUCT_SEO_START_HEADING,
  PRODUCT_SEO_START_TEXT,
  productSeoPrimarySelectedLabel,
  resolveProductSeoAccordionBadge,
  suggestPrimaryQuerySeeds,
} from "@/lib/seo/product-autofill/ui";

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
  seoAbout: string;
  seoContent: PracticeSeoContentInput;
  relatedProductOptions: SelectOption[];
  relatedProductSourceId?: string;
  publicPath: string;
  fieldErrors: {
    seoPrimaryQuery?: string;
    seoSecondaryQueries?: string;
    seoTitle?: string;
    seoDescription?: string;
    seoAbout?: string;
  };
  onChange: (
    patch: Partial<{
      seoPrimaryQuery: string;
      seoSecondaryQueries: string[];
      seoTitle: string;
      seoDescription: string;
      seoAbout: string;
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
  seoAbout,
  seoContent,
  relatedProductOptions,
  relatedProductSourceId,
  publicPath,
  fieldErrors,
  onChange,
  disabled = false,
}: AuthorProductSeoSectionProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [listenOptions, setListenOptions] = useState<SelectOption[]>([]);
  const [relatedProductQuery, setRelatedProductQuery] = useState("");
  const [searchedRelatedProducts, setSearchedRelatedProducts] =
    useState<SelectOption[]>([]);
  const [wordstatOpen, setWordstatOpen] = useState(false);
  const [wordstatSeed, setWordstatSeed] = useState("");
  const [wordstatLoading, setWordstatLoading] = useState(false);
  const [wordstatError, setWordstatError] = useState<string | null>(null);
  const [wordstatResult, setWordstatResult] =
    useState<WordstatSuggestionsPayload | null>(null);
  const [generateLoading, setGenerateLoading] = useState(false);
  const [generateStage, setGenerateStage] = useState<
    "queries" | "text" | null
  >(null);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [overwriteOpen, setOverwriteOpen] = useState(false);
  const displayedRelatedProducts = relatedProductSourceId
    ? searchedRelatedProducts
    : relatedProductOptions;
  useEffect(() => {
    void fetch("/api/author/seo/listen-options")
      .then((response) => response.ok ? response.json() : { options: [] })
      .then((payload: { options?: SelectOption[] }) => setListenOptions(payload.options ?? []))
      .catch(() => setListenOptions([]));
  }, []);
  useEffect(() => {
    if (!relatedProductSourceId) {
      return;
    }

    const controller = new AbortController();
    const query = new URLSearchParams({
      source: relatedProductSourceId,
      q: relatedProductQuery,
    });
    void fetch(`/api/author/seo/related-product-options?${query}`, {
      signal: controller.signal,
    })
      .then((response) => response.ok ? response.json() : { options: [] })
      .then((payload: { options?: SelectOption[] }) =>
        setSearchedRelatedProducts(payload.options ?? []),
      )
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setSearchedRelatedProducts([]);
        }
      });

    return () => controller.abort();
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
    seoAbout,
    seoUsageItems: seoContent.usageItems.map((item) => item.content),
    seoFaqCount: seoContent.faqItems.filter((item) => item.question.trim() && item.answer.trim()).length,
    seoRelatedCount: seoContent.relatedPracticeIds.filter(Boolean).length + seoContent.relatedListenSlugs.filter(Boolean).length,
    publicPath,
  };
  const preview = buildProductSeoPreview(seoInput);
  const readiness = evaluateProductSeoReadiness(seoInput);
  const accordionBadge = resolveProductSeoAccordionBadge(readiness, {
    seoPrimaryQuery,
    seoTitle,
    seoDescription,
    seoAbout,
  });
  const primarySelected = Boolean(seoPrimaryQuery.trim());
  const primarySeeds = primarySelected
    ? []
    : suggestPrimaryQuerySeeds({
        title,
        subtitle,
        description,
        productKind,
      });
  const secondariesFull =
    seoSecondaryQueries.length >= PRODUCT_CONTENT_LIMITS.seoSecondaryQueries;

  function openWordstatPicker(seedOverride?: string) {
    setWordstatOpen(true);
    setWordstatError(null);
    setWordstatSeed(
      seedOverride?.trim() ||
        resolveWordstatSeed({ seoPrimaryQuery, title }),
    );
  }

  function addSecondaryPhrase(phrase: string) {
    const result = canAddSecondaryQuery(phrase, seoSecondaryQueries);
    if (!result.ok) {
      return;
    }

    onChange({ seoSecondaryQueries: result.next });
  }

  function applyGeneratedDraft(draft: {
    seoSecondaryQueries: string[];
    seoTitle: string;
    seoDescription: string;
    seoAbout: string;
    usageItems: Array<{ content: string }>;
    faqItems: Array<{ question: string; answer: string }>;
  }) {
    onChange({
      seoSecondaryQueries: draft.seoSecondaryQueries,
      seoTitle: draft.seoTitle,
      seoDescription: draft.seoDescription,
      seoAbout: draft.seoAbout,
      seoContent: {
        ...seoContent,
        usageItems: draft.usageItems,
        faqItems: draft.faqItems,
      },
    });
  }

  async function generateProductSeo() {
    if (generateLoading || disabled || !primarySelected) {
      return;
    }

    setGenerateLoading(true);
    setGenerateStage("queries");
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
          usageItems: seoContent.usageItems.map((item) => item.content),
        }),
      });
      const payload = (await response.json().catch(() => null)) as
        | {
            seoSecondaryQueries?: string[];
            seoTitle?: string;
            seoDescription?: string;
            seoAbout?: string;
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
        typeof payload.seoAbout !== "string" ||
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
        seoAbout: payload.seoAbout,
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
    if (generateLoading || disabled || !primarySelected) {
      return;
    }

    if (
      hasFilledGeneratedSeoFields({
        seoSecondaryQueries,
        seoTitle,
        seoDescription,
        seoAbout,
        seoContent,
      })
    ) {
      setOverwriteOpen(true);
      setGenerateError(null);
      return;
    }

    void generateProductSeo();
  }

  async function submitWordstat() {
    if (wordstatLoading) {
      return;
    }

    setWordstatLoading(true);
    setWordstatError(null);

    try {
      const response = await fetch("/api/author/seo/wordstat/suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phrase: wordstatSeed }),
      });
      const payload = (await response.json().catch(() => null)) as
        | WordstatSuggestionsPayload
        | { error?: string; code?: string }
        | null;

      if (!response.ok || !payload || !("suggestions" in payload)) {
        const code = payload && "code" in payload ? payload.code : null;
        setWordstatResult(null);
        setWordstatError(
          (payload && "error" in payload && typeof payload.error === "string"
            ? payload.error
            : null) ||
            (code === "RATE_LIMITED"
              ? WORDSTAT_ERROR_MESSAGES.RATE_LIMITED
              : WORDSTAT_ERROR_MESSAGES.UPSTREAM_ERROR),
        );
        return;
      }

      setWordstatResult(payload);
      if (payload.suggestions.length === 0) {
        setWordstatError(WORDSTAT_ERROR_MESSAGES.NO_RESULTS);
      }
    } catch {
      setWordstatResult(null);
      setWordstatError(WORDSTAT_ERROR_MESSAGES.UPSTREAM_ERROR);
    } finally {
      setWordstatLoading(false);
    }
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

      {!primarySelected ? (
        <div className="mt-4 rounded-[18px] border border-[#e4d7f4] bg-white px-4 py-4">
          <p className="text-sm leading-6 text-[#5c5278]">{PRODUCT_SEO_CLOSED_TEASER}</p>
          <p className="mt-3 text-sm font-medium text-[#2b2140]">
            {PRODUCT_SEO_START_HEADING}
          </p>
          <p className="mt-2 text-sm leading-6 text-[#5c5278]">
            {PRODUCT_SEO_START_TEXT}
          </p>
          <button
            type="button"
            disabled={disabled}
            onClick={() => openWordstatPicker()}
            className="mt-3 rounded-full bg-[#7042c5] px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {PRODUCT_SEO_PICK_PRIMARY_CTA}
          </button>
          {primarySeeds.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {primarySeeds.map((seed) => (
                <button
                  key={seed}
                  type="button"
                  disabled={disabled}
                  onClick={() => openWordstatPicker(seed)}
                  className="rounded-full border border-[#d4c4ee] bg-white px-3 py-1.5 text-sm text-[#4d336f] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {seed}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : (
        <div className="mt-4 rounded-[18px] border border-[#e4d7f4] bg-white px-4 py-4">
          <p className="text-sm leading-6 text-[#5c5278]">
            {PRODUCT_SEO_AFTER_PRIMARY_COPY}
          </p>
          <p className="mt-2 text-sm font-medium text-[#2b2140]">
            {productSeoPrimarySelectedLabel(seoPrimaryQuery)}
          </p>
          <button
            type="button"
            disabled={disabled || generateLoading}
            onClick={requestGenerateProductSeo}
            className="mt-3 rounded-full bg-[#7042c5] px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {generateLoading
              ? generateStage === "queries"
                ? PRODUCT_SEO_GENERATE_STAGE_QUERIES
                : generateStage === "text"
                  ? PRODUCT_SEO_GENERATE_STAGE_TEXT
                  : PRODUCT_SEO_GENERATE_LOADING
              : PRODUCT_SEO_GENERATE_CTA}
          </button>
          {overwriteOpen ? (
            <div className="mt-3 rounded-[14px] border border-[#ead48a] bg-[#fff8e6] px-3 py-3">
              <p className="text-sm leading-5 text-[#5c5278]">
                {PRODUCT_SEO_OVERWRITE_CONFIRM}
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
      )}

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
        className="mt-5 block"
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
          продукт. Можно написать её самостоятельно или подобрать по данным
          Яндекса.
        </p>
        <button
          type="button"
          disabled={disabled}
          onClick={() => openWordstatPicker()}
          className="mt-2 text-sm text-[#7042c5] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {getWordstatPrimaryCtaLabel(seoPrimaryQuery)}
        </button>
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

      {wordstatOpen ? (
        <AuthorProductSeoWordstatPicker
          seed={wordstatSeed}
          onSeedChange={setWordstatSeed}
          loading={wordstatLoading}
          error={wordstatError}
          result={wordstatResult}
          seoPrimaryQuery={seoPrimaryQuery}
          seoSecondaryQueries={seoSecondaryQueries}
          disabled={disabled}
          onSubmit={() => {
            void submitWordstat();
          }}
          onSelectPrimary={(phrase) =>
            onChange({
              seoPrimaryQuery: clipSeoQuery(
                phrase,
                PRODUCT_CONTENT_LIMITS.seoPrimaryQuery,
              ),
            })
          }
          onAddSecondary={addSecondaryPhrase}
        />
      ) : null}

      <div className="mt-4">
        <span className="mb-2 block text-sm font-medium">Дополнительные поисковые фразы</span>
        <div className="flex flex-wrap gap-2">
          {seoSecondaryQueries.map((query, index) => (
            <span key={`${query}-${index}`} className="inline-flex items-center gap-1 rounded-full bg-[#f0e7fb] px-3 py-1 text-sm text-[#4d336f]">
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
          ))}
        </div>
        {secondariesFull ? null : (
          <input
            aria-label="Новая дополнительная поисковая фраза"
            disabled={disabled}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              event.preventDefault();
              const value = event.currentTarget.value.trim();
              const result = canAddSecondaryQuery(value, seoSecondaryQueries);
              if (!result.ok) return;
              onChange({ seoSecondaryQueries: result.next });
              event.currentTarget.value = "";
            }}
            className="mt-2 w-full rounded-[18px] border border-[#e4d7f4] bg-white px-4 py-3 outline-none focus:border-[#9a74d8] disabled:cursor-not-allowed disabled:opacity-60"
            placeholder="Введите фразу и нажмите Enter"
          />
        )}
        <button
          type="button"
          disabled={disabled}
          onClick={() =>
            openWordstatPicker(seoPrimaryQuery.trim() || undefined)
          }
          className="mt-2 text-sm text-[#7042c5] disabled:cursor-not-allowed disabled:opacity-60"
        >
          Подобрать похожие
        </button>
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
          Напишите понятный заголовок результата поиска. Основной запрос
          желательно использовать один раз и ближе к началу. Не перечисляйте
          ключевые фразы через | или запятые.
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

      <label className="mt-4 block" data-submit-issue={fieldErrors.seoAbout ? "" : undefined}>
        <span className="mb-2 block text-sm font-medium">О продукте</span>
        <textarea
          value={seoAbout}
          maxLength={PRODUCT_CONTENT_LIMITS.seoAbout}
          disabled={disabled}
          onChange={(event) => onChange({ seoAbout: event.target.value })}
          rows={6}
          className="w-full rounded-[18px] border border-[#e4d7f4] bg-white px-4 py-3 outline-none focus:border-[#9a74d8] disabled:cursor-not-allowed disabled:opacity-60"
        />
        <p className="mt-2 text-sm leading-5 text-[#7d70a2]">
          Дополнительный публичный текст для страницы продукта. Расскажите в 2–4
          небольших абзацах: что это за продукт, для какой ситуации он создан,
          что происходит во время прослушивания и чем он полезен.
        </p>
        <p className="mt-1 text-sm leading-5 text-[#7d70a2]">
          Не копируйте дословно основное описание. Используйте поисковые фразы
          только там, где они звучат естественно.
        </p>
        <p className="mt-1 text-sm leading-5 text-[#7d70a2]">
          Ориентир: 500–1500 символов.
        </p>
        {fieldErrors.seoAbout ? <p className="mt-2 text-sm text-[#9b3d3d]">{fieldErrors.seoAbout}</p> : null}
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
        <p className="text-sm font-medium">Связанные продукты</p>
        <p className="mt-2 text-sm leading-5 text-[#7d70a2]">
          Выберите 2–4 продукта, которые действительно связаны с этой темой и
          могут быть полезны слушателю дальше.
        </p>
        <input
          aria-label="Поиск связанных продуктов"
          value={relatedProductQuery}
          disabled={disabled || !relatedProductSourceId}
          onChange={(event) => setRelatedProductQuery(event.target.value)}
          className="mt-2 w-full rounded-[14px] border border-[#e4d7f4] bg-white px-3 py-2"
          placeholder={relatedProductSourceId ? "Поиск по названию" : "Сначала сохраните продукт"}
        />
        {seoContent.relatedPracticeIds.map((id, index) => (
          <div className="mt-2 flex gap-2" key={`product-${index}`}>
            <select value={id} disabled={disabled} onChange={(event) => onChange({ seoContent: { ...seoContent, relatedPracticeIds: seoContent.relatedPracticeIds.map((current, itemIndex) => itemIndex === index ? event.target.value : current) } })} className="min-w-0 flex-1 rounded-[14px] border border-[#e4d7f4] bg-white px-3 py-2">
              <option value="">Выберите опубликованный продукт</option>
              {displayedRelatedProducts.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
            <button type="button" disabled={disabled || index === 0} onClick={() => onChange({ seoContent: { ...seoContent, relatedPracticeIds: moveItem(seoContent.relatedPracticeIds, index, -1) } })}>↑</button>
            <button type="button" disabled={disabled || index === seoContent.relatedPracticeIds.length - 1} onClick={() => onChange({ seoContent: { ...seoContent, relatedPracticeIds: moveItem(seoContent.relatedPracticeIds, index, 1) } })}>↓</button>
            <button type="button" disabled={disabled} onClick={() => onChange({ seoContent: { ...seoContent, relatedPracticeIds: seoContent.relatedPracticeIds.filter((_, itemIndex) => itemIndex !== index) } })}>Удалить</button>
          </div>
        ))}
        {seoContent.relatedPracticeIds.length < PRODUCT_CONTENT_LIMITS.seoUsageItems ? <button type="button" disabled={disabled} className="mt-2 text-sm text-[#7042c5]" onClick={() => onChange({ seoContent: { ...seoContent, relatedPracticeIds: [...seoContent.relatedPracticeIds, ""] } })}>+ Добавить продукт</button> : null}
      </div>

      <div className="mt-5 border-t border-[#e4d7f4] pt-5">
        <p className="text-sm font-medium">Связанные страницы «Слушать»</p>
        <p className="mt-2 text-sm leading-5 text-[#7d70a2]">
          Добавьте близкие по теме статьи АудиоЛада. Выбирайте только материалы,
          которые действительно раскрывают ту же тему.
        </p>
        {seoContent.relatedListenSlugs.map((slug, index) => (
          <div className="mt-2 flex gap-2" key={`listen-${index}`}>
            <select value={slug} disabled={disabled} onChange={(event) => onChange({ seoContent: { ...seoContent, relatedListenSlugs: seoContent.relatedListenSlugs.map((current, itemIndex) => itemIndex === index ? event.target.value : current) } })} className="min-w-0 flex-1 rounded-[14px] border border-[#e4d7f4] bg-white px-3 py-2">
              <option value="">Выберите страницу</option>
              {listenOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
            <button type="button" disabled={disabled || index === 0} onClick={() => onChange({ seoContent: { ...seoContent, relatedListenSlugs: moveItem(seoContent.relatedListenSlugs, index, -1) } })}>↑</button>
            <button type="button" disabled={disabled || index === seoContent.relatedListenSlugs.length - 1} onClick={() => onChange({ seoContent: { ...seoContent, relatedListenSlugs: moveItem(seoContent.relatedListenSlugs, index, 1) } })}>↓</button>
            <button type="button" disabled={disabled} onClick={() => onChange({ seoContent: { ...seoContent, relatedListenSlugs: seoContent.relatedListenSlugs.filter((_, itemIndex) => itemIndex !== index) } })}>Удалить</button>
          </div>
        ))}
        {seoContent.relatedListenSlugs.length < PRODUCT_CONTENT_LIMITS.seoUsageItems ? <button type="button" disabled={disabled} className="mt-2 text-sm text-[#7042c5]" onClick={() => onChange({ seoContent: { ...seoContent, relatedListenSlugs: [...seoContent.relatedListenSlugs, ""] } })}>+ Добавить страницу</button> : null}
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
