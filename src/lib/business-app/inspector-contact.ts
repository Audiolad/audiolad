import { SERGEY_CONTACT, SERGEY_CONTACT_LABELS } from "@/lib/business-app/sergey-contact";

/** Who a venue calls when an inspector (РАО / ВОИС) comes or a notice arrives. */
export const INSPECTOR_CONTACT = SERGEY_CONTACT;

export const INSPECTOR_BUTTONS = {
  ...SERGEY_CONTACT_LABELS,
  qr: "Показать QR-код с подтверждением прав на музыку",
} as const;

export const INSPECTOR_CARD_TITLE = "Пришёл инспектор или предписание? Просто позвоните Сергею";

export const INSPECTOR_CARD_LINES = [
  "Покажите проверяющему документы ниже – кнопка «Посмотреть» откроет их на телефоне.",
  "Ничего не подписывайте и не оплачивайте до разговора с Сергеем.",
] as const;
