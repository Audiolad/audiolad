"use client";

import { PRODUCT_CONTENT_LIMITS } from "@/lib/author-products/limits";
import {
  PRIMARY_QUERY_AI_ALTERNATIVES_HEADING,
  PRIMARY_QUERY_AI_ALTERNATIVES_HINT,
  PRIMARY_QUERY_INITIAL_SUBMIT_CTA,
  PRIMARY_QUERY_LOADING_WORDSTAT,
} from "@/lib/seo/primary-query-suggestions/ui";
import {
  clipSeoQuery,
  formatWordstatCount,
  isSameSeoQuery,
  wordstatColorClasses,
} from "@/lib/seo/wordstat/ui";
import { WORDSTAT_MAX_PHRASE_LENGTH } from "@/lib/seo/wordstat/types";
import type {
  WordstatSuggestion,
  WordstatSuggestionsPayload,
} from "@/lib/seo/wordstat/types";

export type AuthorProductSeoWordstatPickerProps = {
  seed: string;
  onSeedChange: (value: string) => void;
  loading: boolean;
  loadingLabel?: string;
  submitLabel?: string;
  error: string | null;
  result: WordstatSuggestionsPayload | null;
  alternativeSuggestions?: string[];
  seoPrimaryQuery: string;
  seoSecondaryQueries: string[];
  disabled?: boolean;
  onSubmit: () => void;
  onSelectPrimary: (phrase: string) => void;
  onAddSecondary: (phrase: string) => void;
  onSelectAlternative?: (phrase: string) => void;
};

function sourceCaption(source: WordstatSuggestion["source"]): string {
  return source === "result" ? "по теме" : "похожий запрос";
}

function WordstatSuggestionCard({
  item,
  seoPrimaryQuery,
  seoSecondaryQueries,
  disabled,
  secondariesFull,
  onSelectPrimary,
  onAddSecondary,
}: {
  item: WordstatSuggestion;
  seoPrimaryQuery: string;
  seoSecondaryQueries: string[];
  disabled?: boolean;
  secondariesFull: boolean;
  onSelectPrimary: (phrase: string) => void;
  onAddSecondary: (phrase: string) => void;
}) {
  const colors = wordstatColorClasses(item.opportunity.color);
  const isPrimary = isSameSeoQuery(item.phrase, seoPrimaryQuery);
  const isSecondary = seoSecondaryQueries.some((query) =>
    isSameSeoQuery(query, item.phrase),
  );
  const countLabel = formatWordstatCount(item.count);
  const ariaLabel = `${item.phrase}. ${colors.legend}. ${countLabel}. ${item.opportunity.label}.`;

  return (
    <article
      className={`rounded-[16px] border px-3 py-3 ${colors.card}`}
      aria-label={ariaLabel}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${colors.badge}`}>
          <span aria-hidden="true">{colors.emoji} </span>
          {item.opportunity.label}
        </span>
        <span className="text-xs text-[#7d70a2]">{sourceCaption(item.source)}</span>
      </div>
      <p className="mt-2 text-base font-semibold leading-6 text-[#2b2140]">
        {item.phrase}
      </p>
      <p className="mt-1 text-sm text-[#5c5278]">{countLabel}</p>
      <p className="mt-1 text-sm leading-5 text-[#5c5278]">
        {item.opportunity.description}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={disabled || isPrimary}
          onClick={() => onSelectPrimary(item.phrase)}
          className="rounded-full border border-[#d4c4ee] bg-white px-3 py-1.5 text-sm text-[#4d336f] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPrimary ? "Основной" : "Выбрать основным"}
        </button>
        <button
          type="button"
          disabled={disabled || isSecondary || (secondariesFull && !isSecondary)}
          onClick={() => onAddSecondary(item.phrase)}
          className="rounded-full border border-[#d4c4ee] bg-white px-3 py-1.5 text-sm text-[#4d336f] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSecondary ? "Добавлено" : "+ В дополнительные"}
        </button>
      </div>
    </article>
  );
}

export default function AuthorProductSeoWordstatPicker({
  seed,
  onSeedChange,
  loading,
  loadingLabel = PRIMARY_QUERY_LOADING_WORDSTAT,
  submitLabel = PRIMARY_QUERY_INITIAL_SUBMIT_CTA,
  error,
  result,
  alternativeSuggestions = [],
  seoPrimaryQuery,
  seoSecondaryQueries,
  disabled = false,
  onSubmit,
  onSelectPrimary,
  onAddSecondary,
  onSelectAlternative,
}: AuthorProductSeoWordstatPickerProps) {
  const secondariesFull =
    seoSecondaryQueries.length >= PRODUCT_CONTENT_LIMITS.seoSecondaryQueries;
  const resultSuggestions =
    result?.suggestions.filter((item) => item.source === "result") ?? [];
  const associationSuggestions =
    result?.suggestions.filter((item) => item.source === "association") ?? [];
  const seedInResults = Boolean(
    result &&
      result.suggestions.some((item) => isSameSeoQuery(item.phrase, result.phrase)),
  );

  return (
    <div className="mt-3 rounded-[18px] border border-[#e4d7f4] bg-white px-3 py-4 sm:px-4">
      <p className="text-sm font-medium text-[#2b2140]">Подбор поискового запроса</p>
      <label className="mt-3 block">
        <span className="mb-2 block text-sm font-medium">Что ищем</span>
        <input
          value={seed}
          maxLength={WORDSTAT_MAX_PHRASE_LENGTH}
          disabled={disabled}
          onChange={(event) => onSeedChange(event.target.value)}
          className="w-full rounded-[18px] border border-[#e4d7f4] bg-white px-4 py-3 outline-none focus:border-[#9a74d8] disabled:cursor-not-allowed disabled:opacity-60"
        />
      </label>
      <p className="mt-2 text-sm text-[#7d70a2]">Россия · все устройства</p>
      <button
        type="button"
        disabled={disabled || loading}
        onClick={onSubmit}
        className="mt-3 rounded-full bg-[#7042c5] px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? loadingLabel : submitLabel}
      </button>
      <p className="mt-3 text-sm leading-5 text-[#7d70a2]">
        Для нового продукта чаще всего удобно начинать с конкретного запроса
        примерно на 50–1000 запросов за 30 дней. Это ориентир, а не обязательное
        правило.
      </p>
      <p className="mt-2 text-sm leading-5 text-[#5c5278]">
        🟢 подходит для старта / 🟡 стоит оценить внимательнее / 🔴 лучше поискать
        другой вариант
      </p>
      <p className="mt-2 text-sm leading-5 text-[#7d70a2]">
        Частотность показывает поисковый спрос, а не гарантирует позицию в
        Яндексе. Для нового продукта чаще удобнее начинать с конкретных запросов
        с умеренным спросом.
      </p>
      {error ? (
        <p className="mt-3 text-sm text-[#9b3d3d]">{error}</p>
      ) : null}
      {alternativeSuggestions.length > 0 ? (
        <div className="mt-3">
          <p className="text-sm font-medium text-[#2b2140]">
            {PRIMARY_QUERY_AI_ALTERNATIVES_HEADING}
          </p>
          <p className="mt-1 text-sm leading-5 text-[#7d70a2]">
            {PRIMARY_QUERY_AI_ALTERNATIVES_HINT}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {alternativeSuggestions.map((phrase) => (
              <button
                key={phrase}
                type="button"
                disabled={disabled || loading}
                onClick={() => onSelectAlternative?.(phrase)}
                className="rounded-full border border-[#d4c4ee] bg-[#f7f1ff] px-3 py-1.5 text-sm text-[#4d336f] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {phrase}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {result && !seedInResults && result.topicTotalCount !== null ? (
        <p className="mt-3 text-sm leading-5 text-[#5c5278]">
          Суммарно по теме «{result.phrase}»:{" "}
          {result.topicTotalCount.toLocaleString("ru-RU")} запросов за последние
          30 дней. Это общая оценка темы, а не частота самой фразы.
        </p>
      ) : null}
      {result && result.suggestions.length > 0 ? (
        <div className="mt-4 space-y-4">
          {resultSuggestions.length > 0 ? (
            <div>
              <p className="mb-2 text-sm font-medium text-[#2b2140]">
                Запросы по теме
              </p>
              <div className="space-y-3">
                {resultSuggestions.map((item) => (
                  <WordstatSuggestionCard
                    key={`result-${item.phrase}`}
                    item={item}
                    seoPrimaryQuery={seoPrimaryQuery}
                    seoSecondaryQueries={seoSecondaryQueries}
                    disabled={disabled}
                    secondariesFull={secondariesFull}
                    onSelectPrimary={(phrase) =>
                      onSelectPrimary(
                        clipSeoQuery(phrase, PRODUCT_CONTENT_LIMITS.seoPrimaryQuery),
                      )
                    }
                    onAddSecondary={onAddSecondary}
                  />
                ))}
              </div>
            </div>
          ) : null}
          {associationSuggestions.length > 0 ? (
            <div>
              <p className="mb-2 text-sm font-medium text-[#2b2140]">
                Похожие запросы
              </p>
              <div className="space-y-3">
                {associationSuggestions.map((item) => (
                  <WordstatSuggestionCard
                    key={`association-${item.phrase}`}
                    item={item}
                    seoPrimaryQuery={seoPrimaryQuery}
                    seoSecondaryQueries={seoSecondaryQueries}
                    disabled={disabled}
                    secondariesFull={secondariesFull}
                    onSelectPrimary={(phrase) =>
                      onSelectPrimary(
                        clipSeoQuery(phrase, PRODUCT_CONTENT_LIMITS.seoPrimaryQuery),
                      )
                    }
                    onAddSecondary={onAddSecondary}
                  />
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
      {secondariesFull ? (
        <p className="mt-3 text-sm leading-5 text-[#7d70a2]">
          Достигнут лимит 10 дополнительных фраз. Удалите одну, чтобы добавить
          другую.
        </p>
      ) : null}
    </div>
  );
}
