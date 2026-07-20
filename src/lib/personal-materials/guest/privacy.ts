import type { Metadata } from "next";

import { PERSONAL_MATERIAL_GUEST_PAGE_TITLE } from "./display";

export const personalMaterialGuestPrivacyHeaders: HeadersInit = {
  "Cache-Control": "private, no-store",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
};

export function buildPersonalMaterialGuestMetadata(): Metadata {
  return {
    title: PERSONAL_MATERIAL_GUEST_PAGE_TITLE,
    description:
      "Персональный аудиоматериал на платформе АудиоЛад. Доступ только по вашей ссылке.",
    robots: {
      index: false,
      follow: false,
      noarchive: true,
    },
  };
}
