import { PRODUCTION_APP_ORIGIN } from "@/lib/seo/app-origin";
import { openVkExternalHttps } from "@/lib/vk/bridge";

/** Public Audiolad pages. Opening them does not link a VK identity. */
export const VK_GUEST_LOGIN_URL = `${PRODUCTION_APP_ORIGIN}/auth/sign-in`;
export const VK_GUEST_SIGNUP_URL = `${PRODUCTION_APP_ORIGIN}/auth/sign-up`;

export const VK_PROFILE_LEGAL_LINKS = [
  {
    id: "privacy",
    label: "Политика конфиденциальности",
    url: `${PRODUCTION_APP_ORIGIN}/privacy`,
  },
  {
    id: "offer",
    label: "Оферта / условия",
    url: `${PRODUCTION_APP_ORIGIN}/offer`,
  },
  {
    id: "support",
    label: "Помощь / поддержка",
    url: `${PRODUCTION_APP_ORIGIN}/help/support`,
  },
] as const;

const VK_GUEST_EXTERNAL_URLS = new Set<string>([
  VK_GUEST_LOGIN_URL,
  VK_GUEST_SIGNUP_URL,
  ...VK_PROFILE_LEGAL_LINKS.map((item) => item.url),
]);

export function isVkGuestExternalUrl(url: string): boolean {
  return VK_GUEST_EXTERNAL_URLS.has(url);
}

/** Opens one allowlisted Audiolad page via VK Bridge, or a normal browser tab. */
export function openVkGuestExternalUrl(url: string): boolean {
  if (!isVkGuestExternalUrl(url)) return false;
  return openVkExternalHttps(url);
}
