# Venue timezone – investigation and change

## Current behaviour (prod 55e164c)
- `business_locations.timezone` is text NOT NULL (CHECK 1–64 chars), no default.
- Every creation path hardcoded `Europe/Moscow`: guest start (`business_guest_bootstrap` SQL), onboarding wizard, domain bootstrap form. Nothing read the browser zone.
- Профиль showed the zone read-only («Часовой пояс: Москва (UTC+3)»); there was no way to change it.
- So every venue is Moscow unless set by hand in the DB.

## What depends on the venue zone
- Point devices: `point_sound_read` returns the zone; `pointDaypart` / `venueMinuteOfDay` pick morning/day/evening by venue time, switching at track boundaries.
- Owner cabinet daypart (`useCafeQueuePreferences`) – used the phone clock (`getHours`); now uses the venue zone.
- Subscription days left and «до» date (profile-subscription.ts), documents and playback report times, support diagnostics label.
- Not venue-dependent (Moscow hardcoded by design): analytics, trial activity days, admin; `spa-player-core` offline label.

## Change
- `venue-timezones.ts`: 11 Russian zones (IANA ids), nearest-by-offset mapping, fallback Moscow.
- New venues: the browser zone (Intl) mapped to the nearest of the 11 is sent by guest start, wizard and bootstrap form. Server accepts only the 11 ids; else Moscow.
- Existing venues: untouched. A legacy zone outside the list is shown as «Сейчас: …» until the owner saves a choice.
- Профиль: owner gets a dropdown + green «Сохранить»; non-owners and the hall device («Точка») see read-only text; the server action re-checks owner role, no support cookie, not the hall device.
- On save: `POINT_SOUND_CHANGED_EVENT` + refresh; points pick the zone up on the next 5 s poll; daypart change applies at the next track boundary, so music does not stop.
- Migration: none. Writes go through the service-role client after the session owner check.
