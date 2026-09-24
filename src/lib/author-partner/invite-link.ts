import { getAppOrigin } from "@/lib/seo/app-origin";

/** Public author-landing invite path: /invite/{PRIMARY_CODE} */
export function buildAuthorPartnerInvitePath(primaryCode: string): string {
  const code = primaryCode.trim();
  return `/invite/${encodeURIComponent(code)}`;
}

export function buildAuthorPartnerInviteUrl(
  primaryCode: string,
  origin: string = getAppOrigin(),
): string {
  const base = origin.replace(/\/$/, "");
  return `${base}${buildAuthorPartnerInvitePath(primaryCode)}`;
}

/** Public home invite path: /r/{PRIMARY_CODE} */
export function buildAuthorPartnerHomePath(primaryCode: string): string {
  const code = primaryCode.trim();
  return `/r/${encodeURIComponent(code)}`;
}

export function buildAuthorPartnerHomeUrl(
  primaryCode: string,
  origin: string = getAppOrigin(),
): string {
  const base = origin.replace(/\/$/, "");
  return `${base}${buildAuthorPartnerHomePath(primaryCode)}`;
}

export function buildAuthorPartnerInviteMessage(input: {
  homeUrl: string;
  authorUrl: string;
}): string {
  return [
    "Хочу познакомить вас с АудиоЛадом — платформой авторских аудиопрактик, медитаций, аудиокурсов, музыки и программ.",
    "",
    "Посмотреть АудиоЛад:",
    input.homeUrl,
    "",
    "Если захотите стать автором АудиоЛада, здесь можно посмотреть возможности для авторов и перейти к регистрации:",
    input.authorUrl,
    "",
    "Когда вы зарегистрируетесь как автор по моей пригласительной ссылке, АудиоЛад бесплатно добавит вам дополнительное авторское пространство.",
  ].join("\n");
}
