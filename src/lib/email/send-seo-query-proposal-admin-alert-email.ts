import type { SupabaseClient } from "@supabase/supabase-js";

import { resolveAuthorsEmailDeliveryFromEnv } from "@/lib/email/authors-email-transport";
import {
  acquireOperationalEmailDelivery,
  markOperationalEmailDeliveryAttempt,
  markOperationalEmailDeliveryFailed,
  markOperationalEmailDeliverySent,
  SEO_QUERY_PROPOSAL_SUBMITTED_ADMIN_MESSAGE_TYPE,
} from "@/lib/email/operational-deliveries";
import { createSmtpEmailProvider } from "@/lib/email/providers/smtp";
import { brandEmailTemplateRenderer } from "@/lib/email/templates/renderer";
import {
  buildSeoQueryProposalAdminAlertSubject,
  SEO_QUERY_PROPOSAL_ADMIN_ALERT_EMAIL_TEMPLATE_KEY,
  SEO_QUERY_PROPOSAL_ADMIN_ALERT_EMAIL_TEMPLATE_VERSION,
} from "@/lib/email/templates/seo-query-proposal-admin-alert";

export const SEO_QUERY_PROPOSAL_ADMIN_EMAIL = "authors@audiolad.ru";

export type SendSeoQueryProposalAdminAlertEmailInput = {
  proposalId: string;
  queryId: string;
  queryText: string;
  authorName: string;
  frequency: number | null;
  source: string;
  submittedAt: string;
  supabase?: SupabaseClient;
};

function formatSubmittedAt(submittedAt: string): string {
  const date = new Date(submittedAt);
  if (Number.isNaN(date.getTime())) return submittedAt;
  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Moscow",
  }).format(date);
}

export async function sendSeoQueryProposalAdminAlertEmail(
  input: SendSeoQueryProposalAdminAlertEmailInput,
) {
  const acquired = await acquireOperationalEmailDelivery(
    {
      applicationId: input.proposalId,
      recipientEmail: SEO_QUERY_PROPOSAL_ADMIN_EMAIL,
      messageType: SEO_QUERY_PROPOSAL_SUBMITTED_ADMIN_MESSAGE_TYPE,
    },
    input.supabase,
  );
  if (!acquired.ok) return { ok: false as const, code: acquired.code };
  if (!acquired.shouldSend) return { ok: true as const, skipped: true as const };

  const delivery = acquired.delivery;
  await markOperationalEmailDeliveryAttempt(delivery.id, input.supabase);

  const frequencyLabel =
    typeof input.frequency === "number"
      ? input.frequency.toLocaleString("ru-RU")
      : "—";
  const rendered = await brandEmailTemplateRenderer.render({
    templateKey: SEO_QUERY_PROPOSAL_ADMIN_ALERT_EMAIL_TEMPLATE_KEY,
    templateVersion: SEO_QUERY_PROPOSAL_ADMIN_ALERT_EMAIL_TEMPLATE_VERSION,
    payload: {
      authorName: input.authorName,
      queryText: input.queryText,
      frequencyLabel,
      sourceLabel: input.source === "wordstat" ? "Wordstat" : input.source,
      submittedAtLabel: formatSubmittedAt(input.submittedAt),
      queryId: input.queryId,
    },
  });
  if (!rendered.ok) {
    await markOperationalEmailDeliveryFailed(
      delivery.id,
      `template_render_failed:${rendered.code}`,
      input.supabase,
    );
    return { ok: false as const, code: "template_render_failed" as const };
  }

  const deliveryContext = resolveAuthorsEmailDeliveryFromEnv();
  if (!deliveryContext.ok) {
    await markOperationalEmailDeliveryFailed(
      delivery.id,
      "authors_smtp_not_configured",
      input.supabase,
    );
    return { ok: false as const, code: "authors_smtp_not_configured" as const };
  }

  const { smtpConfig, transport } = deliveryContext.delivery;
  const result = await createSmtpEmailProvider(smtpConfig).send({
    from: transport.from,
    envelopeFrom: transport.envelopeFrom,
    replyTo: transport.replyTo,
    to: SEO_QUERY_PROPOSAL_ADMIN_EMAIL,
    subject:
      rendered.subject ||
      buildSeoQueryProposalAdminAlertSubject(input.queryText),
    html: rendered.html,
    text: rendered.text ?? "",
  });

  if (!result.ok) {
    await markOperationalEmailDeliveryFailed(
      delivery.id,
      `${result.code}:${result.message ?? "send_failed"}`,
      input.supabase,
    );
    console.error("seo_query_proposal_admin_alert_send_failed", result.code);
    return { ok: false as const, code: "send_failed" as const };
  }

  await markOperationalEmailDeliverySent(delivery.id, input.supabase);
  return { ok: true as const, providerMessageId: result.providerMessageId };
}
