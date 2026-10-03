import { validateEmailFormat } from "@/lib/auth/email/validate-format";
import { resolveAuthorsEmailDeliveryFromEnv } from "@/lib/email/authors-email-transport";
import { logMailingEvent } from "@/lib/email/mask-email";
import { createSmtpEmailProvider } from "@/lib/email/providers/smtp";
import { formatSenderAddress, getSenderIdentity } from "@/lib/email/sender-identities";
import {
  renderManualCampaignEmail,
  type ManualCampaignContent,
} from "@/lib/email/templates/manual-campaign";
import type { EmailProviderResult } from "@/lib/email/types";

export const TEST_SUBJECT_PREFIX = "[ТЕСТ] ";

export type TestSendMessage = {
  from: string;
  replyTo: string;
  envelopeFrom: string;
  to: string;
  subject: string;
  html: string;
  text: string;
  senderFrom: string;
};

export function parseMailingTestAllowlist(raw: string | null | undefined): string[] {
  if (!raw?.trim()) {
    return [];
  }

  const emails: string[] = [];
  for (const part of raw.split(",")) {
    const parsed = validateEmailFormat(part);
    if (!parsed.ok || parsed.domain !== "audiolad.ru") {
      continue;
    }
    const normalized = parsed.normalizedEmail.toLowerCase();
    if (!emails.includes(normalized)) {
      emails.push(normalized);
    }
  }

  return emails;
}

export function withTestSubjectPrefix(subject: string): string {
  if (subject.startsWith(TEST_SUBJECT_PREFIX)) {
    return subject;
  }

  return `${TEST_SUBJECT_PREFIX}${subject}`;
}

export function resolveTestSendRecipient(input: {
  actorEmail: string | null | undefined;
  requestedEmail: string;
  allowlist?: readonly string[];
}): { ok: true; email: string } | { ok: false; code: "test_recipient_not_allowed" } {
  const requested = validateEmailFormat(input.requestedEmail);
  if (!requested.ok) {
    return { ok: false, code: "test_recipient_not_allowed" };
  }

  const normalized = requested.normalizedEmail.toLowerCase();
  const actor = input.actorEmail ? validateEmailFormat(input.actorEmail) : null;
  const actorEmail = actor && actor.ok ? actor.normalizedEmail.toLowerCase() : null;
  const allowlist = new Set(
    (input.allowlist ?? parseMailingTestAllowlist(process.env.AUDIOLAD_MAILING_TEST_ALLOWLIST)).map(
      (email) => email.toLowerCase(),
    ),
  );

  if (actorEmail === normalized || allowlist.has(normalized)) {
    return { ok: true, email: normalized };
  }

  return { ok: false, code: "test_recipient_not_allowed" };
}

export function buildAuthorMailingTestMessage(input: {
  toEmail: string;
  subject: string;
  preheader?: string | null;
  content: ManualCampaignContent;
  firstName?: string | null;
  siteOrigin: string;
}): { ok: true; message: TestSendMessage } | { ok: false; code: "invalid_payload" | "url_invalid" } {
  const rendered = renderManualCampaignEmail({
    subject: input.subject,
    preheader: input.preheader,
    content: input.content,
    firstName: input.firstName,
    siteOrigin: input.siteOrigin,
  });

  if (!rendered.ok) {
    return rendered;
  }

  const identity = getSenderIdentity("authors");
  return {
    ok: true,
    message: {
      from: formatSenderAddress(identity),
      replyTo: (identity.replyTo ?? identity.from).trim().toLowerCase(),
      envelopeFrom: identity.from.trim().toLowerCase(),
      to: input.toEmail.trim().toLowerCase(),
      subject: withTestSubjectPrefix(rendered.subject),
      html: rendered.html,
      text: rendered.text,
      senderFrom: identity.from.trim().toLowerCase(),
    },
  };
}

export async function sendAuthorMailingTest(input: {
  actorEmail: string | null | undefined;
  requestedEmail: string;
  allowlist?: readonly string[];
  subject: string;
  preheader?: string | null;
  content: ManualCampaignContent;
  firstName?: string | null;
  siteOrigin: string;
  deliver?: (message: TestSendMessage) => Promise<EmailProviderResult>;
}): Promise<
  | { ok: true; providerMessageId?: string }
  | {
      ok: false;
      code:
        | "test_recipient_not_allowed"
        | "invalid_payload"
        | "url_invalid"
        | "authors_smtp_not_configured"
        | "send_failed";
    }
> {
  const recipient = resolveTestSendRecipient(input);
  if (!recipient.ok) {
    return recipient;
  }

  const built = buildAuthorMailingTestMessage({
    toEmail: recipient.email,
    subject: input.subject,
    preheader: input.preheader,
    content: input.content,
    firstName: input.firstName,
    siteOrigin: input.siteOrigin,
  });
  if (!built.ok) {
    return built;
  }

  logMailingEvent("mailing_test_send", {
    to: built.message.to,
    subject: built.message.subject,
  });

  if (input.deliver) {
    const result = await input.deliver(built.message);
    return result.ok
      ? { ok: true, providerMessageId: result.providerMessageId }
      : { ok: false, code: "send_failed" };
  }

  const delivery = resolveAuthorsEmailDeliveryFromEnv();
  if (!delivery.ok) {
    return { ok: false, code: "authors_smtp_not_configured" };
  }

  const provider = createSmtpEmailProvider(delivery.delivery.smtpConfig);
  const result = await provider.send({
    from: delivery.delivery.transport.from,
    replyTo: delivery.delivery.transport.replyTo,
    envelopeFrom: delivery.delivery.transport.envelopeFrom,
    to: built.message.to,
    subject: built.message.subject,
    html: built.message.html,
    text: built.message.text,
  });

  if (!result.ok) {
    return { ok: false, code: "send_failed" };
  }

  return { ok: true, providerMessageId: result.providerMessageId };
}
