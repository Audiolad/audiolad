"use client";

import { useState } from "react";

import { useBusinessChromeAccess } from "@/components/business-app/BusinessAccessLine";
import {
  BUSINESS_GIFT_TITLE,
  BUSINESS_SUBSCRIPTION_NOTE,
  businessGiftRulesText,
} from "@/lib/access-grants/copy";
import { formatMoscowDateTime, ruDaysWord, trialDaysLeft } from "@/lib/access-grants/policy";
import { BUSINESS_PLAN_PERIOD_LABEL, formatBusinessMonthlyPrice } from "@/lib/business/plan";

/** Trial status and terms, moved here from the shared Music page. */
export default function BusinessHomeAccessCard() {
  const access = useBusinessChromeAccess();
  const [offerNoted, setOfferNoted] = useState(false);
  if ((access.mode !== "trial" && access.mode !== "paid" && access.mode !== "offer") || !access.endsAt) return null;
  const label = formatMoscowDateTime(new Date(access.endsAt));
  const offer = () => {
    setOfferNoted(true);
    const params = new URLSearchParams({ space: "cafe" });
    void fetch(`/api/business/workspace/state?${params.toString()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      cache: "no-store",
      body: JSON.stringify({ kind: "offer_click" }),
    }).catch(() => {
      /* The subscribe button stays on this screen. Nothing is charged. */
    });
  };
  if (access.mode === "paid") {
    return (
      <section className="business-app-card mb-5" id="dostup" data-testid="biz-home-access" data-mode="paid">
        <p data-testid="biz-home-paid-until">Подписка до {label}</p>
      </section>
    );
  }
  if (access.mode === "offer") {
    return (
      <section className="business-app-card mb-5 space-y-3" id="dostup" data-testid="biz-home-access" data-mode="offer">
        <h2 className="text-[1.15rem] font-bold text-[var(--biz-text)]">Подписка {formatBusinessMonthlyPrice()} {BUSINESS_PLAN_PERIOD_LABEL}</h2>
        <p data-testid="biz-home-ended">Подарочный период закончился {label}.</p>
        <p>{BUSINESS_SUBSCRIPTION_NOTE}</p>
        <p className="text-sm leading-6 text-[var(--biz-text-muted)]" data-testid="biz-home-rules">{businessGiftRulesText()}</p>
        <button type="button" className="business-app-btn business-app-btn-primary business-app-focus-ring" onClick={offer} data-testid="biz-home-subscribe">
          Оформить подписку
        </button>
        {offerNoted ? <p data-testid="biz-home-offer-noted">Запрос отмечен. Деньги не списываются.</p> : null}
      </section>
    );
  }
  const days = trialDaysLeft(new Date(access.endsAt), new Date());
  return (
    <section className="business-app-card mb-5" id="dostup" data-testid="biz-home-access" data-mode="trial">
      <p className="business-app-eyebrow">{BUSINESS_GIFT_TITLE}</p>
      <p className="mt-2 text-[1.15rem] font-bold text-[var(--biz-text)]" data-testid="biz-home-days">
        Осталось {days} {ruDaysWord(days)}
        <span className="mt-1 block text-base font-normal text-[var(--biz-text-muted)]" data-testid="biz-home-until">до {label}</span>
      </p>
      <p className="mt-3 text-sm leading-6 text-[var(--biz-text-muted)]" data-testid="biz-home-rules">{businessGiftRulesText()}</p>
    </section>
  );
}
