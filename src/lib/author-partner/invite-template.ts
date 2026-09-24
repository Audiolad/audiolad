import {
  buildAuthorPartnerHomeUrl,
  buildAuthorPartnerInviteMessage,
  buildAuthorPartnerInviteUrl,
} from "@/lib/author-partner/invite-link";

export const HOME_PARTNER_LINK_TOKEN = "{HOME_PARTNER_LINK}";
export const AUTHOR_PARTNER_LINK_TOKEN = "{AUTHOR_PARTNER_LINK}";

export function defaultAuthorPartnerInviteTemplate(): string {
  return buildAuthorPartnerInviteMessage({
    homeUrl: HOME_PARTNER_LINK_TOKEN,
    authorUrl: AUTHOR_PARTNER_LINK_TOKEN,
  });
}

export function renderAuthorPartnerInviteTemplate(
  template: string | null | undefined,
  homeUrl: string,
  authorUrl: string,
): string {
  const source =
    typeof template === "string" && template.trim().length > 0
      ? template
      : defaultAuthorPartnerInviteTemplate();
  return source
    .split(HOME_PARTNER_LINK_TOKEN)
    .join(homeUrl)
    .split(AUTHOR_PARTNER_LINK_TOKEN)
    .join(authorUrl);
}

/**
 * Store the editor text with the current personal URLs turned back into
 * tokens, so a later primary-code change refreshes both links.
 */
export function captureAuthorPartnerInviteTemplate(
  displayed: string,
  homeUrl: string,
  authorUrl: string,
): string {
  let template = displayed;
  if (authorUrl) {
    template = template.split(authorUrl).join(AUTHOR_PARTNER_LINK_TOKEN);
  }
  if (homeUrl) {
    template = template.split(homeUrl).join(HOME_PARTNER_LINK_TOKEN);
  }
  return template.trim();
}

export function partnerInviteLinks(primaryCode: string, origin?: string) {
  return {
    homeUrl: buildAuthorPartnerHomeUrl(primaryCode, origin),
    authorUrl: buildAuthorPartnerInviteUrl(primaryCode, origin),
  };
}
