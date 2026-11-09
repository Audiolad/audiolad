"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { saveBusinessProfile } from "@/app/business-app/profile/actions";
import {
  BUSINESS_ORGANIZATION_NAME_HINT,
  BUSINESS_ORGANIZATION_NAME_PLACEHOLDER,
  BUSINESS_OWNER_NAME_FIELD_ID,
  BUSINESS_OWNER_NAME_PLACEHOLDER,
  BUSINESS_OWNER_SURNAME_FIELD_ID,
  BUSINESS_OWNER_SURNAME_HINT,
  BUSINESS_OWNER_SURNAME_PLACEHOLDER,
  BUSINESS_PROFILE_LIMITS_TEXT,
  businessProfileOrganizationFieldValue,
  focusBusinessOwnerNameField,
  focusBusinessOwnerSurnameField,
  validateBusinessProfile,
} from "@/lib/business-app/profile";
import "./profile.css";

/**
 * Owner name, required surname, and the account-level cafe / organization name.
 * `organizationName: null` – no organization yet (field hidden). Only the organization
 * owner may rename it. Hall / venue names are never read or written here (Sergey, t1316u).
 * Surname is required on save (Sergey, t1305s9421) and stored in auth user_metadata.last_name.
 * Existing accounts without a surname keep music; the home prompt asks them to fill it.
 */
export default function BusinessProfileForm({ ownerName, ownerSurname, organizationName, canEditOrganization }: {
  ownerName: string; ownerSurname: string; organizationName: string | null; canEditOrganization: boolean;
}) {
  const [name, setName] = useState(ownerName);
  const [surname, setSurname] = useState(ownerSurname);
  const [organization, setOrganization] = useState(businessProfileOrganizationFieldValue(organizationName));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();
  const focusedFromLink = useRef(false);

  // Header / home prompts open /profile?edit=name or ?edit=surname: put the cursor in that field.
  useEffect(() => {
    if (focusedFromLink.current) return;
    const edit = new URLSearchParams(window.location.search).get("edit");
    if (edit !== "name" && edit !== "surname") return;
    focusedFromLink.current = true;
    if (edit === "surname") focusBusinessOwnerSurnameField();
    else focusBusinessOwnerNameField();
  }, []);

  const edit = () => { setMessage(""); setError(""); };
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage(""); setError("");
    const parsed = validateBusinessProfile({
      ownerName: name,
      ownerSurname: surname,
      organizationName: organizationName === null ? null : organization,
    });
    if (!parsed.ok) { setError(parsed.error); return; }
    setBusy(true);
    try {
      const result = await saveBusinessProfile({
        ownerName: parsed.ownerName,
        ownerSurname: parsed.ownerSurname,
        organizationName: parsed.organizationName,
      });
      if (!result.ok) { setError(result.error); router.refresh(); return; }
      setName(result.ownerName);
      setSurname(result.ownerSurname);
      if (result.organizationName !== null) {
        setOrganization(businessProfileOrganizationFieldValue(result.organizationName));
      }
      setMessage("Сохранено");
      router.refresh();
    } catch { setError("Не удалось сохранить профиль. Попробуйте ещё раз."); }
    finally { setBusy(false); }
  };
  return (
    <form onSubmit={save} className="business-profile-form space-y-3" aria-label="Редактирование профиля">
      <label htmlFor={BUSINESS_OWNER_NAME_FIELD_ID}>Имя владельца / хозяйки</label>
      <input id={BUSINESS_OWNER_NAME_FIELD_ID} name="ownerName" value={name} placeholder={BUSINESS_OWNER_NAME_PLACEHOLDER}
        autoComplete="given-name" disabled={busy} onChange={(e) => { setName(e.target.value); edit(); }}
        aria-describedby="business-profile-limits" data-testid="biz-profile-owner-name" />
      <label htmlFor={BUSINESS_OWNER_SURNAME_FIELD_ID}>Фамилия владельца / хозяйки</label>
      <input id={BUSINESS_OWNER_SURNAME_FIELD_ID} name="ownerSurname" value={surname}
        placeholder={BUSINESS_OWNER_SURNAME_PLACEHOLDER} autoComplete="family-name" required disabled={busy}
        onChange={(e) => { setSurname(e.target.value); edit(); }}
        aria-describedby="business-profile-surname-hint business-profile-limits"
        data-testid="biz-profile-owner-surname" />
      <p id="business-profile-surname-hint" className="text-sm text-[var(--biz-text-muted)]"
        data-testid="biz-profile-owner-surname-hint">{BUSINESS_OWNER_SURNAME_HINT}</p>
      {organizationName !== null ? <>
        <label htmlFor="business-organization-name">Название кофейни / организации</label>
        <input id="business-organization-name" name="organizationName" value={organization}
          placeholder={BUSINESS_ORGANIZATION_NAME_PLACEHOLDER} maxLength={120}
          disabled={busy || !canEditOrganization} onChange={(e) => { setOrganization(e.target.value); edit(); }}
          aria-describedby="business-profile-org-hint business-profile-limits"
          data-testid="biz-profile-organization-name" />
        <p id="business-profile-org-hint" className="text-sm text-[var(--biz-text-muted)]"
          data-testid="biz-profile-organization-hint">{BUSINESS_ORGANIZATION_NAME_HINT}</p>
        {canEditOrganization ? null : (
          <p className="text-sm text-[var(--biz-text-muted)]">Название кофейни / организации меняет владелец.</p>
        )}
      </> : null}
      <p id="business-profile-limits" className="text-sm text-[var(--biz-text-muted)]">{BUSINESS_PROFILE_LIMITS_TEXT}</p>
      <button type="submit" disabled={busy} className="business-app-btn business-app-btn-cta business-app-focus-ring">
        {busy ? "Сохраняем…" : "Сохранить"}
      </button>
      <p role="status">{message}</p>
      {error ? <p role="alert">{error}</p> : null}
    </form>
  );
}
