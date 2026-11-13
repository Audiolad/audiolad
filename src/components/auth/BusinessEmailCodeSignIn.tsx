"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { requestBusinessLoginOtp } from "@/app/(platform)/auth/sign-in/otp-actions";
import { createClient } from "@/lib/supabase/client";
import { getSafeNextPath } from "@/lib/auth/routes";
import { withAuthNetworkTimeout } from "@/lib/auth/network-timeout";

export default function BusinessEmailCodeSignIn({ next, coffee }: { next: string | null; coffee: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [resendAt, setResendAt] = useState(0);
  async function send() {
    setBusy(true); setError("");
    try {
      const result = await withAuthNetworkTimeout(() => requestBusinessLoginOtp({ email, next }));
      setMessage(result.message); setStep("code"); setResendAt(Date.now() + 60_000);
    } catch { setError("Не удалось запросить код. Попробуйте ещё раз."); }
    finally { setBusy(false); }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (step === "email") { await send(); return; }
    if (!/^\d{6}$/.test(token)) { setError("Введите 6 цифр из письма."); return; }
    setBusy(true); setError("");
    try {
      const { error } = await withAuthNetworkTimeout(() => createClient().auth.verifyOtp({ email: email.trim().toLowerCase(), token, type: "email" }));
      if (error) { setError("Не удалось войти. Проверьте код или запросите новый."); return; }
      router.replace(getSafeNextPath(next, coffee ? "/cabinet" : undefined)); router.refresh();
    } catch { setError("Не удалось войти. Попробуйте ещё раз."); }
    finally { setBusy(false); }
  }
  return <section className="mt-6 space-y-3 rounded-[20px] border border-[var(--biz-border,#ddcfef)] p-4" data-testid="auth-email-code">
    <p className="text-sm">Начинали без регистрации? Если при оплате вы указали почту, войдите по коду из письма на эту почту.</p>
    <button type="button" className="text-sm font-semibold underline" onClick={() => setOpen(!open)} aria-expanded={open}>Войти по коду из письма</button>
    {open ? <form onSubmit={submit} className="space-y-4">
      <label className="block"><span className="text-sm font-medium">Почта</span>
        <input className="mt-3 w-full rounded-[20px] border border-[var(--biz-border,#ddcfef)] bg-[var(--biz-surface,white)] px-4 py-4 outline-none placeholder:text-[var(--biz-text-muted,#a99db9)] focus:border-[var(--biz-accent,#7042c5)]" type="email" required autoComplete="email" value={email} disabled={busy || step === "code"} onChange={(e) => setEmail(e.target.value)} />
      </label>
      {step === "code" ? <>
        <label className="block"><span className="text-sm font-medium">Код из письма</span>
          <input className="mt-3 w-full rounded-[20px] border border-[var(--biz-border,#ddcfef)] bg-[var(--biz-surface,white)] px-4 py-4 outline-none placeholder:text-[var(--biz-text-muted,#a99db9)] focus:border-[var(--biz-accent,#7042c5)]" value={token} onChange={(e) => setToken(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required disabled={busy} />
        </label>
        <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm"><button className="underline" type="button" disabled={busy} onClick={() => { setStep("email"); setToken(""); setMessage(""); setError(""); }}>Изменить почту</button>{" "}
        <button className="underline" type="button" disabled={busy} onClick={() => {
          if (Date.now() < resendAt) { setMessage("Повторный код можно запросить через минуту."); return; }
          void send();
        }}>Отправить код ещё раз</button></p>
      </> : null}
      <p role="status" className="text-sm">{message}</p>
      {error ? <p role="alert">{error}</p> : null}
      <button type="submit" className="primary-cta primary-cta--form w-full" disabled={busy}>{busy ? "Подождите…" : step === "email" ? "Получить код" : "Войти"}</button>
    </form> : null}
  </section>;
}
