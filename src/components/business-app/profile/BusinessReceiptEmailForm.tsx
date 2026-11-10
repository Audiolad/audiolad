"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { saveBusinessReceiptEmail } from "@/app/business-app/profile/actions";
import { normalizeBusinessReceiptEmail } from "@/lib/business/subscription-checkout";
import "./profile.css";

/**
 * «Почта для чеков» (t1343u). Only for an owner account without its own email (guest start):
 * the address typed at payment is remembered here and prefilled next to «Оплатить».
 */
export default function BusinessReceiptEmailForm({ receiptEmail }: { receiptEmail: string | null }) {
  const [value, setValue] = useState(receiptEmail ?? "");
  const [saved, setSaved] = useState(receiptEmail ?? "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage(""); setError("");
    const email = normalizeBusinessReceiptEmail(value);
    if (!email) { setError("Укажите почту в виде name@example.ru."); return; }
    setBusy(true);
    try {
      const result = await saveBusinessReceiptEmail({ receiptEmail: email });
      if (!result.ok) { setError(result.error); return; }
      setValue(result.receiptEmail);
      setSaved(result.receiptEmail);
      setMessage("Сохранено. Следующий чек придёт на эту почту.");
      router.refresh();
    } catch { setError("Не удалось сохранить почту. Попробуйте ещё раз."); }
    finally { setBusy(false); }
  };

  const unchanged = normalizeBusinessReceiptEmail(value) === (saved || null);
  return (
    <form onSubmit={save} className="business-profile-form space-y-3" aria-label="Почта для чеков"
      data-testid="biz-profile-receipt-email-form">
      <label htmlFor="business-receipt-email">Почта для чеков</label>
      <input id="business-receipt-email" name="receiptEmail" type="email" inputMode="email" autoComplete="email"
        value={value} placeholder="Ваша почта" disabled={busy}
        onChange={(e) => { setValue(e.target.value); setMessage(""); setError(""); }}
        aria-describedby="business-receipt-email-hint" data-testid="biz-profile-receipt-email" />
      <p id="business-receipt-email-hint" className="text-sm text-[var(--biz-text-muted)]">
        {saved
          ? "Сюда приходят чеки об оплате подписки. Эта же почта подставится при следующей оплате."
          : "Сюда будут приходить чеки об оплате подписки. Её можно указать и при оплате – мы запомним."}
      </p>
      <button type="submit" disabled={busy || unchanged} className="business-app-btn business-app-btn-cta business-app-focus-ring"
        data-testid="biz-profile-receipt-email-save">
        {busy ? "Сохраняем…" : "Сохранить"}
      </button>
      <p role="status">{message}</p>
      {error ? <p role="alert">{error}</p> : null}
    </form>
  );
}
