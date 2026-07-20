import { getAppOrigin } from "@/lib/seo/app-origin";

import {
  renderBrandEmailButton,
  renderBrandEmailDivider,
  renderBrandEmailHeading,
  renderBrandEmailInfoBlock,
  renderBrandEmailInlineLinks,
  renderBrandEmailParagraph,
  renderBrandEmailShell,
} from "./brand-layout";
import { escapeHtml } from "./escape-html";

export const RECOVERY_EMAIL_SUBJECT = "Восстановление пароля в АудиоЛаде";
export const RECOVERY_EMAIL_TEMPLATE_KEY = "recovery";
export const RECOVERY_EMAIL_TEMPLATE_VERSION = "typography-v4-20260720";

export type RecoveryEmailInput = {
  confirmationUrl: string;
  siteOrigin?: string;
};

function renderRecoverySecurityBlock(): string {
  return renderBrandEmailInfoBlock(`<table
                        role="presentation"
                        width="100%"
                        cellspacing="0"
                        cellpadding="0"
                        border="0"
                      >
                        <tr>
                          <td
                            width="28"
                            valign="top"
                            style="padding: 0 12px 0 0; line-height: 0"
                          >
                            <svg
                              width="22"
                              height="22"
                              viewBox="0 0 24 24"
                              xmlns="http://www.w3.org/2000/svg"
                              aria-hidden="true"
                              style="display: block"
                            >
                              <path
                                fill="#5E2CA5"
                                d="M12 2 4 6v6c0 5.3 3.6 10.2 8 11.9 4.4-1.7 8-6.6 8-11.9V6l-8-4zm0 2.2 5.8 2.9v5.9c0 4-2.6 7.7-5.8 9.1-3.2-1.4-5.8-5.1-5.8-9.1V7.1L12 4.2z"
                              />
                              <path
                                fill="#5E2CA5"
                                d="M11 8h2v5h-2V8zm0 7h2v2h-2v-2z"
                              />
                            </svg>
                          </td>
                          <td valign="top">
                            ${renderBrandEmailParagraph(
                              "Если вы не запрашивали восстановление пароля, просто проигнорируйте это письмо.",
                              "email-security",
                              "0 0 8px",
                            )}
                            ${renderBrandEmailParagraph(
                              "Ссылка действительна ограниченное время и станет недействительной после использования.",
                              "email-security",
                              "0",
                            )}
                          </td>
                        </tr>
                      </table>`);
}

function renderRecoveryBodyHtml(input: RecoveryEmailInput): string {
  const siteOrigin = (input.siteOrigin ?? getAppOrigin()).replace(/\/$/, "");
  const confirmationUrl = input.confirmationUrl;

  return [
    renderBrandEmailHeading("Восстановление пароля"),
    renderBrandEmailParagraph("Здравствуйте!", "email-greeting"),
    renderBrandEmailParagraph(
      "Мы получили запрос на восстановление пароля для вашего аккаунта в АудиоЛаде.",
      "email-body",
    ),
    renderBrandEmailParagraph(
      "Нажмите кнопку ниже, чтобы создать новый пароль.",
      "email-body",
      "0 0 24px",
    ),
    renderBrandEmailButton(confirmationUrl, "Создать новый пароль"),
    renderBrandEmailDivider(),
    renderBrandEmailParagraph(
      "Если кнопка не работает, скопируйте ссылку ниже и откройте её в браузере:",
      "email-helper",
    ),
    `<p
                  class="email-fallback-url"
                  style="
                    margin: 0 0 20px;
                    font-family: Arial, Helvetica, sans-serif;
                    font-size: 16px;
                    line-height: 1.5;
                    word-break: break-all;
                    overflow-wrap: anywhere;
                    text-align: left;
                  "
                >
                  <a
                    href="${escapeHtml(confirmationUrl)}"
                    style="color: #5e2ca5; text-decoration: underline"
                    >${escapeHtml(confirmationUrl)}</a
                  >
                </p>`,
    renderRecoverySecurityBlock(),
    renderBrandEmailDivider("margin: 0 0 18px"),
    renderBrandEmailInlineLinks([
      { label: "Сайт", href: siteOrigin },
      { label: "Аудиотека", href: `${siteOrigin}/my-practices` },
    ]),
  ].join("\n\n                ");
}

export function renderRecoveryEmailHtml(input: RecoveryEmailInput): string {
  const siteOrigin = (input.siteOrigin ?? getAppOrigin()).replace(/\/$/, "");
  const logoUrl = `${siteOrigin}/brand/audiolad-logo-horizontal.png`;

  return renderBrandEmailShell({
    title: "Восстановление пароля",
    preheader: "AUDIOLAD_RECOVERY_TYPOGRAPHY_V4_20260720",
    logoUrl,
    bodyHtml: renderRecoveryBodyHtml(input),
    footerLines: [
      "© АудиоЛад, 2026. Все права защищены.",
      "Вы получили это письмо, потому что запросили восстановление пароля.",
    ],
  });
}

export function renderRecoveryGoTrueTemplateHtml(siteOrigin?: string): string {
  const origin = (siteOrigin ?? getAppOrigin()).replace(/\/$/, "");
  const logoUrl = `${origin}/brand/audiolad-logo-horizontal.png`;

  return renderBrandEmailShell({
    title: "Восстановление пароля",
    preheader: "AUDIOLAD_RECOVERY_TYPOGRAPHY_V4_20260720",
    logoUrl,
    versionComment: `AUDIOLAD_RECOVERY_TEMPLATE_VERSION: ${RECOVERY_EMAIL_TEMPLATE_VERSION}`,
    bodyHtml: renderRecoveryBodyHtml({
      confirmationUrl: "{{ .ConfirmationURL }}",
      siteOrigin: origin,
    }),
    footerLines: [
      "© АудиоЛад, 2026. Все права защищены.",
      "Вы получили это письмо, потому что запросили восстановление пароля.",
    ],
    footerExtraHtml: `{{ if .UnsubscribeURL }}
                <p
                  class="email-footer"
                  style="
                    margin: 0;
                    font-family: Arial, Helvetica, sans-serif;
                    font-size: 15px;
                    line-height: 1.5;
                    color: #756b88;
                    text-align: center;
                  "
                >
                  Если вы не хотите получать подобные письма, вы можете
                  <a
                    href="{{ .UnsubscribeURL }}"
                    style="color: #5e2ca5; text-decoration: underline"
                    >отписаться от рассылки</a
                  >.
                </p>
                {{ end }}`,
  });
}
