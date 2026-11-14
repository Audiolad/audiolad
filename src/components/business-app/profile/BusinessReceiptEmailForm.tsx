"use client";

import { useId, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { saveBusinessReceiptEmail } from "@/app/business-app/profile/actions";
import { normalizeBusinessReceiptEmail } from "@/lib/business/subscription-checkout";
import { isNewEmailDomainAllowed, NEW_EMAIL_DOMAIN_NOT_ALLOWED_MESSAGE, NEW_EMAIL_FIELD_HINT } from "@/lib/auth/email";
import { BusinessEmailTakenActions } from "@/components/business-app/profile/BusinessEmailTakenActions";
import "./profile.css";

/**
 * «Почта для чеков» (t1343u). Only for an owner account without its own email (guest start):
 * the address typed at payment is remembered here and prefilled next to «Оплатить».
 */
export default function BusinessReceiptEmailForm({ receiptEmail, anonymous = false, login = false }: { receiptEmail: string | null; anonymous?: boolean; login?: boolean }) {
  const hintId = useId();
  const field = useRef<HTMLInputElement>(null);
  const [taken, setTaken] = useState(false);
  const [value, setValue] = useState(receiptEmail ?? "");
  const [saved, setSaved] = useState(receiptEmail ?? "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage(""); setError(""); setTaken(false);
    const email = normalizeBusinessReceiptEmail(value);
    if (!email) { setError("Проверьте почту – похоже, в адресе ошибка."); return; }
    if (!isNewEmailDomainAllowed(email, "client")) { setError(NEW_EMAIL_DOMAIN_NOT_ALLOWED_MESSAGE); return; }
    setBusy(true);
    try {
      const result = await saveBusinessReceiptEmail({ receiptEmail: email });
      if (!result.ok) { setError(result.error); setTaken("code" in result && result.code === "receipt_email_taken"); return; }
      setValue(result.receiptEmail);
      setSaved(result.receiptEmail);
      setMessage(anonymous ? "Почта сохранена. Теперь по ней можно войти в кабинет." : "Сохранено. Следующий чек придёт на эту почту.");
      router.refresh();
    } catch { setError("Не удалось сохранить почту. Попробуйте ещё раз."); }
    finally { setBusy(false); }
  };

  const unchanged = !anonymous && normalizeBusinessReceiptEmail(value) === (saved || null);
  return (
    <form onSubmit={save} className="business-profile-form space-y-3" aria-label={login ? "Почта для входа" : "Почта для чеков"}
      data-testid="biz-profile-receipt-email-form">
      <label htmlFor={login ? "business-login-email" : "business-receipt-email"}>{login ? "Почта для входа" : "Почта для чеков"}</label>
      <input ref={field} id={login ? "business-login-email" : "business-receipt-email"} name="receiptEmail" type="email" inputMode="email" autoComplete="email"
        value={value} placeholder="Ваша почта" disabled={busy}
        onChange={(e) => { setValue(e.target.value); setMessage(""); setError(""); }}
        aria-describedby={hintId} data-testid="biz-profile-receipt-email" />
      {anonymous ? <p className="text-sm">Эта почта станет почтой для входа в кабинет.</p> : null}
      <p className="text-sm" data-testid="biz-profile-email-ru-hint">{NEW_EMAIL_FIELD_HINT}</p>
      <p id={hintId} className="text-sm text-[var(--biz-text-muted)]">
        {saved
          ? "Сюда приходят чеки об оплате подписки. Эта же почта подставится при следующей оплате."
          : "Сюда будут приходить чеки об оплате подписки. Её можно указать и при оплате – мы запомним."}
      </p>
      <button type="submit" disabled={busy || unchanged} className="business-app-btn business-app-btn-cta business-app-focus-ring"
        data-testid="biz-profile-receipt-email-save">
        {busy ? "Сохраняем…" : login ? "Сохранить почту" : "Сохранить"}
      </button>
      <p role="status">{message}</p>
      {error ? <div role="alert"><p>{error}</p>{taken ? <BusinessEmailTakenActions onChange={() => field.current?.focus()} /> : null}</div> : null}
    </form>
  );
}
