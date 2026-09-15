"use client";

import { useMemo, useState } from "react";

import {
  buildAuthorSeoProductPrompt,
  canBuildAuthorSeoProductPrompt,
  listAuthorSeoPromptProductTypeOptions,
  SEO_PROMPT_SECONDARY_SELECT_LIMIT,
  suggestSecondarySeoQueriesForPrompt,
  type AuthorSeoPromptRelatedCandidate,
} from "@/lib/seo-queries/author-seo-product-prompt";

type Props = {
  primaryQueryText: string;
  primaryQueryId: string;
  analyzedOpportunities: AuthorSeoPromptRelatedCandidate[];
};

/**
 * Inline Aurafon-beta SEO packaging prompt builder.
 * Deterministic only — no external AI or discovery network calls.
 * Secondary queries are author-selected (max 2), not reservations.
 * Product content stays client-side only and grounds the prompt.
 */
export default function AuthorSeoPromptBuilder({
  primaryQueryText,
  primaryQueryId,
  analyzedOpportunities,
}: Props) {
  const [open, setOpen] = useState(false);
  const [productType, setProductType] = useState("");
  const [productFacts, setProductFacts] = useState("");
  const [productContent, setProductContent] = useState("");
  const [selectedSecondaryIds, setSelectedSecondaryIds] = useState<string[]>([]);
  const [prompt, setPrompt] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);

  const productTypeOptions = useMemo(() => listAuthorSeoPromptProductTypeOptions(), []);

  const secondarySuggestions = useMemo(
    () =>
      suggestSecondarySeoQueriesForPrompt({
        primaryQueryText,
        primaryQueryId,
        candidates: analyzedOpportunities,
      }),
    [analyzedOpportunities, primaryQueryId, primaryQueryText],
  );

  const selectedRelatedQueries = useMemo(() => {
    const byId = new Map(secondarySuggestions.map((item) => [item.id, item.queryText]));
    return selectedSecondaryIds
      .map((id) => byId.get(id))
      .filter((value): value is string => Boolean(value));
  }, [secondarySuggestions, selectedSecondaryIds]);

  const canGenerate = canBuildAuthorSeoProductPrompt({ productType, productContent });

  function toggleSecondary(id: string) {
    setPrompt(null);
    setCopyStatus(null);
    setSelectedSecondaryIds((current) => {
      if (current.includes(id)) {
        return current.filter((value) => value !== id);
      }
      if (current.length >= SEO_PROMPT_SECONDARY_SELECT_LIMIT) {
        return current;
      }
      return [...current, id];
    });
  }

  function handleGenerate() {
    if (!canGenerate) return;
    setCopyStatus(null);
    const next = buildAuthorSeoProductPrompt({
      seoQuery: primaryQueryText,
      productType,
      relatedQueries: selectedRelatedQueries,
      productFacts,
      productContent,
    });
    setPrompt(next);
  }

  async function handleCopy() {
    if (!prompt) return;
    try {
      await navigator.clipboard.writeText(prompt);
      setCopyStatus("Промпт скопирован");
    } catch {
      setCopyStatus("Не удалось скопировать. Выделите текст вручную.");
    }
  }

  const selectionFull = selectedSecondaryIds.length >= SEO_PROMPT_SECONDARY_SELECT_LIMIT;

  return (
    <div
      className="mt-4 rounded-[18px] border border-[#eadff8] bg-[#faf6ff] p-4"
      data-testid="author-seo-prompt-builder"
    >
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex min-h-10 items-center rounded-full border border-[#bda6e1] bg-white px-4 text-sm font-semibold text-[#7042c5]"
        >
          Сформировать SEO-промпт
        </button>
      ) : (
        <div className="space-y-4">
          <div>
            <h3 className="text-base font-semibold text-[#25135c]">SEO-упаковка продукта</h3>
            <p className="mt-1 text-sm leading-6 text-[#4c3d78]">
              АудиоЛад подготовит промпт на основе выбранного поискового запроса и реального
              содержания продукта. Скопируйте его и вставьте в любую нейросеть, чтобы получить
              тексты для карточки.
            </p>
          </div>

          <div>
            <p className="text-sm font-medium text-[#25135c]">Основной SEO-запрос</p>
            <p className="mt-1 rounded-xl border border-[#d7c4f5] bg-white px-3 py-2 text-sm text-[#4c3d78]">
              {primaryQueryText}
            </p>
          </div>

          <label className="block text-sm font-medium text-[#25135c]">
            Тип продукта
            <select
              value={productType}
              onChange={(event) => {
                setProductType(event.target.value);
                setPrompt(null);
                setCopyStatus(null);
              }}
              className="mt-2 min-h-11 w-full rounded-xl border border-[#d7c4f5] bg-white px-3 text-sm outline-none focus:border-[#7042c5]"
            >
              <option value="">Выберите тип продукта</option>
              {productTypeOptions.map((label) => (
                <option key={label} value={label}>
                  {label}
                </option>
              ))}
            </select>
          </label>

          {productType.trim() ? (
            <div data-testid="author-seo-secondary-queries">
              <p className="text-sm font-medium text-[#25135c]">Дополнительные SEO-запросы</p>
              <p className="mt-1 text-sm leading-6 text-[#4c3d78]">
                Можно выбрать до двух близких запросов для этой же страницы. Они помогут естественно
                усилить описание, SEO-поля и вопросы с ответами.
              </p>
              <p className="mt-2 text-xs font-semibold text-[#7042c5]">
                Выбрано: {selectedSecondaryIds.length} из {SEO_PROMPT_SECONDARY_SELECT_LIMIT}
              </p>
              {secondarySuggestions.length === 0 ? (
                <p className="mt-3 text-sm text-[#796ba0]">
                  Подходящих дополнительных запросов сейчас нет — можно сформировать промпт только с
                  основным запросом.
                </p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {secondarySuggestions.map((item) => {
                    const checked = selectedSecondaryIds.includes(item.id);
                    const disabled = selectionFull && !checked;
                    return (
                      <li key={item.id}>
                        <label
                          className={`flex cursor-pointer items-start gap-3 rounded-[14px] border px-3 py-2 text-sm ${
                            checked
                              ? "border-[#9a74d8] bg-white"
                              : "border-[#eadff8] bg-white"
                          } ${disabled ? "cursor-not-allowed opacity-50" : ""}`}
                        >
                          <input
                            type="checkbox"
                            className="mt-1"
                            checked={checked}
                            disabled={disabled}
                            onChange={() => toggleSecondary(item.id)}
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block font-medium text-[#25135c]">{item.queryText}</span>
                            {typeof item.frequency === "number" ? (
                              <span className="mt-0.5 block text-xs text-[#5f5484]">
                                Запросов в месяц: {item.frequency.toLocaleString("ru-RU")}
                              </span>
                            ) : null}
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          ) : null}

          <label className="block text-sm font-medium text-[#25135c]">
            Краткие сведения о продукте
            <span className="mt-1 block text-xs font-normal leading-5 text-[#796ba0]">
              Укажите факты: длительность, количество треков или частей, голос или без голоса, формат
              и другие важные особенности.
            </span>
            <textarea
              value={productFacts}
              onChange={(event) => {
                setProductFacts(event.target.value);
                setPrompt(null);
                setCopyStatus(null);
              }}
              rows={3}
              placeholder="Например: 10 композиций без слов, спокойный джаз, общая продолжительность около 45 минут."
              className="mt-2 w-full rounded-xl border border-[#d7c4f5] bg-white px-3 py-2 text-sm outline-none focus:border-[#7042c5]"
            />
          </label>

          <label className="block text-sm font-medium text-[#25135c]" data-testid="author-seo-product-content">
            Содержание продукта
            <span className="mt-1 block text-xs font-normal leading-5 text-[#796ba0]">
              Добавьте текст, сценарий, расшифровку или подробное описание содержания. АудиоЛад
              включит этот материал в промпт, чтобы описание продукта соответствовало тому, что
              человек действительно услышит.
            </span>
            <textarea
              value={productContent}
              onChange={(event) => {
                setProductContent(event.target.value);
                setPrompt(null);
                setCopyStatus(null);
              }}
              rows={12}
              placeholder="Вставьте текст медитации, описание звучания, сценарий истории, тезисы выпуска или структуру курса."
              className="mt-2 w-full rounded-xl border border-[#d7c4f5] bg-white px-3 py-2 text-sm outline-none focus:border-[#7042c5]"
            />
          </label>

          {!productContent.trim() ? (
            <p className="text-sm text-[#796ba0]" role="status">
              Добавьте содержание продукта, чтобы SEO-описание соответствовало реальному аудио.
            </p>
          ) : null}

          <button
            type="button"
            disabled={!canGenerate}
            onClick={handleGenerate}
            className="inline-flex min-h-10 items-center rounded-full bg-[#7042c5] px-4 text-sm font-semibold text-white disabled:opacity-50"
          >
            Сформировать SEO-промпт
          </button>

          {prompt ? (
            <div className="space-y-3">
              <label className="block text-sm font-medium text-[#25135c]">
                Готовый промпт
                <textarea
                  readOnly
                  value={prompt}
                  rows={18}
                  className="mt-2 w-full rounded-xl border border-[#d7c4f5] bg-white px-3 py-2 font-mono text-xs leading-5 text-[#4c3d78]"
                />
              </label>
              <button
                type="button"
                onClick={() => void handleCopy()}
                className="inline-flex min-h-10 items-center rounded-full border border-[#bda6e1] bg-white px-4 text-sm font-semibold text-[#7042c5]"
              >
                Скопировать промпт
              </button>
              {copyStatus ? (
                <p role="status" className="text-sm font-medium text-[#24553a]">
                  {copyStatus}
                </p>
              ) : null}
            </div>
          ) : null}

          <section className="rounded-[16px] border border-[#eadff8] bg-white p-4">
            <h4 className="text-sm font-semibold text-[#25135c]">Как работать с промптом</h4>
            <ol className="mt-2 space-y-2 text-sm leading-6 text-[#4c3d78]">
              <li>
                <span className="font-semibold text-[#25135c]">1. Добавьте содержание продукта</span>
                <span className="block">
                  Вставьте текст, сценарий, расшифровку или подробное описание того, что человек
                  услышит.
                </span>
              </li>
              <li>
                <span className="font-semibold text-[#25135c]">2. Сформируйте и скопируйте промпт</span>
                <span className="block">
                  Выберите тип продукта и дополнительные запросы, затем нажмите «Сформировать
                  SEO-промпт» и «Скопировать промпт».
                </span>
              </li>
              <li>
                <span className="font-semibold text-[#25135c]">3. Откройте любую нейросеть</span>
                <span className="block">
                  Вставьте промпт в ChatGPT, Grok, Claude или другой сервис, получите готовые тексты и
                  перенесите их в карточку продукта АудиоЛада.
                </span>
              </li>
            </ol>
          </section>
        </div>
      )}
    </div>
  );
}
