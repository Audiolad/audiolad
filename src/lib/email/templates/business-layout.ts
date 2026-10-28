import { BUSINESS_BRAND_NAME, businessBrandAssetUrl } from "@/lib/business-app/brand-icons";

import { escapeHtml } from "./escape-html";

/**
 * Email shell for АудиоЛад Бизнес only.
 * Colours are the jazz-coffee tokens from
 * src/components/business-app/theme/business-theme.css (the cabinet on
 * business.audiolad.ru). Hex is inlined because mail clients ignore
 * custom properties. The purple AudioLad shell in brand-layout.ts is not used.
 */
export const BUSINESS_EMAIL_COLORS = {
  /** --biz-cream / --biz-bg */
  background: "#f7f1e8",
  /** --biz-milk / --biz-surface */
  surface: "#fffaf3",
  /** --biz-sand-deep / --biz-border */
  border: "#e5d6c1",
  /** --biz-espresso / --biz-text */
  text: "#2b1d14",
  /** --biz-text-muted */
  muted: "#6b5848",
  /** --biz-coffee / --biz-accent */
  accent: "#6f4326",
  /** --biz-on-accent */
  onAccent: "#fff8ef",
  /** --biz-brass */
  brass: "#b8904f",
} as const;

/** Leather lotus already served on business.audiolad.ru. PNG, not webp: mail clients. */
export const BUSINESS_EMAIL_LOGO_URL = `https://business.audiolad.ru${businessBrandAssetUrl("apple-touch-icon.png")}`;

export const BUSINESS_EMAIL_SENDER_NAME = BUSINESS_BRAND_NAME;

const FONT = "Arial, Helvetica, sans-serif";

function assertBusinessUrl(href: string): string {
  const trimmed = href.trim();
  if (!trimmed.startsWith("https://business.audiolad.ru")) {
    throw new Error("business_email_link_must_stay_on_business_host");
  }
  return trimmed;
}

export function renderBusinessEmailParagraph(
  text: string,
  margin = "0 0 16px",
): string {
  return `<p
                  class="biz-email-body"
                  style="
                    margin: ${margin};
                    font-family: ${FONT};
                    font-size: 17px;
                    line-height: 1.55;
                    color: ${BUSINESS_EMAIL_COLORS.text};
                    text-align: left;
                  "
                >
                  ${escapeHtml(text)}
                </p>`;
}

export function renderBusinessEmailButton(href: string, label: string): string {
  const absoluteHref = assertBusinessUrl(href);
  const { accent, onAccent } = BUSINESS_EMAIL_COLORS;

  return `<table
                  role="presentation"
                  cellspacing="0"
                  cellpadding="0"
                  border="0"
                  align="center"
                  class="biz-email-button-wrap"
                  style="margin: 8px auto 20px"
                >
                  <tr>
                    <td
                      align="center"
                      bgcolor="${accent}"
                      style="border-radius: 12px; background-color: ${accent}; mso-padding-alt: 0;"
                    >
                      <!--[if mso]>
                        <v:roundrect
                          xmlns:v="urn:schemas-microsoft-com:vml"
                          xmlns:w="urn:schemas-microsoft-com:office:office"
                          href="${escapeHtml(absoluteHref)}"
                          style="height: 48px; v-text-anchor: middle; width: 240px;"
                          arcsize="24%"
                          stroke="f"
                          fillcolor="${accent}"
                        >
                          <w:anchorlock />
                          <center style="color: ${onAccent}; font-family: Arial, sans-serif; font-size: 17px; font-weight: bold;">
                            ${escapeHtml(label)}
                          </center>
                        </v:roundrect>
                      <![endif]-->
                      <!--[if !mso]><!-->
                      <a
                        class="biz-email-button-link"
                        href="${escapeHtml(absoluteHref)}"
                        target="_blank"
                        style="
                          display: inline-block;
                          min-width: 220px;
                          min-height: 48px;
                          padding: 14px 28px;
                          font-family: ${FONT};
                          font-size: 17px;
                          font-weight: 700;
                          line-height: 1.2;
                          color: ${onAccent};
                          text-decoration: none;
                          text-align: center;
                          border-radius: 12px;
                          background-color: ${accent};
                          box-sizing: border-box;
                        "
                        >${escapeHtml(label)}</a>
                      <!--<![endif]-->
                    </td>
                  </tr>
                </table>`;
}

export function renderBusinessEmailChoiceLinks(
  links: readonly { href: string; label: string }[],
): string {
  const items = links
    .map((link) => {
      const href = assertBusinessUrl(link.href);
      return `<a href="${escapeHtml(href)}" target="_blank" style="color: ${BUSINESS_EMAIL_COLORS.accent}; font-weight: 700; text-decoration: underline;">${escapeHtml(link.label)}</a>`;
    })
    .join(`<span style="color: ${BUSINESS_EMAIL_COLORS.muted};"> · </span>`);
  return `<p class="biz-email-choices" style="margin: 0 0 16px; font-family: ${FONT}; font-size: 17px; line-height: 1.55; color: ${BUSINESS_EMAIL_COLORS.text};">${items}</p>`;
}

export function renderBusinessEmailCta(href: string, label: string): string {
  const absoluteHref = assertBusinessUrl(href);
  return [
    renderBusinessEmailButton(absoluteHref, label),
    `<p
                  class="biz-email-fallback"
                  style="
                    margin: 0 0 8px;
                    font-family: ${FONT};
                    font-size: 14px;
                    line-height: 1.5;
                    color: ${BUSINESS_EMAIL_COLORS.muted};
                    text-align: left;
                  "
                >
                  Если кнопка не открывается, перейдите по ссылке:
                  <a href="${escapeHtml(absoluteHref)}" target="_blank" style="color: ${BUSINESS_EMAIL_COLORS.accent}; text-decoration: underline; word-break: break-all;">${escapeHtml(absoluteHref)}</a>
                </p>`,
  ].join("");
}

export function renderBusinessEmailShell(input: {
  title: string;
  preheader: string;
  bodyHtml: string;
  footerLines: string[];
  versionComment?: string;
}): string {
  const { background, surface, border, text, muted, brass } = BUSINESS_EMAIL_COLORS;
  const footerHtml = input.footerLines
    .map(
      (line) => `<p
                  class="biz-email-footer"
                  style="
                    margin: 0 0 8px;
                    font-family: ${FONT};
                    font-size: 14px;
                    line-height: 1.5;
                    color: ${muted};
                    text-align: center;
                  "
                >
                  ${escapeHtml(line)}
                </p>`,
    )
    .join("\n                ");

  return `<!DOCTYPE html>
<html lang="ru">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="light" />
    <meta name="supported-color-schemes" content="light" />
    <title>${escapeHtml(input.title)}</title>
    <!-- ${input.versionComment ?? "business-email"} -->
    <style type="text/css">
      body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
      img { border: 0; outline: none; text-decoration: none; display: block; }
      @media only screen and (max-width: 620px) {
        .biz-email-shell { padding: 16px 10px !important; }
        .biz-email-card { padding: 22px 16px 20px !important; }
        .biz-email-button-wrap { width: 100% !important; }
        .biz-email-button-link {
          display: block !important;
          width: 100% !important;
          min-width: 0 !important;
          box-sizing: border-box !important;
        }
      }
    </style>
  </head>
  <body style="margin: 0; padding: 0; width: 100% !important; background-color: ${background}; font-family: ${FONT}; color: ${text};">
    <span style="display: none !important; visibility: hidden; mso-hide: all; max-height: 0; max-width: 0; opacity: 0; overflow: hidden; font-size: 1px; line-height: 1px; color: transparent;">
      ${escapeHtml(input.preheader)}
    </span>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: ${background}; width: 100%;">
      <tr>
        <td align="center" class="biz-email-shell" style="padding: 32px 20px;">
          <table
            role="presentation"
            width="100%"
            cellspacing="0"
            cellpadding="0"
            border="0"
            style="width: 100%; max-width: 600px; background-color: ${surface}; border: 1px solid ${border}; border-radius: 18px;"
          >
            <tr>
              <td class="biz-email-card" style="padding: 32px 36px 28px;">
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin: 0 0 22px;">
                  <tr>
                    <td style="padding: 0 12px 0 0; vertical-align: middle;">
                      <img
                        src="${escapeHtml(BUSINESS_EMAIL_LOGO_URL)}"
                        alt="${escapeHtml(BUSINESS_EMAIL_SENDER_NAME)}"
                        width="56"
                        height="56"
                        style="width: 56px; height: 56px; border-radius: 50%; background-color: ${background};"
                      />
                    </td>
                    <td style="vertical-align: middle;">
                      <p style="margin: 0; font-family: ${FONT}; font-size: 18px; font-weight: 700; line-height: 1.2; color: ${text};">
                        ${escapeHtml(BUSINESS_EMAIL_SENDER_NAME)}
                      </p>
                    </td>
                  </tr>
                </table>
                <table role="presentation" width="72" cellspacing="0" cellpadding="0" border="0" style="margin: 0 0 22px;">
                  <tr>
                    <td style="height: 3px; line-height: 3px; font-size: 0; background-color: ${brass}; border-radius: 2px;">&nbsp;</td>
                  </tr>
                </table>
                ${input.bodyHtml}
              </td>
            </tr>
          </table>
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width: 600px;">
            <tr>
              <td align="center" style="padding: 18px 12px 0;">
                ${footerHtml}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
