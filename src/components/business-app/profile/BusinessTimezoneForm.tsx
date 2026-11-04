"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { saveBusinessTimezone } from "@/app/business-app/profile/actions";
import { POINT_SOUND_CHANGED_EVENT } from "@/lib/business-app/point-sound";
import { VENUE_TIMEZONES, isVenueTimezone, venueTimezoneFromBrowserZone } from "@/lib/business-app/venue-timezones";
import "./profile.css";

/**
 * Owner: dropdown of the 11 Russian zones. A legacy zone outside the list stays as saved until
 * the owner picks one – nothing is changed silently. Players pick the new zone up at the next
 * sound poll; music keeps playing.
 */
export default function BusinessTimezoneForm({ timezone, currentLabel }: { timezone: string; currentLabel: string }) {
  const known = isVenueTimezone(timezone);
  const [value, setValue] = useState<string>(known ? timezone : venueTimezoneFromBrowserZone(timezone));
  const [saved, setSaved] = useState(known ? timezone : "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage(""); setError("");
    if (!isVenueTimezone(value)) { setError("Выберите часовой пояс из списка."); return; }
    setBusy(true);
    try {
      const result = await saveBusinessTimezone({ timezone: value });
      if (!result.ok) { setError(result.error); return; }
      setSaved(result.timezone);
      setMessage("Сохранено. Время суток для музыки теперь по этому поясу.");
      // The cabinet player re-reads the venue sound without stopping the current track.
      window.dispatchEvent(new Event(POINT_SOUND_CHANGED_EVENT));
      router.refresh();
    } catch { setError("Не удалось сохранить часовой пояс. Попробуйте ещё раз."); }
    finally { setBusy(false); }
  };

  return (
    <form onSubmit={save} className="business-profile-form space-y-3" aria-label="Часовой пояс кофейни" data-testid="biz-profile-timezone-form">
      <label htmlFor="business-venue-timezone">Часовой пояс</label>
      {known ? null : (
        <p className="text-sm text-[var(--biz-text-muted)]" data-testid="biz-profile-timezone-legacy">Сейчас: {currentLabel}</p>
      )}
      <select id="business-venue-timezone" name="timezone" value={value} disabled={busy}
        onChange={(e) => { setValue(e.target.value); setMessage(""); setError(""); }}
        aria-describedby="business-venue-timezone-hint" data-testid="biz-profile-timezone">
        {VENUE_TIMEZONES.map((zone) => <option key={zone.id} value={zone.id}>{zone.label}</option>)}
      </select>
      <p id="business-venue-timezone-hint" className="text-sm text-[var(--biz-text-muted)]">
        По нему музыка меняется утром, днём и вечером – по часам кофейни.
      </p>
      <button type="submit" disabled={busy || value === saved} className="business-app-btn business-app-btn-cta business-app-focus-ring"
        data-testid="biz-profile-timezone-save">
        {busy ? "Сохраняем…" : "Сохранить"}
      </button>
      <p role="status">{message}</p>
      {error ? <p role="alert">{error}</p> : null}
    </form>
  );
}
