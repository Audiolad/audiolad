"use client";

import {
  PRODUCT_CONTENT_LIMITS,
} from "@/lib/author-products/limits";
import {
  buildProductSeoPreview,
  evaluateProductSeoReadiness,
} from "@/lib/seo/product-metadata";

function CharCounter({ value, max }: { value: string; max: number }) {
  return (
    <p className="mt-1 text-right text-xs text-[#7d70a2]">
      {value.length} / {max}
    </p>
  );
}

export type AuthorProductSeoSectionProps = {
  title: string;
  subtitle: string;
  description: string;
  productKind: string;
  seoPrimaryQuery: string;
  seoTitle: string;
  seoDescription: string;
  publicPath: string;
  fieldErrors: {
    seoPrimaryQuery?: string;
    seoTitle?: string;
    seoDescription?: string;
  };
  onChange: (
    patch: Partial<{
      seoPrimaryQuery: string;
      seoTitle: string;
      seoDescription: string;
    }>,
  ) => void;
};

export default function AuthorProductSeoSection({
  title,
  subtitle,
  description,
  productKind,
  seoPrimaryQuery,
  seoTitle,
  seoDescription,
  publicPath,
  fieldErrors,
  onChange,
}: AuthorProductSeoSectionProps) {
  const seoInput = {
    title,
    subtitle,
    description,
    productKind,
    seoPrimaryQuery,
    seoTitle,
    seoDescription,
    publicPath,
  };
  const preview = buildProductSeoPreview(seoInput);
  const readiness = evaluateProductSeoReadiness(seoInput);

  return (
    <section className="rounded-[22px] border border-[#e4d7f4] bg-[#fcf8ff] px-4 py-5 sm:px-5">
      <h2 className="text-base font-semibold text-[#2b2140]">Поиск в Яндексе</h2>
      <p className="mt-2 text-sm leading-6 text-[#5c5278]">
        Помогите людям найти ваш продукт через поиск. Название продукта останется
        прежним – эти настройки используются для поисковой страницы.
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
        Достаточно естественно использовать поисковую фразу 1–2 раза. Не нужно
        повторять её искусственно.
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
          onChange={(event) =>
            onChange({ seoPrimaryQuery: event.target.value })
          }
          className="w-full rounded-[18px] border border-[#e4d7f4] bg-white px-4 py-3 outline-none focus:border-[#9a74d8]"
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
          onChange={(event) => onChange({ seoTitle: event.target.value })}
          className="w-full rounded-[18px] border border-[#e4d7f4] bg-white px-4 py-3 outline-none focus:border-[#9a74d8]"
          placeholder={preview.title}
        />
        <p className="mt-2 text-sm leading-5 text-[#7d70a2]">
          Если оставить пустым, АудиоЛад составит заголовок из названия продукта
          и основного запроса.
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
          onChange={(event) =>
            onChange({ seoDescription: event.target.value })
          }
          rows={4}
          className="w-full rounded-[18px] border border-[#e4d7f4] bg-white px-4 py-3 outline-none focus:border-[#9a74d8]"
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
    </section>
  );
}
