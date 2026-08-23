"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import BuyPracticeButton from "@/components/BuyPracticeButton";
import PurchaseConsent from "@/components/PurchaseConsent";
import { formatRubles } from "@/lib/products/price-format";
import {
  formatTimerMmSs,
  interpolateCtaText,
  resolveOfferDisplayPricing,
} from "@/lib/quick-offers/pricing";
import {
  persistOfferTimer,
  readBrowserOfferExpiresAt,
  readIssuedOfferExpiresAt,
  rememberIssuedOfferExpiresAt,
  writeBrowserOfferExpiresAt,
} from "@/lib/quick-offers/timer";
import type { PublicQuickOfferDto } from "@/lib/quick-offers/types";

type QuickOfferPublicPageProps = {
  offer: PublicQuickOfferDto;
  preview?: boolean;
  initialExpiresAt?: string | null;
};

function subscribeOfferTimer(onStoreChange: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key?.startsWith("al_qo_")) {
      onStoreChange();
    }
  };

  window.addEventListener("storage", onStorage);
  return () => window.removeEventListener("storage", onStorage);
}

function readClientOfferExpiresAt(
  offerId: string,
  durationSeconds: number,
  initialExpiresAt: string | null,
): string {
  const remembered = readIssuedOfferExpiresAt(offerId, durationSeconds);

  if (remembered) {
    return remembered;
  }

  const stored =
    readBrowserOfferExpiresAt(offerId, durationSeconds) ?? initialExpiresAt;
  const persisted = persistOfferTimer({
    offerId,
    durationSeconds,
    storedExpiresAt: stored,
  });

  rememberIssuedOfferExpiresAt(offerId, durationSeconds, persisted.expiresAt);
  writeBrowserOfferExpiresAt({
    offerId,
    durationSeconds,
    expiresAt: persisted.expiresAt,
  });

  return persisted.expiresAt;
}

function resolveMidCtaIndex(total: number, configured: number | null): number {
  if (total < 4) {
    return -1;
  }

  if (configured && configured > 0 && configured < total) {
    return configured;
  }

  return Math.floor(total / 2);
}

function PriceBlock({
  regularPrice,
  promoPrice,
  showPromo,
  size = "default",
}: {
  regularPrice: number;
  promoPrice: number;
  showPromo: boolean;
  size?: "default" | "compact";
}) {
  const promoClass =
    size === "compact"
      ? "text-[22px] font-semibold text-[#25135c]"
      : "text-[32px] font-semibold leading-none text-[#25135c]";
  const regularClass =
    size === "compact"
      ? "text-sm text-[#9a91b8] line-through"
      : "text-[18px] text-[#9a91b8] line-through";

  if (showPromo) {
    return (
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className={regularClass}>{formatRubles(regularPrice)}</span>
        <span className={promoClass}>{formatRubles(promoPrice)}</span>
      </div>
    );
  }

  return <p className={promoClass}>{formatRubles(regularPrice)}</p>;
}

function OfferCta({
  offer,
  chargePrice,
  expiresAt,
  disabled,
  className,
}: {
  offer: PublicQuickOfferDto;
  chargePrice: number;
  expiresAt: string | null;
  disabled?: boolean;
  className: string;
}) {
  const label = interpolateCtaText(offer.cta_text, String(chargePrice));

  if (disabled) {
    return (
      <button type="button" disabled className={`${className} opacity-60`}>
        {label}
      </button>
    );
  }

  return (
    <BuyPracticeButton
      practiceSlug={offer.practice_slug}
      practiceId={offer.practice_id}
      authorId={offer.author_id}
      productPriceMinorSnapshot={chargePrice * 100}
      purchaseSurface="quick_offer"
      quickOfferId={offer.id}
      offerWindowExpiresAt={expiresAt}
      label={label}
      signInReturnPath={`/offers/${offer.slug}`}
      className={className}
    />
  );
}

export default function QuickOfferPublicPage({
  offer,
  preview = false,
  initialExpiresAt = null,
}: QuickOfferPublicPageProps) {
  const heroRef = useRef<HTMLElement | null>(null);
  const expiresAt = useSyncExternalStore(
    subscribeOfferTimer,
    () =>
      readClientOfferExpiresAt(
        offer.id,
        offer.timer_duration_seconds,
        initialExpiresAt,
      ),
    () => initialExpiresAt,
  );
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [showSticky, setShowSticky] = useState(false);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);

    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    const node = heroRef.current;

    if (!node || typeof IntersectionObserver === "undefined") {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        setShowSticky(!entry?.isIntersecting);
      },
      { threshold: 0.15 },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const pricing = useMemo(
    () =>
      resolveOfferDisplayPricing({
        regularPrice: offer.regular_price,
        promoPrice: offer.promo_price,
        nowMs,
        durationSeconds: offer.timer_duration_seconds,
        expiresAt,
      }),
    [
      expiresAt,
      nowMs,
      offer.promo_price,
      offer.regular_price,
      offer.timer_duration_seconds,
    ],
  );

  const remainingLabel = formatTimerMmSs(
    persistOfferTimer({
      offerId: offer.id,
      durationSeconds: offer.timer_duration_seconds,
      storedExpiresAt: expiresAt,
      nowMs,
    }).remainingSeconds,
  );

  const midIndex = resolveMidCtaIndex(
    offer.materials.length,
    offer.mid_cta_after_count,
  );
  const buyButtonClass =
    "w-full rounded-full bg-[#7042c5] px-5 py-4 text-[17px] font-semibold text-white shadow-[0_10px_24px_rgba(112,66,197,0.22)]";

  function renderCtaStack(size: "default" | "compact" = "default") {
    return (
      <div className="space-y-3">
        <PriceBlock
          regularPrice={pricing.regularPrice}
          promoPrice={pricing.promoPrice}
          showPromo={pricing.showPromo}
          size={size}
        />
        {pricing.showPromo ? (
          <p className="text-sm font-medium text-[#7042c5]">
            Специальная цена действует ещё {remainingLabel}
          </p>
        ) : (
          <p className="text-sm text-[#7d70a2]">
            Специальная цена больше не действует
          </p>
        )}
        <OfferCta
          offer={offer}
          chargePrice={pricing.chargePrice}
          expiresAt={expiresAt}
          disabled={preview}
          className={buyButtonClass}
        />
        <p className="text-center text-xs text-[#9a91b8]">
          Мгновенный доступ после оплаты
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#fbf8ff] text-[#25135c]">
      <div className="mx-auto w-full max-w-[430px] px-4 pb-28 pt-5 lg:max-w-[760px] lg:px-6 lg:pb-16">
        <header className="mb-5 flex items-center justify-between">
          <Link
            href="/"
            className="text-[22px] font-semibold text-[#6234b5] focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
          >
            АудиоЛад
          </Link>
          {preview ? (
            <span className="rounded-full bg-[#fff4df] px-2.5 py-1 text-[11px] font-medium text-[#b67a1d]">
              Предпросмотр
            </span>
          ) : null}
        </header>

        <section ref={heroRef} className="space-y-5">
          <div className="overflow-hidden rounded-[28px] bg-[#efe6fb] shadow-[0_16px_40px_rgba(37,19,92,0.08)]">
            {offer.hero_image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={offer.hero_image_url}
                alt=""
                className="aspect-square w-full object-cover"
              />
            ) : (
              <div className="flex aspect-square items-center justify-center text-sm text-[#7d70a2]">
                Обложка
              </div>
            )}
          </div>

          <h1 className="text-[26px] font-semibold leading-tight lg:text-[32px]">
            {offer.title}
          </h1>
          <p className="whitespace-pre-line text-[15px] leading-6 text-[#5f5484] lg:text-[16px] lg:leading-7">
            {offer.short_description}
          </p>
          {renderCtaStack()}
        </section>

        <section className="mt-10 space-y-4">
          <h2 className="text-[22px] font-semibold">Что внутри</h2>
          <div className="grid grid-cols-2 gap-3 lg:gap-4">
            {offer.materials.map((material, index) => (
              <div key={material.id} className="contents">
                <article className="min-w-0">
                  <div className="overflow-hidden rounded-[18px] bg-[#efe6fb] shadow-[0_8px_20px_rgba(37,19,92,0.06)]">
                    {material.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={material.image_url}
                        alt=""
                        className="aspect-[3/4] w-full object-cover"
                      />
                    ) : (
                      <div className="flex aspect-[3/4] items-center justify-center text-xs text-[#7d70a2]">
                        Карточка
                      </div>
                    )}
                  </div>
                  <p className="mt-2 truncate text-center text-[13px] font-medium tracking-wide text-[#5f5484]">
                    {material.display_label}
                  </p>
                </article>
                {index + 1 === midIndex ? (
                  <div className="col-span-2 rounded-[24px] border border-[#eadff8] bg-white px-4 py-5">
                    <p className="text-[18px] font-semibold">{offer.title}</p>
                    <div className="mt-3">{renderCtaStack("compact")}</div>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </section>

        <section className="mt-10 space-y-4 rounded-[28px] border border-[#eadff8] bg-white px-4 py-6">
          {offer.hero_image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={offer.hero_image_url}
              alt=""
              className="mx-auto aspect-square w-40 rounded-[22px] object-cover"
            />
          ) : null}
          <h2 className="text-center text-[22px] font-semibold">{offer.title}</h2>
          {renderCtaStack()}
          <PurchaseConsent />
        </section>
      </div>

      {showSticky && !preview ? (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[#eadff8] bg-white/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur lg:hidden">
          <div className="mx-auto flex max-w-[430px] items-center gap-3">
            <span className="shrink-0 text-[18px] font-semibold">
              {formatRubles(pricing.chargePrice)}
            </span>
            <OfferCta
              offer={offer}
              chargePrice={pricing.chargePrice}
              expiresAt={expiresAt}
              className="flex-1 rounded-full bg-[#7042c5] px-4 py-3 text-sm font-semibold text-white"
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
