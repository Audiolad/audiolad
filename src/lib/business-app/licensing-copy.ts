/**
 * Visitor-facing licensing lines. Every sentence is an existing phrase from
 * docs/business/public/program-terms.md (редакция от 18.10.2026, пункт 1, 4 or 5).
 * Do not add a new legal claim here.
 */

/** Пункт 4. */
export const BUSINESS_LICENCE_TRIAL_RULE =
  "Пробный и пилотный доступ – безвозмездная лицензия на срок пробного или пилотного периода.";

/** Пункт 4. */
export const BUSINESS_LICENCE_PAID_RULE =
  "При платном доступе лицензионное вознаграждение входит в тариф.";

/** Пункт 4: «пока действует доступ к точке». */
export const BUSINESS_LICENCE_ACCESS_RULE = "Пока действует доступ к точке.";

/** Пункт 4. */
export const BUSINESS_LICENCE_ENDED_RULE = "По окончании доступа воспроизведение прекращается.";

/** Пункт 1, место лицензии. */
export const BUSINESS_LICENCE_PLACE_RULE =
  "в конкретной точке (адрес, зона), указанной в личном кабинете, через плеер АудиоЛад, в период доступа.";

/** Пункт 1. */
export const BUSINESS_LICENCE_ADMITTED_RULE =
  "Сублицензия выдаётся только по трекам, получившим допуск в «АудиоЛад Бизнес».";

/** Пункт 5. */
export const BUSINESS_LICENCE_SECTOR_RULE =
  "сервис выдаёт в эфир только треки, по которым в реестре прав сервиса действует подтверждённое право для страны и типа точки.";

export const BUSINESS_VENUE_ADDRESS_PROMPT = "Укажите адрес точки.";

export const BUSINESS_VENUE_ADDRESS_LINK = "Указать адрес";

export const BUSINESS_VENUE_ADDRESS_MISSING = "Адрес точки ещё не указан.";

const STATUS_LABEL = {
  trial: "пробный период",
  paid: "оплаченный доступ",
  grace: "доступ ещё открыт",
  expired: "доступ закончился",
} as const;

export function businessLicenceStatusLabel(status: keyof typeof STATUS_LABEL): string {
  return STATUS_LABEL[status];
}

/** One short line on the access card. Wording is the matching sentence from пункт 4. */
export function businessLicenceCardLine(status: keyof typeof STATUS_LABEL): string {
  if (status === "paid") return BUSINESS_LICENCE_PAID_RULE;
  if (status === "grace") return BUSINESS_LICENCE_ACCESS_RULE;
  if (status === "expired") return BUSINESS_LICENCE_ENDED_RULE;
  return BUSINESS_LICENCE_TRIAL_RULE;
}
