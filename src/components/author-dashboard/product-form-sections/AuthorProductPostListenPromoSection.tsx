"use client";

import { AuthorProductCharCounter } from "@/components/author-dashboard/product-form-sections/AuthorProductCharCounter";
import {
  PROMO_RECOMMENDATION_BUTTON_TEXT_MAX_LENGTH,
  PROMO_RECOMMENDATION_TEXT_MAX_LENGTH,
  PROMO_RECOMMENDATION_TITLE_MAX_LENGTH,
} from "@/lib/products/promo-recommendation";

type AuthorProductPostListenPromoSectionProps = {
  promoEnabled: boolean;
  promoTitle: string;
  promoText: string;
  promoButtonText: string;
  promoUrl: string;
  promoOpenInNewTab: boolean;
  busy: boolean;
  onPromoEnabledChange: (enabled: boolean) => void;
  onPromoTitleChange: (value: string) => void;
  onPromoTextChange: (value: string) => void;
  onPromoButtonTextChange: (value: string) => void;
  onPromoUrlChange: (value: string) => void;
  onPromoOpenInNewTabChange: (value: boolean) => void;
};

export default function AuthorProductPostListenPromoSection({
  promoEnabled,
  promoTitle,
  promoText,
  promoButtonText,
  promoUrl,
  promoOpenInNewTab,
  busy,
  onPromoEnabledChange,
  onPromoTitleChange,
  onPromoTextChange,
  onPromoButtonTextChange,
  onPromoUrlChange,
  onPromoOpenInNewTabChange,
}: AuthorProductPostListenPromoSectionProps) {
  return (
    <section className="space-y-4 rounded-[24px] border border-[#eadff8] bg-white p-5">
      <h2 className="text-[20px] font-semibold">
        Рекомендация после прослушивания
      </h2>
      <label className="flex cursor-pointer items-start gap-3 rounded-[18px] border border-[#eee6f7] bg-[#fbf8ff] px-4 py-3">
        <input
          type="checkbox"
          checked={promoEnabled}
          disabled={busy}
          onChange={(event) => onPromoEnabledChange(event.target.checked)}
          className="mt-1 h-4 w-4 shrink-0 rounded border-[#c6afe6] text-[#7042c5] focus:ring-[#9a74d8]"
        />
        <span className="text-sm font-medium text-[#3f3560]">
          Показывать рекомендацию
        </span>
      </label>
      <div
        className={`space-y-4 ${promoEnabled ? "" : "pointer-events-none opacity-50"}`}
      >
        <label className="block">
          <span className="mb-2 block text-sm font-medium">Заголовок</span>
          <input
            value={promoTitle}
            maxLength={PROMO_RECOMMENDATION_TITLE_MAX_LENGTH}
            disabled={!promoEnabled || busy}
            onChange={(event) => onPromoTitleChange(event.target.value)}
            className="w-full rounded-[18px] border border-[#e4d7f4] px-4 py-3 outline-none focus:border-[#9a74d8] disabled:bg-platform-surface"
          />
          <AuthorProductCharCounter
            value={promoTitle}
            max={PROMO_RECOMMENDATION_TITLE_MAX_LENGTH}
          />
        </label>
        <label className="block">
          <span className="mb-2 block text-sm font-medium">Текст</span>
          <textarea
            value={promoText}
            maxLength={PROMO_RECOMMENDATION_TEXT_MAX_LENGTH}
            disabled={!promoEnabled || busy}
            onChange={(event) => onPromoTextChange(event.target.value)}
            rows={4}
            className="w-full rounded-[18px] border border-[#e4d7f4] px-4 py-3 outline-none focus:border-[#9a74d8] disabled:bg-platform-surface"
          />
          <AuthorProductCharCounter
            value={promoText}
            max={PROMO_RECOMMENDATION_TEXT_MAX_LENGTH}
          />
        </label>
        <label className="block">
          <span className="mb-2 block text-sm font-medium">Текст кнопки</span>
          <input
            value={promoButtonText}
            maxLength={PROMO_RECOMMENDATION_BUTTON_TEXT_MAX_LENGTH}
            disabled={!promoEnabled || busy}
            onChange={(event) => onPromoButtonTextChange(event.target.value)}
            className="w-full rounded-[18px] border border-[#e4d7f4] px-4 py-3 outline-none focus:border-[#9a74d8] disabled:bg-platform-surface"
          />
          <AuthorProductCharCounter
            value={promoButtonText}
            max={PROMO_RECOMMENDATION_BUTTON_TEXT_MAX_LENGTH}
          />
        </label>
        <label className="block">
          <span className="mb-2 block text-sm font-medium">Ссылка</span>
          <input
            type="url"
            value={promoUrl}
            disabled={!promoEnabled || busy}
            onChange={(event) => onPromoUrlChange(event.target.value)}
            className="w-full rounded-[18px] border border-[#e4d7f4] px-4 py-3 outline-none focus:border-[#9a74d8] disabled:bg-platform-surface"
            placeholder="https://"
          />
        </label>
        <label className="flex cursor-pointer items-start gap-3 text-sm text-[#5f5484]">
          <input
            type="checkbox"
            checked={promoOpenInNewTab}
            disabled={!promoEnabled || busy}
            onChange={(event) =>
              onPromoOpenInNewTabChange(event.target.checked)
            }
            className="mt-0.5 h-4 w-4 shrink-0 rounded border-[#c6afe6] text-[#7042c5] focus:ring-[#9a74d8]"
          />
          Открывать ссылку в новой вкладке
        </label>
      </div>
    </section>
  );
}
