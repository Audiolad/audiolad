import CatalogProductHeartButton from "@/components/products/CatalogProductHeartButton";
import CatalogProductPlayButton from "@/components/products/CatalogProductPlayButton";
import CatalogCardGallery from "@/components/catalog/cards/CatalogCardGallery";
import { PRODUCT_FORMAT_LINE_CLASS } from "@/lib/author-products/format";
import {
  catalogCardToActionTarget,
  type CatalogCard,
  type PublicationClass,
} from "@/lib/catalog/dto";
import { readPaidCatalogOfferPriceLabel } from "@/lib/catalog/offer";
import { formatProductDuration } from "@/lib/products/duration";
import { BUY_ACTION_LABEL, PLAY_ACTION_LABEL } from "@/lib/ui/action-labels";
import Link from "next/link";

export type CatalogCardLayoutProps = {
  card: CatalogCard;
  isAuthenticated?: boolean;
  signInReturnPath?: string;
};

function resolveActionLabel(card: CatalogCard): string {
  if (card.class === "post" || card.default_offer?.access === "free") {
    return PLAY_ACTION_LABEL;
  }

  if (card.default_offer?.access === "paid") {
    return BUY_ACTION_LABEL;
  }

  return PLAY_ACTION_LABEL;
}

export default function CatalogCardShell({
  card,
  isAuthenticated = false,
  signInReturnPath = "/catalog",
}: CatalogCardLayoutProps) {
  const actionTarget = catalogCardToActionTarget(card);
  const durationLabel = formatProductDuration(card.duration_seconds);
  const offerPriceLabel =
    card.class === "post" ? null : readPaidCatalogOfferPriceLabel(card.default_offer);
  const actionLabel = resolveActionLabel(card);

  return (
    <article
      data-catalog-grid-card
      data-catalog-class={card.class}
      className="min-w-0 overflow-hidden rounded-[20px] border border-[#eadff8] bg-white shadow-[0_6px_16px_rgba(91,62,145,0.06)]"
    >
      <div data-catalog-media-zone className="relative overflow-hidden bg-[#f4ecfb]">
        <CatalogCardGallery card={card} />

        <CatalogProductHeartButton
          product={actionTarget}
          isAuthenticated={isAuthenticated}
          signInReturnPath={signInReturnPath}
        />

        <CatalogProductPlayButton product={actionTarget} />
      </div>

      <Link
        href={card.paths.pdp}
        data-catalog-info-block
        className="block px-2.5 pb-2.5 pt-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
      >
        <p className={PRODUCT_FORMAT_LINE_CLASS}>{card.display_label}</p>

        <h3 className="line-clamp-2 min-h-10 text-[14px] font-semibold leading-5 text-[#25135c] sm:text-[15px] sm:leading-5">
          {card.title}
        </h3>

        <p className="mt-1 line-clamp-1 min-h-5 text-sm text-[#7d70a2]">
          {card.author.name || "\u00a0"}
        </p>

        {durationLabel || offerPriceLabel ? (
          <p
            data-catalog-card-meta
            className="mt-1 flex flex-wrap items-baseline text-xs leading-4 text-[#7d70a2]"
          >
            {durationLabel ? <span>{durationLabel}</span> : null}
            {offerPriceLabel ? (
              <span
                data-catalog-card-price
                className="whitespace-nowrap font-semibold text-[#7042c5]"
              >
                {durationLabel ? " · " : null}
                {offerPriceLabel}
              </span>
            ) : null}
          </p>
        ) : null}

        <span data-catalog-card-action className="sr-only">
          {actionLabel}
        </span>
      </Link>
    </article>
  );
}

export const CATALOG_CARD_LAYOUTS = [
  "practice",
  "course",
  "audiobook",
  "release",
  "post",
] as const satisfies readonly PublicationClass[];
