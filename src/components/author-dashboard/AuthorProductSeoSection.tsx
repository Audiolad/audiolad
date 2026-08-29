"use client";

import { useEffect, useState } from "react";

import {
  PRODUCT_CONTENT_LIMITS,
} from "@/lib/author-products/limits";
import {
  buildProductSeoPreview,
  evaluateProductSeoReadiness,
} from "@/lib/seo/product-metadata";
import type { PracticeSeoContentInput } from "@/lib/products/practice-seo-content";

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
  publicPath,
  fieldErrors,
  onChange,
  disabled = false,
}: AuthorProductSeoSectionProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [listenOptions, setListenOptions] = useState<SelectOption[]>([]);
  useEffect(() => {
    void fetch("/api/author/seo/listen-options")
      .then((response) => response.ok ? response.json() : { options: [] })
      .then((payload: { options?: SelectOption[] }) => setListenOptions(payload.options ?? []))
      .catch(() => setListenOptions([]));
  }, []);
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

  return (
    <section className="rounded-[22px] border border-[#e4d7f4] bg-[#fcf8ff] px-4 py-5 sm:px-5">
      <button
        type="button"
        className="flex w-full items-center justify-between text-left text-base font-semibold text-[#2b2140]"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((current) => !current)}
      >
        <span>{isOpen ? "−" : "＋"} SEO и продвижение · необязательно</span>
      </button>
      {!isOpen ? (
        <p className="mt-2 text-sm text-[#7d70a2]">
          {seoPrimaryQuery || seoSecondaryQueries.length || seoTitle || seoDescription || seoAbout
            ? "SEO заполнено частично"
            : "SEO не заполнено"}
        </p>
      ) : null}

      {isOpen ? <><p className="mt-2 text-sm leading-6 text-[#5c5278]">
        Помогите людям находить ваш продукт в Яндексе и Google.
      </p>

      <p className="mt-4 text-sm font-medium text-[#2b2140]">
        SEO-готовность: {readiness.doneCount} из {readiness.total}
      </p>
      <ul className="mt-2 space-y-1.5 text-sm leading-5 text-[#5c5278]">
        {readiness.checks.map((check) => (
          <li key={check.id}>
            {check.done ? "✓" : "○"} {check.label}
          </li>
        ))}
      </ul>
      <p className="mt-3 text-sm leading-5 text-[#7d70a2]">
        Используйте фразы естественно — не повторяйте их искусственно.
      </p>

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
          Напишите фразу, которую человек может ввести в Яндексе, чтобы найти
          такой аудиопродукт.
        </p>
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

      <div className="mt-5 border-t border-[#e4d7f4] pt-5">
        <p className="text-sm font-medium">Как использовать</p>
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
        {seoContent.faqItems.map((item, index) => (
          <div className="mt-2 grid gap-2" key={`faq-${index}`}>
            <input value={item.question} disabled={disabled} placeholder="Вопрос" maxLength={PRODUCT_CONTENT_LIMITS.seoFaqQuestion} onChange={(event) => onChange({ seoContent: { ...seoContent, faqItems: seoContent.faqItems.map((current, itemIndex) => itemIndex === index ? { ...current, question: event.target.value } : current) } })} className="rounded-[14px] border border-[#e4d7f4] bg-white px-3 py-2" />
            <textarea value={item.answer} disabled={disabled} placeholder="Ответ" maxLength={PRODUCT_CONTENT_LIMITS.seoFaqAnswer} rows={3} onChange={(event) => onChange({ seoContent: { ...seoContent, faqItems: seoContent.faqItems.map((current, itemIndex) => itemIndex === index ? { ...current, answer: event.target.value } : current) } })} className="rounded-[14px] border border-[#e4d7f4] bg-white px-3 py-2" />
            <div className="flex gap-2"><button type="button" disabled={disabled || index === 0} onClick={() => onChange({ seoContent: { ...seoContent, faqItems: moveItem(seoContent.faqItems, index, -1) } })}>↑</button><button type="button" disabled={disabled || index === seoContent.faqItems.length - 1} onClick={() => onChange({ seoContent: { ...seoContent, faqItems: moveItem(seoContent.faqItems, index, 1) } })}>↓</button></div>
            <button type="button" disabled={disabled} className="justify-self-start text-sm text-[#7042c5]" onClick={() => onChange({ seoContent: { ...seoContent, faqItems: seoContent.faqItems.filter((_, itemIndex) => itemIndex !== index) } })}>Удалить</button>
          </div>
        ))}
        {seoContent.faqItems.length < PRODUCT_CONTENT_LIMITS.seoFaqItems ? <button type="button" disabled={disabled} className="mt-2 text-sm text-[#7042c5]" onClick={() => onChange({ seoContent: { ...seoContent, faqItems: [...seoContent.faqItems, { question: "", answer: "" }] } })}>+ Добавить вопрос</button> : null}
      </div>

      <div className="mt-5 border-t border-[#e4d7f4] pt-5">
        <p className="text-sm font-medium">Связанные продукты</p>
        {seoContent.relatedPracticeIds.map((id, index) => (
          <div className="mt-2 flex gap-2" key={`product-${index}`}>
            <select value={id} disabled={disabled} onChange={(event) => onChange({ seoContent: { ...seoContent, relatedPracticeIds: seoContent.relatedPracticeIds.map((current, itemIndex) => itemIndex === index ? event.target.value : current) } })} className="min-w-0 flex-1 rounded-[14px] border border-[#e4d7f4] bg-white px-3 py-2">
              <option value="">Выберите опубликованный продукт</option>
              {relatedProductOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
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

      <label className="mt-4 block">
        <span className="mb-2 block text-sm font-medium">Дополнительные поисковые фразы</span>
        <textarea
          value={seoSecondaryQueries.join("\n")}
          maxLength={(PRODUCT_CONTENT_LIMITS.seoSecondaryQuery + 1) * PRODUCT_CONTENT_LIMITS.seoSecondaryQueries}
          disabled={disabled}
          onChange={(event) =>
            onChange({
              seoSecondaryQueries: event.target.value
                .split("\n")
                .map((item) => item.trim())
                .filter(Boolean)
                .slice(0, PRODUCT_CONTENT_LIMITS.seoSecondaryQueries),
            })
          }
          rows={3}
          className="w-full rounded-[18px] border border-[#e4d7f4] bg-white px-4 py-3 outline-none focus:border-[#9a74d8] disabled:cursor-not-allowed disabled:opacity-60"
          placeholder="Одна фраза в строке"
        />
        <p className="mt-2 text-sm leading-5 text-[#7d70a2]">
          Необязательно. До 10 фраз для внутренней SEO-подсказки; публично они не выводятся.
        </p>
        {fieldErrors.seoSecondaryQueries ? <p className="mt-2 text-sm text-[#9b3d3d]">{fieldErrors.seoSecondaryQueries}</p> : null}
      </label>

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
          Необязательно. Если оставить пустым, сохранится обычный заголовок продукта.
        </p>
        <CharCounter value={seoTitle} max={PRODUCT_CONTENT_LIMITS.seoTitle} />
        {fieldErrors.seoTitle ? (
          <p className="mt-2 text-sm text-[#9b3d3d]">{fieldErrors.seoTitle}</p>
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
          Необязательный дополнительный публичный текст. Он не заменяет основное описание.
        </p>
        {fieldErrors.seoAbout ? <p className="mt-2 text-sm text-[#9b3d3d]">{fieldErrors.seoAbout}</p> : null}
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
          Коротко объясните, что получит слушатель. Если оставить пустым,
          АудиоЛад возьмёт начало обычного описания продукта.
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
