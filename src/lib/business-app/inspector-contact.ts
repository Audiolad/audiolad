/**
 * Who a venue calls when an inspector (РАО / ВОИС) comes or a notice arrives.
 * Sergey Petrov approved publishing these contacts in the cabinet (03.11.2026).
 */
export const INSPECTOR_CONTACT = {
  name: "Сергей Петров",
  phoneDisplay: "+7 926 411 1381",
  phoneHref: "tel:+79264111381",
  email: "1@audiolad.ru",
  emailHref: "mailto:1@audiolad.ru",
  /** Same confirmed personal MAX link as in src/components/school/SchoolFaqScreen.tsx. */
  maxHref: "https://max.ru/u/f9LHodD0cOI9Z0TpTY6vON-AsaLO2UKjrEHxKZb8SoKf46sX5Bvih-n5QjQ",
} as const;

export const INSPECTOR_CARD_TITLE = "Пришёл инспектор или предписание? Просто позвоните Сергею";

export const INSPECTOR_CARD_LINES = [
  "Покажите проверяющему документы ниже – кнопка «Посмотреть» откроет их на телефоне.",
  "Ничего не подписывайте и не оплачивайте до разговора с Сергеем.",
] as const;
