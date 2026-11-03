import { venueLicencePublicUrl } from "@/lib/business-app/host";
import VenueQrShowButton from "@/components/business-app/venue-licence/VenueQrFullscreen";
import VenueStickerItem from "@/components/business-app/venue-licence/VenueStickerItem";

export const VENUE_STICKER_CARD_TITLE = "QR-наклейка с подтверждением прав на музыку";
export const VENUE_QR_PHONE_TEXT =
  "Пришёл проверяющий – откройте QR-код на телефоне и дайте отсканировать: по нему откроется подтверждение прав на музыку.";
export const VENUE_QR_PRINT_TEXT = "Можно один раз распечатать и держать в папке с документами или у кассы.";

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
  const publicUrl = venueLicencePublicUrl(publicId);
  return (
    <section
      className="business-app-card space-y-3"
      data-testid="biz-venue-sticker"
      aria-labelledby={titleId}
    >
      <h2 id={titleId} className="text-[1.15rem] font-bold text-[var(--biz-text)]">
        {VENUE_STICKER_CARD_TITLE}
      </h2>
      <p className="text-[0.98rem] leading-6 text-[var(--biz-text)]" data-testid="biz-venue-qr-text">
        {VENUE_QR_PHONE_TEXT}
      </p>
      <VenueQrShowButton url={publicUrl} />
      <p className="pt-2 text-sm leading-6 text-[var(--biz-text-muted)]" data-testid="biz-venue-print-text">
        {VENUE_QR_PRINT_TEXT}
      </p>
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
