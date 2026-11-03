/** Shared browser/server validation. Limits are Unicode code points after trimming. */
export const BUSINESS_OWNER_NAME_MAX = 80;
export const BUSINESS_ORGANIZATION_NAME_MAX = 120;
export const DEFAULT_BUSINESS_ORGANIZATION = "Моя кофейня";

export function validateBusinessProfile(input: unknown) {
  if (!input || typeof input !== "object" || !("ownerName" in input) || !("organizationName" in input) ||
      typeof input.ownerName !== "string" || typeof input.organizationName !== "string") {
    return { ok: false, error: "Проверьте имя и название организации." } as const;
  }
  // Validate before trim so leading/trailing control characters are rejected too.
  if (/[<>\p{Cc}\p{Cf}]/u.test(input.ownerName + input.organizationName)) {
    return { ok: false, error: "Уберите угловые скобки и управляющие символы." } as const;
  }
  const ownerName = input.ownerName.trim();
  const organizationName = input.organizationName.trim();
  if ([...ownerName].length > BUSINESS_OWNER_NAME_MAX || [...organizationName].length > BUSINESS_ORGANIZATION_NAME_MAX) {
    return { ok: false, error: "Имя – до 80 символов, организация – до 120 символов." } as const;
  }
  return { ok: true, ownerName, organizationName } as const;
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
  "Asia/Srednekolymsk": "Среднеколымск (UTC+11)", "Asia/Kamchatka": "Камчатка (UTC+12)",
  "Asia/Anadyr": "Анадырь (UTC+12)",
};
export const businessKindLabel = (value: string) => Object.hasOwn(KINDS, value) ? KINDS[value] : value;
export const businessTimezoneLabel = (value: string) => Object.hasOwn(ZONES, value) ? ZONES[value] : value;
