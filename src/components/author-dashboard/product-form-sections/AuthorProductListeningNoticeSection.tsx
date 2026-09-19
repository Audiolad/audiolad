"use client";

import { AuthorProductCharCounter } from "@/components/author-dashboard/product-form-sections/AuthorProductCharCounter";
import { PRODUCT_CONTENT_LIMITS } from "@/lib/author-products/limits";

type AuthorProductListeningNoticeSectionProps = {
  enabled: boolean;
  title: string;
  text: string;
  titleError?: string;
  textError?: string;
  busy: boolean;
  onEnabledChange: (enabled: boolean) => void;
  onTitleChange: (title: string) => void;
  onTextChange: (text: string) => void;
  onClearTitleError: () => void;
  onClearTextError: () => void;
  onResetDefaults: () => void;
};

export default function AuthorProductListeningNoticeSection({
  enabled,
  title,
  text,
  titleError,
  textError,
  busy,
  onEnabledChange,
  onTitleChange,
  onTextChange,
  onClearTitleError,
  onClearTextError,
  onResetDefaults,
}: AuthorProductListeningNoticeSectionProps) {
  return (
    <section className="space-y-4 rounded-[24px] border border-[#eadff8] bg-white p-5">
      <h2 className="text-[20px] font-semibold">
        Рекомендации перед прослушиванием
      </h2>

      <div className="rounded-[18px] border border-[#eee6f7] bg-[#fbf8ff] px-4 py-3">
        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={enabled}
            disabled={busy}
            onChange={(event) => onEnabledChange(event.target.checked)}
            className="mt-1 h-4 w-4 shrink-0 rounded border-[#c6afe6] text-[#7042c5] focus:ring-[#9a74d8]"
          />
          <span className="min-w-0">
            <span className="block text-sm font-medium text-[#3f3560]">
              Показывать рекомендации на странице продукта
            </span>
            <span className="mt-1 block text-sm leading-5 text-[#7d70a2]">
              Блок отображается на публичной странице продукта и на экране
              прослушивания.
            </span>
          </span>
        </label>
      </div>

      <div
        className={`space-y-4 ${enabled ? "" : "pointer-events-none opacity-50"}`}
      >
        <label
          className="block"
          data-submit-issue={titleError ? "" : undefined}
        >
          <span className="mb-2 block text-sm font-medium">Заголовок</span>
          <input
            value={title}
            maxLength={PRODUCT_CONTENT_LIMITS.listeningNoticeTitle}
            disabled={!enabled || busy}
            onChange={(event) => {
              onClearTitleError();
              onTitleChange(event.target.value);
            }}
            className="w-full rounded-[18px] border border-[#e4d7f4] px-4 py-3 outline-none focus:border-[#9a74d8] disabled:bg-platform-surface"
          />
          <AuthorProductCharCounter
            value={title}
            max={PRODUCT_CONTENT_LIMITS.listeningNoticeTitle}
          />
          {titleError ? (
            <p className="mt-2 text-sm text-[#9b3d3d]">{titleError}</p>
          ) : null}
        </label>

        <label
          className="block"
          data-submit-issue={textError ? "" : undefined}
        >
          <span className="mb-2 block text-sm font-medium">
            Текст рекомендаций
          </span>
          <textarea
            value={text}
            maxLength={PRODUCT_CONTENT_LIMITS.listeningNoticeText}
            disabled={!enabled || busy}
            onChange={(event) => {
              onClearTextError();
              onTextChange(event.target.value);
            }}
            rows={5}
            className="w-full rounded-[18px] border border-[#e4d7f4] px-4 py-3 outline-none focus:border-[#9a74d8] disabled:bg-platform-surface"
          />
          <AuthorProductCharCounter
            value={text}
            max={PRODUCT_CONTENT_LIMITS.listeningNoticeText}
          />
          {textError ? (
            <p className="mt-2 text-sm text-[#9b3d3d]">{textError}</p>
          ) : null}
        </label>

        <button
          type="button"
          disabled={!enabled || busy}
          onClick={onResetDefaults}
          className="text-sm font-semibold text-[#7042c5] underline-offset-2 hover:underline disabled:cursor-not-allowed disabled:opacity-50"
        >
          Вернуть стандартный текст
        </button>
      </div>
    </section>
  );
}
