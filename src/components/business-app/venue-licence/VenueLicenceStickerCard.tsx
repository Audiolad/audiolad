import { venueLicencePublicUrl } from "@/lib/business-app/host";
import VenueStickerItem from "@/components/business-app/venue-licence/VenueStickerItem";

export const VENUE_STICKER_CARD_TITLE = "QR-наклейка с подтверждением прав на музыку";

/**
 * Cabinet block with the venue's own sticker (task 90d24628).
 * Lives only in «Документы»: it is printed once, so it does not take space in
 * «Управление кофейней» (Sergey, 03.11.2026). The page renders it only when the
 * licence flag is on and the caller manages this venue.
 */
export default function VenueLicenceStickerCard({
  locationId,
  publicId,
}: {
  locationId: string;
  publicId: string;
}) {
  const titleId = "venue-sticker-title";
  return (
    <section
      className="business-app-card space-y-3"
      data-testid="biz-venue-sticker"
      aria-labelledby={titleId}
    >
      <h2 id={titleId} className="text-[1.15rem] font-bold text-[var(--biz-text)]">
        {VENUE_STICKER_CARD_TITLE}
      </h2>
      <p className="text-sm leading-6 text-[var(--biz-text-muted)]">
        Наклейте QR-код у кассы или поставьте табличку на стол. Гость наводит камеру телефона и видит, что у кофейни
        есть лицензия на музыку и до какого числа она действует.
      </p>
      <a
        href={venueLicencePublicUrl(publicId)}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-block text-sm font-semibold text-[var(--biz-accent)] underline underline-offset-2 business-app-focus-ring"
        data-testid="biz-venue-sticker-page"
      >
        Открыть страницу проверки
      </a>
      <div className="business-venue-sticker__actions">
        <VenueStickerItem locationId={locationId} format="square80" />
        <VenueStickerItem locationId={locationId} format="a6" />
      </div>
      <p className="text-xs leading-5 text-[var(--biz-text-muted)]">
        Векторные файлы с полями под обрез: их можно распечатать из браузера или отдать в типографию.
      </p>
    </section>
  );
}
