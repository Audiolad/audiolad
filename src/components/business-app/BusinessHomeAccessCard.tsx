"use client";

import Link from "next/link";
import { useState } from "react";

import { useBusinessChromeAccess } from "@/components/business-app/BusinessAccessLine";
import { useBusinessDomain } from "@/components/business-app/BusinessDomainProvider";
import {
  BUSINESS_GIFT_TITLE,
  BUSINESS_SUBSCRIPTION_NOTE,
  businessGiftRulesText,
} from "@/lib/access-grants/copy";
import { formatMoscowDateTime, ruDaysWord, trialDaysLeft } from "@/lib/access-grants/policy";
import { BUSINESS_OFFER_HREF, BUSINESS_OFFER_TITLE, BUSINESS_ONBOARDING_HREF } from "@/lib/business/offer";
import { formatBusinessMonthlyPrice } from "@/lib/business/plan";
import type { BusinessPayErrorCode } from "@/lib/business/subscription-checkout";

type PayError = { code: BusinessPayErrorCode; href: string | null };

function unavailablePayError(): PayError {
  return { code: "internal_error", href: null };
}

function payErrorFromPayload(payload: { error?: string; href?: string } | null): PayError {
  return {
    code: (payload?.error as BusinessPayErrorCode) || "internal_error",
    href: typeof payload?.href === "string" ? payload.href : null,
  };
}

/** Owner payment on Главная. A manager and a venue device do not see the button. */
export default function BusinessHomeAccessCard() {
  const access = useBusinessChromeAccess();
  const domain = useBusinessDomain();
  const canPay = domain.status === "authenticated" && domain.canPay;
  const [accepted, setAccepted] = useState(domain.status === "authenticated" && domain.offerAccepted);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<PayError | null>(null);

  if ((access.mode !== "trial" && access.mode !== "paid" && access.mode !== "grace" && access.mode !== "offer") || !access.endsAt) {
    return null;
  }

  const label = formatMoscowDateTime(new Date(access.endsAt));
  const pay = (
    <BusinessPayControls
      canPay={canPay}
      accepted={accepted}
      busy={busy}
      error={error}
      onAccept={async () => {
        setBusy(true);
        setError(null);
        try {
          const response = await fetch("/api/business/subscription/accept", {
            method: "POST",
            credentials: "same-origin",
            cache: "no-store",
          });
          const payload = (await response.json().catch(() => null)) as { error?: string; href?: string } | null;
          if (!response.ok) {
            setError(payErrorFromPayload(payload));
            return;
          }
          setAccepted(true);
        } catch {
          setError(unavailablePayError());
        } finally {
          setBusy(false);
        }
      }}
      onPay={async () => {
        setBusy(true);
        setError(null);
        const params = new URLSearchParams({ space: "cafe" });
        void fetch(`/api/business/workspace/state?${params.toString()}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          cache: "no-store",
          body: JSON.stringify({ kind: "offer_click" }),
        }).catch(() => {
          /* The payment link is the action that matters. */
        });
        try {
          const response = await fetch("/api/business/subscription/checkout", {
            method: "POST",
            credentials: "same-origin",
            cache: "no-store",
            headers: { "Idempotency-Key": crypto.randomUUID() },
          });
          const payload = (await response.json().catch(() => null)) as {
            error?: string;
            href?: string;
            payment_url?: string;
          } | null;
          if (!response.ok || typeof payload?.payment_url !== "string") {
            setError(payErrorFromPayload(payload));
            setBusy(false);
            return;
          }
          window.location.assign(payload.payment_url);
        } catch {
          setError(unavailablePayError());
          setBusy(false);
        }
      }}
    />
  );

  if (access.mode === "grace" && access.graceEndsAt) {
    const days = trialDaysLeft(new Date(access.graceEndsAt), new Date());
    return (
      <section className="business-app-card mb-5 space-y-3" id="dostup" data-testid="biz-home-access" data-mode="grace">
        <h2 className="text-[1.15rem] font-bold text-[var(--biz-text)]">Срок закончился</h2>
        <p data-testid="biz-home-grace">
          Музыка играет ещё {days} {ruDaysWord(days)}, затем остановится. Конец срока был {label}.
        </p>
        {pay}
      </section>
    );
  }

  if (access.mode === "paid") {
    return (
      <section className="business-app-card mb-5 space-y-3" id="dostup" data-testid="biz-home-access" data-mode="paid">
        <p data-testid="biz-home-paid-until">Подписка до {label}</p>
        {pay}
      </section>
    );
  }

  if (access.mode === "offer") {
    return (
      <section className="business-app-card mb-5 space-y-3" id="dostup" data-testid="biz-home-access" data-mode="offer">
        <h2 className="text-[1.15rem] font-bold text-[var(--biz-text)]">Подписка {formatBusinessMonthlyPrice()} за 30 дней</h2>
        <p data-testid="biz-home-ended">Подарочный период закончился {label}.</p>
        <p>{BUSINESS_SUBSCRIPTION_NOTE}</p>
        {pay}
      </section>
    );
  }

  const days = trialDaysLeft(new Date(access.endsAt), new Date());
  return (
    <section className="business-app-card mb-5 space-y-3" id="dostup" data-testid="biz-home-access" data-mode="trial">
      <p className="business-app-eyebrow">{BUSINESS_GIFT_TITLE}</p>
      <p className="mt-2 text-[1.15rem] font-bold text-[var(--biz-text)]" data-testid="biz-home-days">
        Осталось {days} {ruDaysWord(days)}
        <span className="mt-1 block text-base font-normal text-[var(--biz-text-muted)]" data-testid="biz-home-until">до {label}</span>
      </p>
      <p className="text-sm leading-6 text-[var(--biz-text-muted)]" data-testid="biz-home-rules">{businessGiftRulesText()}</p>
      {pay}
    </section>
  );
}

function BusinessPayControls({
  canPay,
  accepted,
  busy,
  error,
  onAccept,
  onPay,
}: {
  canPay: boolean;
  accepted: boolean;
  busy: boolean;
  error: PayError | null;
  onAccept: () => void;
  onPay: () => void;
}) {
  if (!canPay) return null;
  return (
    <div className="space-y-3" data-testid="biz-home-pay">
      <p className="text-sm leading-6 text-[var(--biz-text-muted)]">
        {formatBusinessMonthlyPrice()} за 30 дней, картой или по СБП. Автосписания нет.
      </p>
      {accepted ? (
        <button
          type="button"
          className="business-app-btn business-app-btn-primary business-app-focus-ring"
          onClick={onPay}
          disabled={busy}
          data-testid="biz-home-pay-button"
        >
          Оплатить
        </button>
      ) : (
        <>
          <p>
            <Link href={BUSINESS_OFFER_HREF} data-testid="biz-home-offer-link">
              {BUSINESS_OFFER_TITLE}
            </Link>
          </p>
          <button
            type="button"
            className="business-app-btn business-app-btn-primary business-app-focus-ring"
            onClick={onAccept}
            disabled={busy}
            data-testid="biz-home-accept"
          >
            Принять условия
          </button>
        </>
      )}
      {error ? <BusinessPayError error={error} /> : null}
    </div>
  );
}

function BusinessPayError({ error }: { error: PayError }) {
  if (error.code === "offer_acceptance_required") {
    return (
      <p role="alert" data-testid="biz-home-pay-error">
        Сначала примите{" "}
        <Link href={error.href || BUSINESS_OFFER_HREF}>{BUSINESS_OFFER_TITLE}</Link>.
      </p>
    );
  }
  if (error.code === "not_organization_owner") {
    return (
      <p role="alert" data-testid="biz-home-pay-error">
        Оплатить может владелец аккаунта.{" "}
        <Link href={error.href || BUSINESS_ONBOARDING_HREF}>Подключить кофейню</Link>.
      </p>
    );
  }
  if (error.code === "venue_device") {
    return <p role="alert" data-testid="biz-home-pay-error">На устройстве в зале оплату оформить нельзя.</p>;
  }
  if (error.code === "support_mode_consent_forbidden") {
    return <p role="alert" data-testid="biz-home-pay-error">В режиме сопровождения оплату оформить нельзя.</p>;
  }
  if (error.code === "payments_not_configured") {
    return <p role="alert" data-testid="biz-home-pay-error">Оплата временно недоступна. Попробуйте ещё раз позже.</p>;
  }
  return <p role="alert" data-testid="biz-home-pay-error">Не удалось перейти к оплате. Попробуйте ещё раз.</p>;
}
