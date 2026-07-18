export const LEGAL_LINKS = [
  { href: "/requisites", title: "Реквизиты" },
  { href: "/offer", title: "Публичная оферта" },
  { href: "/privacy", title: "Политика обработки персональных данных" },
  { href: "/consent", title: "Согласие на обработку персональных данных" },
  { href: "/payment-and-refund", title: "Оплата, получение и возврат" },
] as const;

export type LegalLinkHref = (typeof LEGAL_LINKS)[number]["href"];

export const legalLinkClassName =
  "inline-flex min-h-11 items-center text-[#7042c5] underline-offset-2 hover:underline focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5] lg:min-h-0";

export const legalLinkActiveClassName =
  "inline-flex min-h-11 items-center font-semibold text-[#6234b5] lg:min-h-0";
