"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import PasswordInput from "@/components/ui/PasswordInput";
import BusinessReceiptEmailForm from "./BusinessReceiptEmailForm";
import { saveBusinessLoginPassword } from "@/app/business-app/profile/actions";
import { businessPasswordError } from "@/lib/business-app/login-access";

export default function BusinessLoginAccess({ email, anonymous, savedEmail, passwordState }: {
  email: string | null; anonymous: boolean; savedEmail: string | null; passwordState: "set" | "unset" | "unknown";
}) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const label = passwordState === "set" ? "Сменить пароль" : passwordState === "unset" ? "Создать пароль" : "Создать или сменить пароль";
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    const invalid = businessPasswordError(password, repeat);
    if (invalid) { setError(invalid); return; }
    setBusy(true); setError("");
    try {
      const result = await saveBusinessLoginPassword({ password, repeat });
      if (!result.ok) { setError(result.error); return; }
      setPassword(""); setRepeat(""); setMessage("Пароль сохранён."); router.refresh();
    } catch { setError("Не удалось сохранить пароль. Попробуйте ещё раз."); }
    finally { setBusy(false); }
  }
  return <section id="biz-profile-login" className="business-app-card space-y-3">
    <h2 className="text-lg font-bold">Вход в кабинет</h2>
    {email ? <p>Почта для входа: {email}</p> : <>
      <p>Вы вошли без почты. Добавьте почту, чтобы входить в кабинет с любого устройства.</p>
      <BusinessReceiptEmailForm receiptEmail={savedEmail} anonymous={anonymous} login />
    </>}
    <form onSubmit={save} className="business-profile-form space-y-3">
      <h3 className="font-semibold">{label}</h3>
      {!email || anonymous ? <p>Сначала добавьте почту.</p> : null}
      <fieldset disabled={busy || !email || anonymous} className="space-y-3">
        <label className="block">Пароль
          <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} maxLength={128} autoComplete="new-password" />
        </label>
        <label className="block">Повторите пароль
          <PasswordInput value={repeat} onChange={(e) => setRepeat(e.target.value)} required minLength={8} maxLength={128} autoComplete="new-password" />
        </label>
        <p className="text-sm">Не меньше 8 символов.</p>
        <button type="submit" className="business-app-btn business-app-btn-cta">{busy ? "Сохраняем…" : label}</button>
      </fieldset>
      {error ? <p role="alert">{error}</p> : null}
      <p role="status">{message}</p>
    </form>
  </section>;
}
