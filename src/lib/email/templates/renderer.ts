import {
  AUTHOR_APPLICATION_APPROVED_EMAIL_SUBJECT,
  AUTHOR_APPLICATION_APPROVED_EMAIL_TEMPLATE_KEY,
  AUTHOR_APPLICATION_APPROVED_EMAIL_TEMPLATE_VERSION,
  renderAuthorApplicationApprovedEmailHtml,
  renderAuthorApplicationApprovedEmailText,
} from "./author-application-approved";
import {
  AUTHOR_APPLICATION_SUBMITTED_EMAIL_SUBJECT,
  AUTHOR_APPLICATION_SUBMITTED_EMAIL_TEMPLATE_KEY,
  AUTHOR_APPLICATION_SUBMITTED_EMAIL_TEMPLATE_VERSION,
  renderAuthorApplicationSubmittedEmailHtml,
  renderAuthorApplicationSubmittedEmailText,
} from "./author-application-submitted";
import {
  RECOVERY_EMAIL_SUBJECT,
  RECOVERY_EMAIL_TEMPLATE_KEY,
  RECOVERY_EMAIL_TEMPLATE_VERSION,
  renderRecoveryEmailHtml,
} from "./recovery";
import type {
  EmailTemplateRenderInput,
  EmailTemplateRenderResult,
  EmailTemplateRenderer,
} from "./types";
import {
  WELCOME_EMAIL_SUBJECT,
  WELCOME_EMAIL_TEMPLATE_KEY,
  WELCOME_EMAIL_TEMPLATE_VERSION,
  renderWelcomeEmailHtml,
  renderWelcomeEmailText,
} from "./welcome";

function readString(payload: Record<string, unknown>, key: string): string | null {
  const value = payload[key];

  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  return trimmed ? trimmed : null;
}

export class BrandEmailTemplateRenderer implements EmailTemplateRenderer {
  async render(input: EmailTemplateRenderInput): Promise<EmailTemplateRenderResult> {
    if (input.templateKey === WELCOME_EMAIL_TEMPLATE_KEY) {
      const userName = readString(input.payload, "userName");

      if (!userName) {
        return { ok: false, code: "invalid_payload" };
      }

      const siteOrigin = readString(input.payload, "siteOrigin") ?? undefined;

      return {
        ok: true,
        subject: WELCOME_EMAIL_SUBJECT,
        html: renderWelcomeEmailHtml({ userName, siteOrigin }),
        text: renderWelcomeEmailText({ userName, siteOrigin }),
      };
    }

    if (input.templateKey === RECOVERY_EMAIL_TEMPLATE_KEY) {
      const confirmationUrl = readString(input.payload, "confirmationUrl");

      if (!confirmationUrl) {
        return { ok: false, code: "invalid_payload" };
      }

      const siteOrigin = readString(input.payload, "siteOrigin") ?? undefined;

      return {
        ok: true,
        subject: RECOVERY_EMAIL_SUBJECT,
        html: renderRecoveryEmailHtml({
          confirmationUrl,
          siteOrigin,
        }),
      };
    }

    if (input.templateKey === AUTHOR_APPLICATION_SUBMITTED_EMAIL_TEMPLATE_KEY) {
      const siteOrigin = readString(input.payload, "siteOrigin") ?? undefined;

      return {
        ok: true,
        subject: AUTHOR_APPLICATION_SUBMITTED_EMAIL_SUBJECT,
        html: renderAuthorApplicationSubmittedEmailHtml({ siteOrigin }),
        text: renderAuthorApplicationSubmittedEmailText({ siteOrigin }),
      };
    }

    if (input.templateKey === AUTHOR_APPLICATION_APPROVED_EMAIL_TEMPLATE_KEY) {
      const siteOrigin = readString(input.payload, "siteOrigin") ?? undefined;

      return {
        ok: true,
        subject: AUTHOR_APPLICATION_APPROVED_EMAIL_SUBJECT,
        html: renderAuthorApplicationApprovedEmailHtml({ siteOrigin }),
        text: renderAuthorApplicationApprovedEmailText({ siteOrigin }),
      };
    }

    return { ok: false, code: "template_not_found" };
  }
}

export function getBrandEmailTemplateVersion(templateKey: string): string | null {
  if (templateKey === WELCOME_EMAIL_TEMPLATE_KEY) {
    return WELCOME_EMAIL_TEMPLATE_VERSION;
  }

  if (templateKey === RECOVERY_EMAIL_TEMPLATE_KEY) {
    return RECOVERY_EMAIL_TEMPLATE_VERSION;
  }

  if (templateKey === AUTHOR_APPLICATION_SUBMITTED_EMAIL_TEMPLATE_KEY) {
    return AUTHOR_APPLICATION_SUBMITTED_EMAIL_TEMPLATE_VERSION;
  }

  if (templateKey === AUTHOR_APPLICATION_APPROVED_EMAIL_TEMPLATE_KEY) {
    return AUTHOR_APPLICATION_APPROVED_EMAIL_TEMPLATE_VERSION;
  }

  return null;
}

export const brandEmailTemplateRenderer = new BrandEmailTemplateRenderer();
