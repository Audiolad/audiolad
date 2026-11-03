/**
 * Sergey Petrov's direct contacts in the Business cabinet – one config for every
 * place that shows them («Документы» inspector card, «Профиль» → «Помощь»).
 * Sergey approved publishing these contacts and gave the MAX / Telegram links (03.11.2026).
 */
export const SERGEY_CONTACT = {
  name: "Сергей Петров",
  phoneDisplay: "+7 926 411 1381",
  phoneHref: "tel:+79264111381",
  email: "1@audiolad.ru",
  emailHref: "mailto:1@audiolad.ru",
  /** Same personal MAX link as in src/components/school/SchoolFaqScreen.tsx. */
  maxHref: "https://max.ru/u/f9LHodD0cOI9Z0TpTY6vON-AsaLO2UKjrEHxKZb8SoKf46sX5Bvih-n5QjQ",
  telegramHref: "https://t.me/p_e_t_r_o_v",
} as const;

export const SERGEY_CONTACT_LABELS = {
  call: "Позвонить",
  max: "Написать в МАКС",
  telegram: "Написать в Телеграм",
  email: `Написать на почту ${SERGEY_CONTACT.email}`,
} as const;

/** Parts of the shared contact block, rendered in the order a screen asks for. */
export type SergeyContactPart = "phone" | "call" | "max" | "telegram" | "email";

export const PROFILE_HELP_CONTACT_TITLE = "По любым вопросам пишите напрямую Сергею Петрову";
export const PROFILE_HELP_CONTACT_ORDER: readonly SergeyContactPart[] = ["max", "telegram", "email", "phone", "call"];
export const INSPECTOR_CONTACT_ORDER: readonly SergeyContactPart[] = ["phone", "call", "max", "telegram", "email"];
