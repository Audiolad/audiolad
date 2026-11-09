/** Shared browser/server validation. Limits are Unicode code points after trimming. */
export const BUSINESS_OWNER_NAME_MAX = 80;
/** Same limit as `rename_business_location` (business_locations.name). */
/** Same limit as `rename_business_organization` (business_organizations.name). */
export const BUSINESS_ORGANIZATION_NAME_MAX = 120;
/** @deprecated Use BUSINESS_ORGANIZATION_NAME_MAX – kept for older imports. */
export const BUSINESS_VENUE_NAME_MAX = BUSINESS_ORGANIZATION_NAME_MAX;
/** Hint in the empty owner name field and in the header switcher. */
export const BUSINESS_OWNER_NAME_PLACEHOLDER = "Ваше имя";
/** Profile link that opens the form with the owner name field focused. */
export const BUSINESS_PROFILE_NAME_HREF = "/profile?edit=name";
/** Auto name of a new organization and its first venue (guest start, first signup). */
export const DEFAULT_BUSINESS_ORGANIZATION = "Моя кофейня";
/** Empty-field placeholder for the account-level cafe / organization name. */
export const BUSINESS_ORGANIZATION_NAME_PLACEHOLDER = "Моя кофейня";
/** Under the organization name field: not a hall name (Sergey, t1316u). */
export const BUSINESS_ORGANIZATION_NAME_HINT =
  "Это название кофейни или организации. Названия залов задаются отдельно.";
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

export const BUSINESS_OWNER_SURNAME_MAX = 80;
export const BUSINESS_OWNER_SURNAME_FIELD_ID = "business-owner-surname";
export const BUSINESS_OWNER_SURNAME_PLACEHOLDER = "Ваша фамилия";
/** Profile link that opens the form with the surname field focused. */
export const BUSINESS_PROFILE_SURNAME_HREF = "/profile?edit=surname";
/** Plain reason under the surname field (Sergey, t1305u). */
export const BUSINESS_OWNER_SURNAME_HINT =
  "Фамилия нужна, чтобы подтвердить ваше право легально включать музыку в заведении.";
/** Home/profile prompt when an existing account still has no surname (non-blocking). */
export const BUSINESS_OWNER_SURNAME_REQUIRED_PROMPT =
  "Укажите фамилию – она нужна для подтверждения прав на музыку в заведении";
export const BUSINESS_OWNER_SURNAME_REQUIRED_CTA = "Указать фамилию";
export const BUSINESS_OWNER_SURNAME_REQUIRED_ERROR = "Введите фамилию.";
export const BUSINESS_PROFILE_LIMITS_TEXT =
  "Имя и фамилия – до 80 символов, название – до 120 символов.";

/** Browser only: scroll the surname field into view and put the cursor there. */
export function focusBusinessOwnerSurnameField() {
  const field = document.getElementById(BUSINESS_OWNER_SURNAME_FIELD_ID);
  if (!(field instanceof HTMLInputElement)) return false;
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  field.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "center" });
  field.focus({ preventScroll: true });
  return true;
}

/**
 * `organizationName: null` – the account has no organization yet (only the person is saved).
 * When the organization exists, its account-level name is required and never taken from a hall.
 * Hall names are edited elsewhere (venue place form); the profile never renames a hall.
 */
export function validateBusinessProfile(input: unknown) {
  if (!input || typeof input !== "object" || !("ownerName" in input) || !("organizationName" in input) ||
      typeof input.ownerName !== "string" ||
      (input.organizationName !== null && typeof input.organizationName !== "string")) {
    return { ok: false, error: "Проверьте имя, фамилию и название кофейни / организации." } as const;
  }
  // Surname is required (Sergey, t1305s9421). Missing key → empty so the required check fires.
  const rawSurname = "ownerSurname" in input && typeof (input as { ownerSurname?: unknown }).ownerSurname === "string"
    ? (input as { ownerSurname: string }).ownerSurname
    : "ownerSurname" in input
      ? null
      : "";
  if (rawSurname === null) {
    return { ok: false, error: "Проверьте имя, фамилию и название кофейни / организации." } as const;
  }
  const rawOrganization = input.organizationName as string | null;
  // Validate before trim so leading/trailing control characters are rejected too.
  if (/[<>\p{Cc}\p{Cf}]/u.test(input.ownerName + rawSurname + (rawOrganization ?? ""))) {
    return { ok: false, error: "Уберите угловые скобки и управляющие символы." } as const;
  }
  const ownerName = input.ownerName.trim();
  const ownerSurname = rawSurname.trim();
  const organizationName = rawOrganization === null ? null : rawOrganization.trim();
  if (
    [...ownerName].length > BUSINESS_OWNER_NAME_MAX ||
    [...ownerSurname].length > BUSINESS_OWNER_SURNAME_MAX ||
    (organizationName !== null && [...organizationName].length > BUSINESS_ORGANIZATION_NAME_MAX)
  ) {
    return { ok: false, error: BUSINESS_PROFILE_LIMITS_TEXT } as const;
  }
  if (!ownerSurname) return { ok: false, error: BUSINESS_OWNER_SURNAME_REQUIRED_ERROR } as const;
  if (organizationName === "") {
    return { ok: false, error: "Введите название кофейни / организации." } as const;
  }
  return { ok: true, ownerName, ownerSurname, organizationName } as const;
}

/**
 * Value shown in the profile organization field.
 * Uses only the organization (account) name – never a hall / venue name (Sergey, t1316u).
 * Missing / blank → empty input with placeholder; do not substitute a venue name.
 */
export function businessProfileOrganizationFieldValue(organizationName: string | null | undefined) {
  return typeof organizationName === "string" ? organizationName.trim() : "";
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
