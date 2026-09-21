import { getAppOrigin } from "@/lib/seo/app-origin";

/** Public invite path: /invite/{PRIMARY_CODE} */
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

export function buildAuthorPartnerInviteMessage(inviteUrl: string): string {
  return `Присоединяйтесь к АудиоЛаду как автор. При регистрации по моей ссылке вы получите дополнительное авторское пространство бесплатно: ${inviteUrl}`;
}
