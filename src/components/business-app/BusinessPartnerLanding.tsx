"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import BusinessGuestStartCta from "@/components/business-app/BusinessGuestStartCta";
import { useBusinessHostname } from "@/components/business-app/BusinessDomainProvider";
import { BusinessStruckPrice } from "@/components/business-app/BusinessPartnerPrice";
import { setPartnerQuote } from "@/components/business-app/partner-quote-store";
import { BUSINESS_GIFT_CTA, BUSINESS_GIFT_TITLE } from "@/lib/access-grants/copy";
import { businessAuthHref } from "@/lib/access-grants/paths";
import {
  parsePartnerQuote,
  partnerCodeErrorText,
  partnerDiscountPercent,
  partnerQuoteIsDiscounted,
  ruPeriodsWord,
  PARTNER_CODE_RESERVATION_HINT,
} from "@/lib/business/partner-codes";
import { BUSINESS_PAID_PERIOD_DAYS, BUSINESS_PLAN_PERIOD_LABEL } from "@/lib/business/plan";

export type PartnerLandingOffer = {
  code: string;
  unitPriceRub: number;
  standardUnitPriceRub: number;
  discountPeriods: number;
};

type ReserveStatus = "idle" | "loading" | "ready" | "error";

/**
 * Personal link landing (8142d69a / t1328u). Signed-in owners wait for the reservation
 * before «Активировать скидку» opens «Подписка», so the cabinet never shows a stale 799 ₽.
 */
export default function BusinessPartnerLanding({ offer, signedIn }: { offer: PartnerLandingOffer; signedIn: boolean }) {
  const hostname = useBusinessHostname();
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<ReserveStatus>(signedIn ? "loading" : "idle");

  useEffect(() => {
    let stopped = false;
    void fetch("/api/business/partner-code", {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: offer.code }),
    })
      .then(async (response) => {
        const payload = (await response.json().catch(() => null)) as { quote?: unknown; error?: string } | null;
        if (stopped) return;
        if (!response.ok) {
          setError(partnerCodeErrorText(payload?.error ?? "internal_error"));
          if (signedIn) setStatus("error");
          return;
        }
        const quote = parsePartnerQuote(payload?.quote);
        if (quote) setPartnerQuote(quote);
        if (!signedIn) return;
        const finished = quote?.source === "finished";
        if (quote && partnerQuoteIsDiscounted(quote)) {
          setError(null);
          setStatus("ready");
          return;
        }
        setError(
          finished
            ? "Скидка по коду уже использована – дальше обычная цена."
            : "Скидку не удалось закрепить. Обновите страницу или введите код в разделе «Подписка».",
        );
        setStatus("error");
      })
      .catch(() => {
        if (stopped) return;
        setError(partnerCodeErrorText("internal_error"));
        if (signedIn) setStatus("error");
      });
    return () => {
      stopped = true;
    };
  }, [offer.code, signedIn]);

  const periods = offer.discountPeriods;
  const ready = status === "ready";
  const busy = status === "loading";
  return (
    <section className="business-app-card mx-auto max-w-[640px] space-y-4" data-testid="biz-partner-landing">
      <p className="text-sm font-semibold uppercase tracking-wide text-[var(--biz-text-muted)]">Персональное предложение</p>
      <h1 className="text-[1.6rem] font-bold leading-tight text-[var(--biz-text)]">
        АудиоЛад Бизнес со скидкой {partnerDiscountPercent(offer.unitPriceRub, offer.standardUnitPriceRub)}%
      </h1>
      <p className="text-xl">
        <BusinessStruckPrice standardRub={offer.standardUnitPriceRub} priceRub={offer.unitPriceRub} testId="biz-partner-landing-price" />{" "}
        за точку {BUSINESS_PLAN_PERIOD_LABEL}
      </p>
      <ul className="list-disc space-y-1 pl-5 text-sm leading-6 text-[var(--biz-text-muted)]">
        <li>
          Цена действует {periods} {ruPeriodsWord(periods)} по {BUSINESS_PAID_PERIOD_DAYS} дней, считая с первой оплаты.
        </li>
        <li>Одна цена для всех точек аккаунта, в том числе добавленных за это время.</li>
        <li>
          Затем – обычная цена {offer.standardUnitPriceRub} ₽ за точку {BUSINESS_PLAN_PERIOD_LABEL}. Автосписания нет.
        </li>
        <li>Сначала – {BUSINESS_GIFT_TITLE.toLowerCase()}: без карты, они не входят в эти оплаты.</li>
        <li>{PARTNER_CODE_RESERVATION_HINT}</li>
      </ul>
      {error ? <p role="alert" data-testid="biz-partner-landing-error">{error}</p> : null}
      {signedIn ? (
        ready ? (
          <Link
            href="/profile#podpiska"
            className="business-app-btn business-app-btn-cta business-app-focus-ring"
            data-testid="biz-partner-landing-pay"
          >
            Активировать скидку
          </Link>
        ) : busy ? (
          <button
            type="button"
            className="business-app-btn business-app-btn-cta business-app-focus-ring"
            disabled
            aria-busy
            data-testid="biz-partner-landing-pay-pending"
          >
            Закрепляем скидку…
          </button>
        ) : (
          // Any message that sends the owner elsewhere links straight there (Sergey's rule).
          <Link
            href="/profile#podpiska"
            className="business-app-btn business-app-btn-cta business-app-focus-ring"
            data-testid="biz-partner-landing-to-subscription"
          >
            Перейти в подписку
          </Link>
        )
      ) : (
        <BusinessGuestStartCta
          href={businessAuthHref(hostname, "sign-up", true)}
          className="business-app-btn business-app-btn-cta business-app-focus-ring"
          testId="biz-partner-landing-start"
        >
          {BUSINESS_GIFT_CTA}
        </BusinessGuestStartCta>
      )}
      <p className="text-sm leading-6 text-[var(--biz-text-muted)]">
        Код личный и действует для одного аккаунта. Новая цена закрепится за аккаунтом при первой оплате.
      </p>
    </section>
  );
}
