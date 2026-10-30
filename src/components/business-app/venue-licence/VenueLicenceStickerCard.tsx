import { venueLicencePublicUrl } from "@/lib/business-app/host";
import { venueStickerHref, venueStickerFilename } from "@/lib/business-app/venue-licence/sticker-links";

export const VENUE_STICKER_CARD_TITLE = "QR-наклейка с подтверждением прав на музыку";

/**
 * Cabinet block with the venue's own sticker (task 90d24628).
 * Shown in «Управление кофейней» and in «Документы». The pages render it only
 * when the licence flag is on and the caller manages this venue.
 * No hooks: it renders inside client and server components alike.
 */
export default function VenueLicenceStickerCard({
  locationId,
  publicId,
  placement,
}: {
  locationId: string;
  publicId: string;
  placement: "venue" | "documents";
}) {
  const titleId = `venue-sticker-title-${placement}`;
  return (
    <section
      className="business-app-card space-y-3"
      data-testid="biz-venue-sticker"
      data-placement={placement}
      aria-labelledby={titleId}
    >
      <h2 id={titleId} className="text-[1.15rem] font-bold text-[var(--biz-text)]">
        {VENUE_STICKER_CARD_TITLE}
      </h2>
      <p className="text-sm leading-6 text-[var(--biz-text-muted)]">
        Наклейте QR-код у кассы или поставьте тент на стол. Гость наводит камеру телефона и видит, что у кофейни
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
      <div className="flex flex-wrap gap-2">
        <a
          href={venueStickerHref(locationId, "square80")}
          download={venueStickerFilename("square80")}
          className="business-app-btn business-app-btn-secondary business-app-focus-ring"
          data-testid="biz-venue-sticker-square80"
        >
          Скачать наклейку 80×80 мм
        </a>
        <a
          href={venueStickerHref(locationId, "a6")}
          download={venueStickerFilename("a6")}
          className="business-app-btn business-app-btn-secondary business-app-focus-ring"
          data-testid="biz-venue-sticker-a6"
        >
          Скачать тент А6
        </a>
      </div>
      <p className="text-xs leading-5 text-[var(--biz-text-muted)]">
        Векторные файлы с полями под обрез: их можно распечатать из браузера или отдать в типографию.
      </p>
    </section>
  );
}
