"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { saveBusinessProfile } from "@/app/business-app/profile/actions";
import {
  BUSINESS_OWNER_NAME_FIELD_ID,
  BUSINESS_OWNER_NAME_PLACEHOLDER,
  BUSINESS_OWNER_SURNAME_FIELD_ID,
  BUSINESS_OWNER_SURNAME_HINT,
  BUSINESS_OWNER_SURNAME_PLACEHOLDER,
  BUSINESS_PROFILE_LIMITS_TEXT,
  focusBusinessOwnerNameField,
  validateBusinessProfile,
} from "@/lib/business-app/profile";
import "./profile.css";

/**
 * Owner name, optional surname, and the name of the venue shown in the header switcher.
 * `venueName: null` – no venue yet. Only the organization owner may rename the venue.
 * Surname is optional (Sergey, t1305u) and stored in auth user_metadata.last_name.
 */
export default function BusinessProfileForm({ ownerName, ownerSurname, venueName, canEditVenue }: {
  ownerName: string; ownerSurname: string; venueName: string | null; canEditVenue: boolean;
}) {
  const [name, setName] = useState(ownerName);
  const [surname, setSurname] = useState(ownerSurname);
  const [venue, setVenue] = useState(venueName ?? "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();
  const focusedFromLink = useRef(false);

  // «Ваше имя» in the header switcher opens /profile?edit=name: put the cursor in the name field.
  useEffect(() => {
    if (focusedFromLink.current) return;
    if (new URLSearchParams(window.location.search).get("edit") !== "name") return;
    focusedFromLink.current = true;
    focusBusinessOwnerNameField();
  }, []);

  const edit = () => { setMessage(""); setError(""); };
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage(""); setError("");
    const parsed = validateBusinessProfile({
      ownerName: name,
      ownerSurname: surname,
      venueName: venueName === null ? null : venue,
    });
    if (!parsed.ok) { setError(parsed.error); return; }
    setBusy(true);
    try {
      const result = await saveBusinessProfile({
        ownerName: parsed.ownerName,
        ownerSurname: parsed.ownerSurname,
        venueName: parsed.venueName,
      });
      if (!result.ok) { setError(result.error); router.refresh(); return; }
      setName(result.ownerName);
      setSurname(result.ownerSurname);
      if (result.venueName !== null) setVenue(result.venueName);
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
        placeholder={BUSINESS_OWNER_SURNAME_PLACEHOLDER} autoComplete="family-name" disabled={busy}
        onChange={(e) => { setSurname(e.target.value); edit(); }}
        aria-describedby="business-profile-surname-hint business-profile-limits"
        data-testid="biz-profile-owner-surname" />
      <p id="business-profile-surname-hint" className="text-sm text-[var(--biz-text-muted)]"
        data-testid="biz-profile-owner-surname-hint">{BUSINESS_OWNER_SURNAME_HINT}</p>
      {venueName !== null ? <>
        <label htmlFor="business-venue-name">Название кофейни</label>
        <input id="business-venue-name" name="venueName" value={venue} placeholder="Моя кофейня" maxLength={120}
          disabled={busy || !canEditVenue} onChange={(e) => { setVenue(e.target.value); edit(); }}
          aria-describedby="business-profile-limits" data-testid="biz-profile-venue-name" />
        {canEditVenue ? null : <p className="text-sm text-[var(--biz-text-muted)]">Название кофейни меняет владелец.</p>}
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
