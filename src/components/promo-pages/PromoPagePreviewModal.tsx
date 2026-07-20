"use client";

import PromoPagePresentation, {
  type PromoPagePresentationProduct,
} from "@/components/promo-pages/PromoPagePresentation";

type PromoPagePreviewModalProps = {
  open: boolean;
  onClose: () => void;
  publicTitle: string;
  publicDescription: string | null;
  footerText: string | null;
  ctaLabel: string | null;
  ctaHref: string | null;
  products: PromoPagePresentationProduct[];
  authorName: string;
};

export default function PromoPagePreviewModal({
  open,
  onClose,
  publicTitle,
  publicDescription,
  footerText,
  ctaLabel,
  ctaHref,
  products,
  authorName,
}: PromoPagePreviewModalProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#1f1633]/55 p-0 sm:items-center sm:p-4">
      <button
        type="button"
        aria-label="Закрыть предпросмотр"
        className="absolute inset-0"
        onClick={onClose}
      />
      <div className="relative z-10 max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-[28px] bg-[#f7f2ff] p-4 shadow-2xl sm:rounded-[28px] sm:p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-[#2f2548]">Предпросмотр промостраницы</p>
            <p className="mt-1 text-xs text-[#7d70a2]">
              Так страница будет выглядеть для гостей после публикации.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-[#ddcfef] px-3 py-1.5 text-sm font-semibold text-[#7042c5]"
          >
            Закрыть
          </button>
        </div>

        <PromoPagePresentation
          publicTitle={publicTitle}
          publicDescription={publicDescription}
          footerText={footerText}
          ctaLabel={ctaLabel}
          ctaHref={ctaHref}
          products={products}
          authorName={authorName}
          previewMode
        />
      </div>
    </div>
  );
}
