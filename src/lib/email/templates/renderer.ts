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
  AUTHOR_APPLICATION_ADMIN_ALERT_EMAIL_TEMPLATE_KEY,
  AUTHOR_APPLICATION_ADMIN_ALERT_EMAIL_TEMPLATE_VERSION,
  buildAuthorApplicationAdminAlertSubject,
  renderAuthorApplicationAdminAlertEmailHtml,
  renderAuthorApplicationAdminAlertEmailText,
} from "./author-application-admin-alert";
import {
  COMMERCIAL_APPLICATION_ADMIN_ALERT_EMAIL_TEMPLATE_KEY,
  COMMERCIAL_APPLICATION_ADMIN_ALERT_EMAIL_TEMPLATE_VERSION,
  buildCommercialApplicationAdminAlertSubject,
  renderCommercialApplicationAdminAlertEmailHtml,
  renderCommercialApplicationAdminAlertEmailText,
  type CommercialApplicationAdminAlertKind,
} from "./commercial-application-admin-alert";
import {
  COMMERCIAL_APPLICATION_APPROVED_EMAIL_SUBJECT,
  COMMERCIAL_APPLICATION_APPROVED_EMAIL_TEMPLATE_KEY,
  COMMERCIAL_APPLICATION_APPROVED_EMAIL_TEMPLATE_VERSION,
  renderCommercialApplicationApprovedEmailHtml,
  renderCommercialApplicationApprovedEmailText,
} from "./commercial-application-approved";
import {
  PAYOUT_PROFILE_ADMIN_SUBMITTED_EMAIL_TEMPLATE_KEY,
  PAYOUT_PROFILE_ADMIN_SUBMITTED_EMAIL_TEMPLATE_VERSION,
  buildPayoutProfileAdminSubmittedSubject,
  renderPayoutProfileAdminSubmittedEmailHtml,
  renderPayoutProfileAdminSubmittedEmailText,
} from "./payout-profile-admin-submitted";
import {
  PAYOUT_PROFILE_NEEDS_CHANGES_EMAIL_SUBJECT,
  PAYOUT_PROFILE_NEEDS_CHANGES_EMAIL_TEMPLATE_KEY,
  PAYOUT_PROFILE_NEEDS_CHANGES_EMAIL_TEMPLATE_VERSION,
  renderPayoutProfileNeedsChangesEmailHtml,
  renderPayoutProfileNeedsChangesEmailText,
} from "./payout-profile-needs-changes";
import {
  PAYOUT_PROFILE_REJECTED_EMAIL_SUBJECT,
  PAYOUT_PROFILE_REJECTED_EMAIL_TEMPLATE_KEY,
  PAYOUT_PROFILE_REJECTED_EMAIL_TEMPLATE_VERSION,
  renderPayoutProfileRejectedEmailHtml,
  renderPayoutProfileRejectedEmailText,
} from "./payout-profile-rejected";
import {
  PAYOUT_PROFILE_VERIFIED_EMAIL_SUBJECT,
  PAYOUT_PROFILE_VERIFIED_EMAIL_TEMPLATE_KEY,
  PAYOUT_PROFILE_VERIFIED_EMAIL_TEMPLATE_VERSION,
  renderPayoutProfileVerifiedEmailHtml,
  renderPayoutProfileVerifiedEmailText,
} from "./payout-profile-verified";
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

    if (input.templateKey === AUTHOR_APPLICATION_ADMIN_ALERT_EMAIL_TEMPLATE_KEY) {
      const applicationId = readString(input.payload, "applicationId");
      const displayName = readString(input.payload, "displayName");
      const contactEmail = readString(input.payload, "contactEmail");
      const direction = readString(input.payload, "direction");
      const submittedAtLabel = readString(input.payload, "submittedAtLabel");

      if (
        !applicationId ||
        !displayName ||
        !contactEmail ||
        !direction ||
        !submittedAtLabel
      ) {
        return { ok: false, code: "invalid_payload" };
      }

      const siteOrigin = readString(input.payload, "siteOrigin") ?? undefined;
      const contactDetails = readString(input.payload, "contactDetails") ?? "";

      return {
        ok: true,
        subject: buildAuthorApplicationAdminAlertSubject(displayName),
        html: renderAuthorApplicationAdminAlertEmailHtml({
          applicationId,
          displayName,
          contactEmail,
          contactDetails,
          direction,
          submittedAtLabel,
          siteOrigin,
        }),
        text: renderAuthorApplicationAdminAlertEmailText({
          applicationId,
          displayName,
          contactEmail,
          contactDetails,
          direction,
          submittedAtLabel,
          siteOrigin,
        }),
      };
    }

    if (
      input.templateKey === COMMERCIAL_APPLICATION_ADMIN_ALERT_EMAIL_TEMPLATE_KEY
    ) {
      const authorName = readString(input.payload, "authorName");
      const applicationId = readString(input.payload, "applicationId");

      if (!authorName || !applicationId) {
        return { ok: false, code: "invalid_payload" };
      }

      const siteOrigin = readString(input.payload, "siteOrigin") ?? undefined;
      const kindValue = readString(input.payload, "kind");
      const kind: CommercialApplicationAdminAlertKind =
        kindValue === "updated" ? "updated" : "submitted";

      return {
        ok: true,
        subject: buildCommercialApplicationAdminAlertSubject(authorName, kind),
        html: renderCommercialApplicationAdminAlertEmailHtml({
          authorName,
          applicationId,
          kind,
          siteOrigin,
        }),
        text: renderCommercialApplicationAdminAlertEmailText({
          authorName,
          applicationId,
          kind,
          siteOrigin,
        }),
      };
    }

    if (
      input.templateKey === COMMERCIAL_APPLICATION_APPROVED_EMAIL_TEMPLATE_KEY
    ) {
      const siteOrigin = readString(input.payload, "siteOrigin") ?? undefined;
      const authorName = readString(input.payload, "authorName");

      return {
        ok: true,
        subject: COMMERCIAL_APPLICATION_APPROVED_EMAIL_SUBJECT,
        html: renderCommercialApplicationApprovedEmailHtml({
          authorName,
          siteOrigin,
        }),
        text: renderCommercialApplicationApprovedEmailText({
          authorName,
          siteOrigin,
        }),
      };
    }

    if (input.templateKey === PAYOUT_PROFILE_ADMIN_SUBMITTED_EMAIL_TEMPLATE_KEY) {
      const authorName = readString(input.payload, "authorName");
      const profileId = readString(input.payload, "profileId");

      if (!authorName || !profileId) {
        return { ok: false, code: "invalid_payload" };
      }

      const siteOrigin = readString(input.payload, "siteOrigin") ?? undefined;

      return {
        ok: true,
        subject: buildPayoutProfileAdminSubmittedSubject(authorName),
        html: renderPayoutProfileAdminSubmittedEmailHtml({
          authorName,
          profileId,
          siteOrigin,
        }),
        text: renderPayoutProfileAdminSubmittedEmailText({
          authorName,
          profileId,
          siteOrigin,
        }),
      };
    }

    if (input.templateKey === PAYOUT_PROFILE_NEEDS_CHANGES_EMAIL_TEMPLATE_KEY) {
      const siteOrigin = readString(input.payload, "siteOrigin") ?? undefined;
      const authorName = readString(input.payload, "authorName");

      return {
        ok: true,
        subject: PAYOUT_PROFILE_NEEDS_CHANGES_EMAIL_SUBJECT,
        html: renderPayoutProfileNeedsChangesEmailHtml({
          authorName,
          siteOrigin,
        }),
        text: renderPayoutProfileNeedsChangesEmailText({
          authorName,
          siteOrigin,
        }),
      };
    }

    if (input.templateKey === PAYOUT_PROFILE_VERIFIED_EMAIL_TEMPLATE_KEY) {
      const siteOrigin = readString(input.payload, "siteOrigin") ?? undefined;
      const authorName = readString(input.payload, "authorName");

      return {
        ok: true,
        subject: PAYOUT_PROFILE_VERIFIED_EMAIL_SUBJECT,
        html: renderPayoutProfileVerifiedEmailHtml({
          authorName,
          siteOrigin,
        }),
        text: renderPayoutProfileVerifiedEmailText({
          authorName,
          siteOrigin,
        }),
      };
    }

    if (input.templateKey === PAYOUT_PROFILE_REJECTED_EMAIL_TEMPLATE_KEY) {
      const siteOrigin = readString(input.payload, "siteOrigin") ?? undefined;
      const authorName = readString(input.payload, "authorName");

      return {
        ok: true,
        subject: PAYOUT_PROFILE_REJECTED_EMAIL_SUBJECT,
        html: renderPayoutProfileRejectedEmailHtml({
          authorName,
          siteOrigin,
        }),
        text: renderPayoutProfileRejectedEmailText({
          authorName,
          siteOrigin,
        }),
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

  if (templateKey === AUTHOR_APPLICATION_ADMIN_ALERT_EMAIL_TEMPLATE_KEY) {
    return AUTHOR_APPLICATION_ADMIN_ALERT_EMAIL_TEMPLATE_VERSION;
  }

  if (templateKey === COMMERCIAL_APPLICATION_ADMIN_ALERT_EMAIL_TEMPLATE_KEY) {
    return COMMERCIAL_APPLICATION_ADMIN_ALERT_EMAIL_TEMPLATE_VERSION;
  }

  if (templateKey === COMMERCIAL_APPLICATION_APPROVED_EMAIL_TEMPLATE_KEY) {
    return COMMERCIAL_APPLICATION_APPROVED_EMAIL_TEMPLATE_VERSION;
  }

  if (templateKey === PAYOUT_PROFILE_ADMIN_SUBMITTED_EMAIL_TEMPLATE_KEY) {
    return PAYOUT_PROFILE_ADMIN_SUBMITTED_EMAIL_TEMPLATE_VERSION;
  }

  if (templateKey === PAYOUT_PROFILE_NEEDS_CHANGES_EMAIL_TEMPLATE_KEY) {
    return PAYOUT_PROFILE_NEEDS_CHANGES_EMAIL_TEMPLATE_VERSION;
  }

  if (templateKey === PAYOUT_PROFILE_VERIFIED_EMAIL_TEMPLATE_KEY) {
    return PAYOUT_PROFILE_VERIFIED_EMAIL_TEMPLATE_VERSION;
  }

  if (templateKey === PAYOUT_PROFILE_REJECTED_EMAIL_TEMPLATE_KEY) {
    return PAYOUT_PROFILE_REJECTED_EMAIL_TEMPLATE_VERSION;
  }

  return null;
}

export const brandEmailTemplateRenderer = new BrandEmailTemplateRenderer();
