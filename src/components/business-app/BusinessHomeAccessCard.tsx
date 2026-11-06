"use client";

import Link from "next/link";
import { useId, useState } from "react";

import { BusinessOfferDocumentLink } from "@/components/business-app/BusinessOfferDocumentLink";
import { useBusinessChromeAccess } from "@/components/business-app/BusinessAccessLine";
import { useBusinessDomain } from "@/components/business-app/BusinessDomainProvider";
import {
  BUSINESS_GIFT_CLOSING_NOTE,
  BUSINESS_GIFT_LICENSE_NOTE,
  BUSINESS_PERIOD_ENDED_PAY_NOTE,
  BUSINESS_SUBSCRIPTION_NOTE,
  businessGiftPriceNote,
} from "@/lib/access-grants/copy";
import { formatMoscowDateTime, ruDaysWord, trialDaysLeft } from "@/lib/access-grants/policy";
import { BUSINESS_OFFER_EDITION, BUSINESS_ONBOARDING_HREF } from "@/lib/business/offer";
import { formatBusinessMonthlyPrice } from "@/lib/business/plan";
import { normalizeBusinessReceiptEmail, type BusinessPayErrorCode } from "@/lib/business/subscription-checkout";

export type PayError = { code: BusinessPayErrorCode; href: string | null };

/** Shown before any request when the account has no email and the field is empty or invalid. */
const RECEIPT_EMAIL_REQUIRED_ERROR = { code: "receipt_email_required" as const, href: null };

function unavailablePayError(): PayError {
  return { code: "internal_error", href: null };
}

function payErrorFromPayload(payload: { error?: string; href?: string } | null): PayError {
  return {
    code: (payload?.error as BusinessPayErrorCode) || "internal_error",
    href: typeof payload?.href === "string" ? payload.href : null,
  };
}

/**
 * Terms acceptance and payment state shared by the access card and the «С чего начать» steps.
 * The return to Главная after payment lands on `#dostup`.
 */
export function useBusinessHomePay() {
  const access = useBusinessChromeAccess();
  const domain = useBusinessDomain();
  const canPay = domain.status === "authenticated" && domain.canPay && !domain.pilotSlots;
  const [accepted, setAccepted] = useState(domain.status === "authenticated" && domain.offerAccepted);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<PayError | null>(null);
  const [askReceiptEmail, setAskReceiptEmail] = useState(
    domain.status === "authenticated" && Boolean(domain.needsReceiptEmail),
  );
  const [receiptEmail, setReceiptEmailState] = useState("");
  const setReceiptEmail = (value: string) => {
    setReceiptEmailState(value);
    if (error?.code === "receipt_email_required") setError(null);
  };

  const accept = async () => {
    setBusy(true);
    setError(null);
    try {
      // The edition linked next to the button; the server refuses a stale one.
      const response = await fetch("/api/business/subscription/accept", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ offerVersion: BUSINESS_OFFER_EDITION.version, offerHash: BUSINESS_OFFER_EDITION.contentHash }),
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
  };

  const pay = async () => {
    const typedEmail = askReceiptEmail ? normalizeBusinessReceiptEmail(receiptEmail) : null;
    if (askReceiptEmail && !typedEmail) {
      setError(RECEIPT_EMAIL_REQUIRED_ERROR);
      return;
    }
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
        headers: { "Idempotency-Key": crypto.randomUUID(), "Content-Type": "application/json" },
        body: JSON.stringify(typedEmail ? { receipt_email: typedEmail } : {}),
      });
      const payload = (await response.json().catch(() => null)) as {
        error?: string;
        href?: string;
        payment_url?: string;
      } | null;
      if (!response.ok || typeof payload?.payment_url !== "string") {
        const next = payErrorFromPayload(payload);
        if (next.code === "receipt_email_required") setAskReceiptEmail(true);
        setError(next);
        setBusy(false);
        return;
      }
      window.location.assign(payload.payment_url);
    } catch {
      setError(unavailablePayError());
      setBusy(false);
    }
  };

  const hasTerm =
    (access.mode === "trial" || access.mode === "paid" || access.mode === "grace" || access.mode === "offer") &&
    Boolean(access.endsAt);

  return {
    access,
    hasTerm,
    canPay,
    accepted,
    busy,
    error,
    accept,
    pay,
    askReceiptEmail,
    receiptEmail,
    setReceiptEmail,
  };
}

/** Owner payment before the first venue. A manager and a venue device do not see the button. */
export default function BusinessHomeAccessCard() {
  const { access, hasTerm, canPay, accepted, busy, error, accept, pay: startPay, askReceiptEmail, receiptEmail, setReceiptEmail } =
    useBusinessHomePay();

  if (!hasTerm || !access.endsAt) {
    return null;
  }

  const label = formatMoscowDateTime(new Date(access.endsAt));
  const pay = (
    <BusinessPayControls
      canPay={canPay}
      accepted={accepted}
      busy={busy}
      error={error}
      onAccept={accept}
      onPay={startPay}
      receiptEmail={askReceiptEmail ? { value: receiptEmail, onChange: setReceiptEmail } : null}
    />
  );

  if (access.mode === "grace") {
    return (
      <section className="business-app-card mb-5 space-y-3" id="dostup" data-testid="biz-home-access" data-mode="grace">
        <h2 className="text-[1.15rem] font-bold text-[var(--biz-text)]">Срок закончился</h2>
        <p data-testid="biz-home-grace">
          {BUSINESS_PERIOD_ENDED_PAY_NOTE} Конец срока был {label}.
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
      <p className="text-[1.15rem] font-bold text-[var(--biz-text)]" data-testid="biz-home-days">
        Осталось {days} {ruDaysWord(days)}
        <span className="mt-1 block text-base font-normal text-[var(--biz-text-muted)]" data-testid="biz-home-until">до {label}</span>
      </p>
      <p className="text-sm leading-6 text-[var(--biz-text-muted)]" data-testid="biz-home-rules">{BUSINESS_GIFT_CLOSING_NOTE}</p>
      <p className="text-sm leading-6 text-[var(--biz-text-muted)]" data-testid="biz-home-license">{BUSINESS_GIFT_LICENSE_NOTE}</p>
      {pay}
    </section>
  );
}

export type ReceiptEmailControl = { value: string; onChange: (value: string) => void } | null;

/**
 * The договор-оферта that «Принять условия» records and «Оплатить» pays under. Opens the same
 * edition in an in-app sheet: no new PWA window, payment form state and music stay.
 */
export function BusinessOfferTermsLink({ testId = "biz-home-offer-link" }: { testId?: string }) {
  return (
    <BusinessOfferDocumentLink
      className="font-semibold text-[var(--biz-text)] underline underline-offset-2 business-app-focus-ring"
      testId={testId}
    />
  );
}

/** Clear text above every «Принять условия»: what is accepted, once per account, with the document link. */
export function BusinessOfferAcceptNote() {
  return (
    <p className="text-sm leading-6 text-[var(--biz-text-muted)]" data-testid="biz-home-accept-note">
      Перед первой оплатой примите договор-оферту – один раз для всего аккаунта и всех точек. Нажимая «Принять
      условия», вы принимаете <BusinessOfferTermsLink />, {BUSINESS_OFFER_EDITION.label.toLowerCase()}.
    </p>
  );
}

/** Shown next to every «Оплатить»: the payment is made under this offer edition. */
export function BusinessOfferAcceptedNote({ testId = "biz-home-terms-accepted" }: { testId?: string } = {}) {
  return (
    <p className="text-sm leading-6 text-[var(--biz-text-muted)]" data-testid={testId}>
      Оплата по договору: <BusinessOfferTermsLink testId={`${testId}-link`} />,{" "}
      {BUSINESS_OFFER_EDITION.label.toLowerCase()}. Принят один раз для всего аккаунта.
    </p>
  );
}

/** Checklist «Примите условия» once done: what was accepted, one tap away. */
export function BusinessOfferAcceptedStepNote() {
  return (
    <p className="text-sm leading-6 text-[var(--biz-text-muted)]" data-testid="biz-home-terms-step-accepted">
      Принят <BusinessOfferTermsLink testId="biz-home-terms-step-link" />,{" "}
      {BUSINESS_OFFER_EDITION.label.toLowerCase()}. Один раз для всего аккаунта и всех точек.
    </p>
  );
}

/** Guest-start accounts have no email; the receipt still needs one. Not saved to the account. */
export function BusinessReceiptEmailField({ control, busy }: { control: NonNullable<ReceiptEmailControl>; busy: boolean }) {
  const id = useId();
  return (
    <div className="space-y-1" data-testid="biz-home-receipt-email">
      <label htmlFor={id} className="block text-sm font-semibold text-[var(--biz-text)]">
        Почта для чека
      </label>
      <input
        id={id}
        type="email"
        inputMode="email"
        autoComplete="email"
        className="business-app-input"
        placeholder="Ваша почта"
        value={control.value}
        disabled={busy}
        onChange={(event) => control.onChange(event.target.value)}
        aria-describedby={`${id}-hint`}
        data-testid="biz-home-receipt-email-input"
      />
      <p id={`${id}-hint`} className="text-sm leading-6 text-[var(--biz-text-muted)]">
        В аккаунте нет почты. Укажите, куда прислать чек об оплате.
      </p>
    </div>
  );
}

export function BusinessPayControls({
  canPay,
  accepted,
  busy,
  error,
  onAccept,
  onPay,
  payLabel = "Оплатить",
  buttonVariant = "primary",
  receiptEmail = null,
}: {
  canPay: boolean;
  accepted: boolean;
  busy: boolean;
  error: PayError | null;
  onAccept: () => void;
  onPay: () => void;
  payLabel?: string;
  buttonVariant?: "primary" | "cta";
  receiptEmail?: ReceiptEmailControl;
  /** @deprecated The offer link is always shown next to «Оплатить». */
  showAcceptedNote?: boolean;
}) {
  if (!canPay) return null;
  return (
    <div className="space-y-3" data-testid="biz-home-pay">
      <p className="text-sm leading-6 text-[var(--biz-text-muted)]">
        {businessGiftPriceNote()}
      </p>
      {accepted ? (
        <>
          <BusinessOfferAcceptedNote />
          {receiptEmail ? <BusinessReceiptEmailField control={receiptEmail} busy={busy} /> : null}
          <button
            type="button"
            className={`business-app-btn business-app-btn-${buttonVariant} business-app-focus-ring`}
            onClick={onPay}
            disabled={busy}
            data-testid="biz-home-pay-button"
          >
            {payLabel}
          </button>
        </>
      ) : (
        <>
          <BusinessOfferAcceptNote />
          <button
            type="button"
            className={`business-app-btn business-app-btn-${buttonVariant} business-app-focus-ring`}
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

export function BusinessPayError({ error }: { error: PayError }) {
  if (error.code === "offer_acceptance_required") {
    return (
      <p role="alert" data-testid="biz-home-pay-error">
        Сначала примите договор-оферту: <BusinessOfferTermsLink testId="biz-home-pay-error-offer-link" />.
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
  if (error.code === "receipt_email_required") {
    return (
      <p role="alert" data-testid="biz-home-pay-error">
        Укажите почту для чека и нажмите кнопку оплаты ещё раз.
      </p>
    );
  }
  if (error.code === "payments_not_configured") {
    return <p role="alert" data-testid="biz-home-pay-error">Оплата временно недоступна. Попробуйте ещё раз позже.</p>;
  }
  return <p role="alert" data-testid="biz-home-pay-error">Не удалось перейти к оплате. Попробуйте ещё раз.</p>;
}
