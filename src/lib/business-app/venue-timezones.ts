/**
 * The venue clock: one IANA zone per Russian UTC offset (Kaliningrad UTC+2 … Kamchatka UTC+12).
 * Only these ids can be saved from the cabinet. Russia has no DST, so offsets are fixed.
 */
export const VENUE_TIMEZONES = [
  { id: "Europe/Kaliningrad", offset: 2, label: "Калининград (UTC+2)" },
  { id: "Europe/Moscow", offset: 3, label: "Москва (UTC+3)" },
  { id: "Europe/Samara", offset: 4, label: "Самара (UTC+4)" },
  { id: "Asia/Yekaterinburg", offset: 5, label: "Екатеринбург (UTC+5)" },
  { id: "Asia/Omsk", offset: 6, label: "Омск (UTC+6)" },
  { id: "Asia/Novosibirsk", offset: 7, label: "Новосибирск (UTC+7)" },
  { id: "Asia/Irkutsk", offset: 8, label: "Иркутск (UTC+8)" },
  { id: "Asia/Yakutsk", offset: 9, label: "Якутск (UTC+9)" },
  { id: "Asia/Vladivostok", offset: 10, label: "Владивосток (UTC+10)" },
  { id: "Asia/Magadan", offset: 11, label: "Магадан (UTC+11)" },
  { id: "Asia/Kamchatka", offset: 12, label: "Петропавловск-Камчатский (UTC+12)" },
] as const;

export type VenueTimezoneId = (typeof VENUE_TIMEZONES)[number]["id"];
export const VENUE_TIMEZONE_DEFAULT_ID: VenueTimezoneId = "Europe/Moscow";

export function isVenueTimezone(value: unknown): value is VenueTimezoneId {
  return typeof value === "string" && VENUE_TIMEZONES.some((zone) => zone.id === value);
}

/** Offset of `timeZone` from UTC in minutes at `now`; null for an unknown zone. */
export function timezoneOffsetMinutes(timeZone: string, now = new Date()): number | null {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric",
    }).formatToParts(now);
    const get = (type: string) => Number(parts.find((part) => part.type === type)?.value);
    const local = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"));
    if (!Number.isFinite(local)) return null;
    return Math.round((local - Math.floor(now.getTime() / 60_000) * 60_000) / 60_000);
  } catch {
    return null;
  }
}

/**
 * Nearest venue zone to a UTC offset in minutes (ties go west). A zone an hour or more away from
 * every Russian zone (Berlin, New York, Auckland – VPN or travel) is not a Russian venue clock:
 * Moscow then.
 */
export function nearestVenueTimezone(offsetMinutes: number): VenueTimezoneId {
  if (!Number.isFinite(offsetMinutes)) return VENUE_TIMEZONE_DEFAULT_ID;
  let best: (typeof VENUE_TIMEZONES)[number] = VENUE_TIMEZONES[1];
  let bestDistance = Infinity;
  for (const zone of VENUE_TIMEZONES) {
    const distance = Math.abs(zone.offset * 60 - offsetMinutes);
    if (distance < bestDistance) { best = zone; bestDistance = distance; }
  }
  return bestDistance < 60 ? best.id : VENUE_TIMEZONE_DEFAULT_ID;
}

/**
 * Browser zone (Intl) mapped to one of the 11 venue zones by its current UTC offset.
 * Missing or unknown browser zone falls back to Moscow.
 */
export function venueTimezoneFromBrowserZone(browserZone: unknown, now = new Date()): VenueTimezoneId {
  if (isVenueTimezone(browserZone)) return browserZone;
  if (typeof browserZone !== "string" || !browserZone.trim()) return VENUE_TIMEZONE_DEFAULT_ID;
  const zone = browserZone.trim();
  const offset = timezoneOffsetMinutes(zone, now);
  if (offset == null) return VENUE_TIMEZONE_DEFAULT_ID;
  // Russia has no daylight saving: a zone that shifts between January and July (Berlin in summer
  // sits on UTC+2 like Kaliningrad) is a foreign browser – Moscow.
  const year = now.getUTCFullYear();
  const winter = timezoneOffsetMinutes(zone, new Date(Date.UTC(year, 0, 15)));
  const summer = timezoneOffsetMinutes(zone, new Date(Date.UTC(year, 6, 15)));
  if (winter !== summer) return VENUE_TIMEZONE_DEFAULT_ID;
  return nearestVenueTimezone(offset);
}

/** Browser only. Never throws. */
export function detectVenueTimezone(now = new Date()): VenueTimezoneId {
  try {
    return venueTimezoneFromBrowserZone(Intl.DateTimeFormat().resolvedOptions().timeZone, now);
  } catch {
    return VENUE_TIMEZONE_DEFAULT_ID;
  }
}

export function venueTimezoneLabel(id: string): string | null {
  return VENUE_TIMEZONES.find((zone) => zone.id === id)?.label ?? null;
}
