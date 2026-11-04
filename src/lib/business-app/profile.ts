/** Shared browser/server validation. Limits are Unicode code points after trimming. */
export const BUSINESS_OWNER_NAME_MAX = 80;
/** Same limit as `rename_business_location` (business_locations.name). */
export const BUSINESS_VENUE_NAME_MAX = 120;
/** Hint in the empty owner name field and in the header switcher. */
export const BUSINESS_OWNER_NAME_PLACEHOLDER = "Ваше имя";
/** Profile link that opens the form with the owner name field focused. */
export const BUSINESS_PROFILE_NAME_HREF = "/profile?edit=name";
/** Auto name of a new organization and its first venue (guest start, first signup). */
export const DEFAULT_BUSINESS_ORGANIZATION = "Моя кофейня";
export const BUSINESS_OWNER_NAME_FIELD_ID = "business-owner-name";

/** Browser only: scroll the profile owner name field into view and put the cursor there. */
export function focusBusinessOwnerNameField() {
  const field = document.getElementById(BUSINESS_OWNER_NAME_FIELD_ID);
  if (!(field instanceof HTMLInputElement)) return false;
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  field.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "center" });
  field.focus({ preventScroll: true });
  return true;
}

export const BUSINESS_PROFILE_LIMITS_TEXT = "Имя – до 80 символов, название кофейни – до 120 символов.";

/**
 * `venueName: null` means the account has no venue yet (only the name is saved).
 * A venue name is required: the header, the hall player and documents show it.
 */
export function validateBusinessProfile(input: unknown) {
  if (!input || typeof input !== "object" || !("ownerName" in input) || !("venueName" in input) ||
      typeof input.ownerName !== "string" || (input.venueName !== null && typeof input.venueName !== "string")) {
    return { ok: false, error: "Проверьте имя и название кофейни." } as const;
  }
  const rawVenue = input.venueName as string | null;
  // Validate before trim so leading/trailing control characters are rejected too.
  if (/[<>\p{Cc}\p{Cf}]/u.test(input.ownerName + (rawVenue ?? ""))) {
    return { ok: false, error: "Уберите угловые скобки и управляющие символы." } as const;
  }
  const ownerName = input.ownerName.trim();
  const venueName = rawVenue === null ? null : rawVenue.trim();
  if ([...ownerName].length > BUSINESS_OWNER_NAME_MAX || (venueName !== null && [...venueName].length > BUSINESS_VENUE_NAME_MAX)) {
    return { ok: false, error: BUSINESS_PROFILE_LIMITS_TEXT } as const;
  }
  if (venueName === "") return { ok: false, error: "Введите название кофейни." } as const;
  return { ok: true, ownerName, venueName } as const;
}

const KINDS: Record<string, string> = {
  cafe: "Кофейня", coffee: "Кофейня", restaurant: "Ресторан", bar: "Бар",
  spa: "Спа", salon: "Салон красоты", beauty: "Салон красоты", beauty_salon: "Салон красоты",
  shop: "Магазин", retail: "Магазин", fitness: "Фитнес-клуб", gym: "Фитнес-клуб",
  barbershop: "Барбершоп", hotel: "Отель", office: "Офис", other: "Другой бизнес",
};
const ZONES: Record<string, string> = {
  "Europe/Kaliningrad": "Калининград (UTC+2)", "Europe/Moscow": "Москва (UTC+3)",
  "Europe/Samara": "Самара (UTC+4)", "Europe/Volgograd": "Волгоград (UTC+3)",
  "Europe/Saratov": "Саратов (UTC+4)", "Europe/Ulyanovsk": "Ульяновск (UTC+4)",
  "Europe/Astrakhan": "Астрахань (UTC+4)", "Asia/Yekaterinburg": "Екатеринбург (UTC+5)",
  "Asia/Omsk": "Омск (UTC+6)", "Asia/Novosibirsk": "Новосибирск (UTC+7)",
  "Asia/Barnaul": "Барнаул (UTC+7)", "Asia/Tomsk": "Томск (UTC+7)",
  "Asia/Novokuznetsk": "Новокузнецк (UTC+7)", "Asia/Krasnoyarsk": "Красноярск (UTC+7)",
  "Asia/Irkutsk": "Иркутск (UTC+8)", "Asia/Chita": "Чита (UTC+9)",
  "Asia/Yakutsk": "Якутск (UTC+9)", "Asia/Vladivostok": "Владивосток (UTC+10)",
  "Asia/Magadan": "Магадан (UTC+11)", "Asia/Sakhalin": "Сахалин (UTC+11)",
  "Asia/Srednekolymsk": "Среднеколымск (UTC+11)", "Asia/Kamchatka": "Петропавловск-Камчатский (UTC+12)",
  "Asia/Anadyr": "Анадырь (UTC+12)",
};
export const businessKindLabel = (value: string) => Object.hasOwn(KINDS, value) ? KINDS[value] : value;
export const businessTimezoneLabel = (value: string) => Object.hasOwn(ZONES, value) ? ZONES[value] : value;
