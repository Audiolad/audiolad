/** Set to true when /become-author route is production-ready. */
export const BECOME_AUTHOR_ROUTE_ENABLED = false;

export const BECOME_AUTHOR_HREF = "/become-author";

export const PROFILE_LEGAL_LINKS = [
  { href: "/offer", title: "Публичная оферта" },
  { href: "/privacy", title: "Политика обработки персональных данных" },
  { href: "/consent", title: "Согласие на обработку персональных данных" },
  {
    href: "/payment-and-refund",
    title: "Оплата, получение и возврат",
  },
  { href: "/requisites", title: "Реквизиты" },
] as const;

export const SETTINGS_LEGAL_SECTION_ID = "legal";
