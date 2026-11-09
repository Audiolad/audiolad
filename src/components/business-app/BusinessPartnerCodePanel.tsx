"use client";

import { useId, useState } from "react";

import { BusinessPartnerTerms } from "@/components/business-app/BusinessPartnerPrice";
import { setPartnerQuote, usePartnerQuote } from "@/components/business-app/partner-quote-store";
import {
  formatPartnerCode,
  normalizePartnerCode,
  parsePartnerQuote,
  partnerCodeErrorText,
  partnerQuoteIsDiscounted,
  PARTNER_CODE_RESERVATION_HINT,
} from "@/lib/business/partner-codes";

/**
 * «У меня есть подарочный код» in «Подписка», next to the coming payment (Oriy, 8142d69a).
 * Collapsed by default; never a permanent field on the player home. Hidden once the account
 * already has a personal price (one code per account).
 */
export default function BusinessPartnerCodePanel({ canPay }: { canPay: boolean }) {
  const quote = usePartnerQuote(canPay);
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [applied, setApplied] = useState(false);
  const id = useId();

  if (!canPay || !quote) return null;
  if (quote.source === "entitlement" || quote.source === "finished") return null;
  if (quote.source === "reserved" && !applied) return null;

  const submit = async () => {
    const code = normalizePartnerCode(value);
    if (!code) {
      setError(partnerCodeErrorText("partner_code_invalid"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/business/partner-code", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const payload = (await response.json().catch(() => null)) as { quote?: unknown; error?: string } | null;
      const next = response.ok ? parsePartnerQuote(payload?.quote) : null;
      if (!response.ok || !next) {
        setError(partnerCodeErrorText(payload?.error ?? "internal_error"));
        return;
      }
      setPartnerQuote(next);
      setApplied(true);
      setValue(formatPartnerCode(code));
    } catch {
      setError(partnerCodeErrorText("internal_error"));
    } finally {
      setBusy(false);
    }
  };

  if (applied && partnerQuoteIsDiscounted(quote)) {
    return (
      <div className="space-y-2" data-testid="biz-partner-code-applied">
        <p className="text-sm font-semibold text-[var(--biz-text)]" role="status">Код применён. Цена закрепится за аккаунтом при первой оплате.</p>
        <BusinessPartnerTerms quote={quote} />
      </div>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        className="text-sm font-semibold text-[var(--biz-text)] underline underline-offset-2 business-app-focus-ring"
        onClick={() => setOpen(true)}
        aria-expanded={false}
        aria-controls={id}
        data-testid="biz-partner-code-toggle"
      >
        У меня есть подарочный код
      </button>
    );
  }

  return (
    <div className="space-y-2" id={id} data-testid="biz-partner-code-panel">
      <label htmlFor={`${id}-input`} className="block text-sm font-semibold text-[var(--biz-text)]">
        Подарочный код
      </label>
      <p className="text-sm leading-6 text-[var(--biz-text-muted)]">
        Введите код из персонального приглашения. До оплаты вы увидите новую цену рядом с обычной – для всех точек
        аккаунта.
      </p>
      <p className="text-sm leading-6 text-[var(--biz-text-muted)]" data-testid="biz-partner-code-hold-hint">
        {PARTNER_CODE_RESERVATION_HINT}
      </p>
      <input
        id={`${id}-input`}
        className="business-app-input"
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        placeholder="Код из приглашения"
        value={value}
        disabled={busy}
        onChange={(event) => {
          setValue(event.target.value);
          setError(null);
        }}
        data-testid="biz-partner-code-input"
      />
      <button
        type="button"
        className="business-app-btn business-app-btn-primary business-app-focus-ring"
        onClick={submit}
        disabled={busy || !value.trim()}
        data-testid="biz-partner-code-apply"
      >
        Применить код
      </button>
      {error ? <p role="alert" data-testid="biz-partner-code-error">{error}</p> : null}
    </div>
  );
}
