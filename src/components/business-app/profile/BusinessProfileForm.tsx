"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { saveBusinessProfile } from "@/app/business-app/profile/actions";
import { DEFAULT_BUSINESS_ORGANIZATION, validateBusinessProfile } from "@/lib/business-app/profile";
import "./profile.css";

export default function BusinessProfileForm({ ownerName, organizationName, canEditOrganization }: {
  ownerName: string; organizationName: string | null; canEditOrganization: boolean;
}) {
  const [name, setName] = useState(ownerName);
  const [org, setOrg] = useState(organizationName === DEFAULT_BUSINESS_ORGANIZATION ? "" : organizationName ?? "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();
  const edit = () => { setMessage(""); setError(""); };
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage(""); setError("");
    const parsed = validateBusinessProfile({ ownerName: name, organizationName: org });
    if (!parsed.ok) { setError(parsed.error); return; }
    setBusy(true);
    try {
      const result = await saveBusinessProfile(parsed);
      if (!result.ok) { setError(result.error); router.refresh(); return; }
      setName(result.ownerName);
      setOrg(result.organizationName === DEFAULT_BUSINESS_ORGANIZATION ? "" : result.organizationName);
      setMessage("Сохранено");
      router.refresh();
    } catch { setError("Не удалось сохранить профиль. Попробуйте ещё раз."); }
    finally { setBusy(false); }
  };
  return (
    <form onSubmit={save} className="business-profile-form space-y-3" aria-label="Редактирование профиля">
      <label htmlFor="business-owner-name">Имя владельца / хозяйки</label>
      <input id="business-owner-name" name="ownerName" value={name} placeholder="Например, Анна"
        disabled={busy} onChange={(e) => { setName(e.target.value); edit(); }} aria-describedby="business-profile-limits" />
      {organizationName !== null ? <>
        <label htmlFor="business-organization-name">Организация</label>
        <input id="business-organization-name" name="organizationName" value={org} placeholder="Моя кофейня"
          disabled={busy || !canEditOrganization} onChange={(e) => { setOrg(e.target.value); edit(); }} aria-describedby="business-profile-limits" />
      </> : null}
      <p id="business-profile-limits" className="text-sm text-[var(--biz-text-muted)]">Имя – до 80 символов, организация – до 120 символов.</p>
      <button type="submit" disabled={busy} className="business-app-btn business-app-btn-cta business-app-focus-ring">
        {busy ? "Сохраняем…" : "Сохранить"}
      </button>
      <p role="status">{message}</p>
      {error ? <p role="alert">{error}</p> : null}
    </form>
  );
}
