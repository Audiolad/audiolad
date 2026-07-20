import { escapeHtml } from "./escape-html";

export const BRAND_EMAIL_TEMPLATE_VERSION = "typography-v4-20260720";

export type BrandEmailLink = {
  label: string;
  href: string;
};

export type BrandEmailShellInput = {
  title: string;
  preheader: string;
  logoUrl: string;
  bodyHtml: string;
  footerLines: string[];
  footerExtraHtml?: string;
  versionComment?: string;
};

export function renderBrandEmailStyles(): string {
  return `<style type="text/css">
      body,
      table,
      td,
      a {
        -webkit-text-size-adjust: 100%;
        -ms-text-size-adjust: 100%;
      }
      body,
      table,
      td,
      img {
        box-sizing: border-box;
      }
      table,
      td {
        mso-table-lspace: 0pt;
        mso-table-rspace: 0pt;
      }
      img {
        -ms-interpolation-mode: bicubic;
        border: 0;
        outline: none;
        text-decoration: none;
        display: block;
      }
      @media only screen and (max-width: 620px) {
        .email-outer {
          width: 100% !important;
          max-width: 100% !important;
          table-layout: fixed !important;
        }
        .email-shell {
          width: 100% !important;
          max-width: 100% !important;
          padding: 20px 16px !important;
          box-sizing: border-box !important;
        }
        .email-card-wrap {
          width: 100% !important;
          max-width: 100% !important;
          table-layout: fixed !important;
        }
        .email-card {
          padding: 20px !important;
          box-sizing: border-box !important;
        }
        .email-logo {
          width: 220px !important;
          max-width: 220px !important;
          height: auto !important;
        }
        .email-button-wrap {
          width: 100% !important;
        }
        .email-button-link {
          display: block !important;
          width: 100% !important;
          min-width: 0 !important;
          box-sizing: border-box !important;
          min-height: 58px !important;
        }
        .email-links-cell {
          display: block !important;
          width: 100% !important;
          text-align: center !important;
          padding: 6px 0 !important;
          white-space: normal !important;
        }
        .email-links-divider {
          display: none !important;
        }
      }
      @media only screen and (max-width: 480px) {
        .email-shell {
          padding: 16px 10px !important;
        }
        .email-heading {
          font-size: 32px !important;
          line-height: 1.2 !important;
        }
        .email-greeting,
        .email-body {
          font-size: 20px !important;
          line-height: 1.6 !important;
        }
        .email-helper,
        .email-security,
        .email-links,
        .email-list {
          font-size: 17px !important;
        }
        .email-fallback-url {
          font-size: 16px !important;
        }
        .email-button-link {
          font-size: 19px !important;
          min-height: 58px !important;
        }
        .email-footer {
          font-size: 15px !important;
          line-height: 1.5 !important;
        }
      }
    </style>`;
}

export function renderBrandEmailHeading(title: string): string {
  return `<h1
                  class="email-heading"
                  style="
                    margin: 0 0 18px;
                    font-family: Arial, Helvetica, sans-serif;
                    font-size: 36px;
                    font-weight: 700;
                    line-height: 1.2;
                    color: #2a1b55;
                    text-align: left;
                  "
                >
                  ${escapeHtml(title)}
                </h1>`;
}

export function renderBrandEmailParagraph(
  html: string,
  className: "email-greeting" | "email-body" | "email-helper" | "email-security" | "email-list",
  margin = "0 0 10px",
): string {
  return `<p
                  class="${className}"
                  style="
                    margin: ${margin};
                    font-family: Arial, Helvetica, sans-serif;
                    font-size: ${className === "email-helper" || className === "email-security" || className === "email-list" ? "17px" : "20px"};
                    line-height: ${className === "email-helper" || className === "email-security" || className === "email-list" ? "1.55" : "1.6"};
                    color: ${className === "email-helper" ? "#6f6582" : "#241447"};
                    text-align: left;
                  "
                >
                  ${html}
                </p>`;
}

export function renderBrandEmailDivider(margin = "margin: 0 0 20px"): string {
  return `<table
                  role="presentation"
                  width="100%"
                  cellspacing="0"
                  cellpadding="0"
                  border="0"
                  style="${margin}"
                >
                  <tr>
                    <td
                      style="
                        border-top: 1px solid #e7e0f2;
                        font-size: 0;
                        line-height: 0;
                      "
                    >
                      &nbsp;
                    </td>
                  </tr>
                </table>`;
}

export function renderBrandEmailButton(
  href: string,
  label: string,
  options?: { msoWidth?: number },
): string {
  const msoWidth = options?.msoWidth ?? 320;

  return `<table
                  role="presentation"
                  cellspacing="0"
                  cellpadding="0"
                  border="0"
                  align="center"
                  style="margin: 0 auto 24px"
                >
                  <tr>
                    <td
                      class="email-button-wrap"
                      align="center"
                      bgcolor="#6633cc"
                      style="
                        border-radius: 14px;
                        background-color: #6633cc;
                        mso-padding-alt: 0;
                      "
                    >
                      <!--[if mso]>
                        <v:roundrect
                          xmlns:v="urn:schemas-microsoft-com:vml"
                          xmlns:w="urn:schemas-microsoft-com:office:office"
                          href="${escapeHtml(href)}"
                          style="
                            height: 58px;
                            v-text-anchor: middle;
                            width: ${msoWidth}px;
                          "
                          arcsize="26%"
                          stroke="f"
                          fillcolor="#6633CC"
                        >
                          <w:anchorlock />
                          <center
                            style="
                              color: #ffffff;
                              font-family: Arial, sans-serif;
                              font-size: 19px;
                              font-weight: bold;
                            "
                          >
                            ${escapeHtml(label)}
                          </center>
                        </v:roundrect>
                      <![endif]-->
                      <!--[if !mso]><!-->
                      <a
                        class="email-button-link"
                        href="${escapeHtml(href)}"
                        target="_blank"
                        style="
                          display: inline-block;
                          min-width: 280px;
                          min-height: 58px;
                          padding: 18px 36px;
                          font-family: Arial, Helvetica, sans-serif;
                          font-size: 19px;
                          font-weight: 700;
                          line-height: 1.2;
                          color: #ffffff;
                          text-decoration: none;
                          text-align: center;
                          border-radius: 14px;
                          background-color: #6633cc;
                          box-sizing: border-box;
                        "
                        >${escapeHtml(label)}</a
                      >
                      <!--<![endif]-->
                    </td>
                  </tr>
                </table>`;
}

export function renderBrandEmailInfoBlock(contentHtml: string): string {
  return `<table
                  role="presentation"
                  width="100%"
                  cellspacing="0"
                  cellpadding="0"
                  border="0"
                  style="
                    margin: 0 0 24px;
                    background-color: #f4f1ff;
                    border: 1px solid #e6dcf8;
                    border-radius: 14px;
                  "
                >
                  <tr>
                    <td style="padding: 18px 20px">
                      ${contentHtml}
                    </td>
                  </tr>
                </table>`;
}

export function renderBrandEmailInlineLinks(links: BrandEmailLink[]): string {
  const cells = links.flatMap((link, index) => {
    const linkCell = `<td
                      class="email-links-cell email-links"
                      align="center"
                      style="
                        font-family: Arial, Helvetica, sans-serif;
                        font-size: 17px;
                        line-height: 1.5;
                        color: #6f6582;
                        white-space: nowrap;
                      "
                    >
                      ${escapeHtml(link.label)}:
                      <a
                        href="${escapeHtml(link.href)}"
                        style="color: #5e2ca5; text-decoration: none; font-weight: 600"
                        >${escapeHtml(link.href.replace(/^https?:\/\//, ""))}</a
                      >
                    </td>`;

    if (index === links.length - 1) {
      return [linkCell];
    }

    return [
      linkCell,
      `<td
                      class="email-links-divider"
                      width="1"
                      style="
                        border-left: 1px solid #e7e0f2;
                        font-size: 0;
                        line-height: 0;
                      "
                    >
                      &nbsp;
                    </td>`,
    ];
  });

  return `<table
                  role="presentation"
                  width="100%"
                  cellspacing="0"
                  cellpadding="0"
                  border="0"
                >
                  <tr>
                    ${cells.join("\n                    ")}
                  </tr>
                </table>`;
}

export function renderBrandEmailBulletLinks(
  title: string,
  links: BrandEmailLink[],
): string {
  const items = links
    .map(
      (link) => `<tr>
                        <td
                          class="email-list"
                          style="
                            padding: 4px 0;
                            font-family: Arial, Helvetica, sans-serif;
                            font-size: 17px;
                            line-height: 1.55;
                            color: #241447;
                          "
                        >
                          •
                          <a
                            href="${escapeHtml(link.href)}"
                            style="color: #5e2ca5; text-decoration: none; font-weight: 600"
                            >${escapeHtml(link.label)}</a
                          >
                        </td>
                      </tr>`,
    )
    .join("\n                      ");

  return `${renderBrandEmailParagraph(
    `<strong>${escapeHtml(title)}</strong>`,
    "email-list",
    "0 0 10px",
  )}
                <table
                  role="presentation"
                  width="100%"
                  cellspacing="0"
                  cellpadding="0"
                  border="0"
                  style="margin: 0 0 24px"
                >
                  ${items}
                </table>`;
}

export function renderBrandEmailShell(input: BrandEmailShellInput): string {
  const footerHtml = input.footerLines
    .map(
      (line) => `<p
                  class="email-footer"
                  style="
                    margin: 0 0 8px;
                    font-family: Arial, Helvetica, sans-serif;
                    font-size: 15px;
                    line-height: 1.5;
                    color: #756b88;
                    text-align: center;
                  "
                >
                  ${line}
                </p>`,
    )
    .join("\n                ");

  return `<!DOCTYPE html>
<html lang="ru" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="light" />
    <meta name="supported-color-schemes" content="light" />
    <meta http-equiv="X-UA-Compatible" content="IE=edge" />
    <title>${escapeHtml(input.title)}</title>
    <!-- ${input.versionComment ?? `AUDIOLAD_BRAND_EMAIL_TEMPLATE_VERSION: ${BRAND_EMAIL_TEMPLATE_VERSION}`} -->
    <!--[if mso]>
      <noscript>
        <xml>
          <o:OfficeDocumentSettings>
            <o:PixelsPerInch>96</o:PixelsPerInch>
          </o:OfficeDocumentSettings>
        </xml>
      </noscript>
    <![endif]-->
    ${renderBrandEmailStyles()}
  </head>
  <body
    style="
      margin: 0;
      padding: 0;
      width: 100% !important;
      height: 100% !important;
      background-color: #f7f5ff;
      font-family: Arial, Helvetica, sans-serif;
      color: #241447;
      line-height: 1.6;
    "
  >
    <span
      style="display:none!important;visibility:hidden;mso-hide:all;
             max-height:0;max-width:0;opacity:0;overflow:hidden;
             font-size:1px;line-height:1px;color:transparent;"
    >
      ${escapeHtml(input.preheader)}
    </span>
    <table
      role="presentation"
      class="email-outer"
      width="100%"
      cellspacing="0"
      cellpadding="0"
      border="0"
      style="background-color: #f7f5ff; width: 100%; max-width: 100%; table-layout: fixed"
    >
      <tr>
        <td align="center" class="email-shell" style="padding: 32px 20px; box-sizing: border-box; width: 100%; max-width: 100%">
          <table
            role="presentation"
            class="email-card-wrap"
            width="100%"
            cellspacing="0"
            cellpadding="0"
            border="0"
            style="
              width: 100%;
              max-width: 600px;
              table-layout: fixed;
              background-color: #ffffff;
              border-radius: 24px;
              border: 1px solid #ece7f4;
              box-shadow: 0 8px 28px rgba(94, 44, 165, 0.08);
            "
          >
            <tr>
              <td class="email-card" style="padding: 40px 44px 32px">
                <table
                  role="presentation"
                  width="100%"
                  cellspacing="0"
                  cellpadding="0"
                  border="0"
                >
                  <tr>
                    <td align="center" style="padding: 0 0 28px">
                      <img
                        class="email-logo"
                        src="${escapeHtml(input.logoUrl)}"
                        alt="АудиоЛад"
                        width="280"
                        height="93"
                        style="
                          width: 280px;
                          max-width: 280px;
                          height: auto;
                          margin: 0 auto;
                        "
                      />
                    </td>
                  </tr>
                </table>

                ${input.bodyHtml}
              </td>
            </tr>
          </table>

          <table
            role="presentation"
            width="100%"
            cellspacing="0"
            cellpadding="0"
            border="0"
            style="max-width: 600px"
          >
            <tr>
              <td align="center" style="padding: 20px 12px 0">
                ${footerHtml}
                ${input.footerExtraHtml ?? ""}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
