import type { SupabaseClient } from "@supabase/supabase-js";

import { resolveAuthorsEmailDeliveryFromEnv } from "@/lib/email/authors-email-transport";
import {
  acquireOperationalEmailDelivery,
  markOperationalEmailDeliveryAttempt,
  markOperationalEmailDeliveryFailed,
  markOperationalEmailDeliverySent,
  SEO_QUERY_PROPOSAL_APPROVED_AUTHOR_MESSAGE_TYPE,
  SEO_QUERY_PROPOSAL_REJECTED_AUTHOR_MESSAGE_TYPE,
} from "@/lib/email/operational-deliveries";
import { createSmtpEmailProvider } from "@/lib/email/providers/smtp";
import { brandEmailTemplateRenderer } from "@/lib/email/templates/renderer";
import {
  buildSeoQueryProposalApprovedSubject,
  buildSeoQueryProposalRejectedSubject,
  SEO_QUERY_PROPOSAL_APPROVED_EMAIL_TEMPLATE_KEY,
  SEO_QUERY_PROPOSAL_APPROVED_EMAIL_TEMPLATE_VERSION,
  SEO_QUERY_PROPOSAL_REJECTED_EMAIL_TEMPLATE_KEY,
  SEO_QUERY_PROPOSAL_REJECTED_EMAIL_TEMPLATE_VERSION,
} from "@/lib/email/templates/seo-query-proposal-decision";
import { getAppOrigin } from "@/lib/seo/app-origin";
import { buildAuthorProductCreateHref } from "@/lib/seo-queries/reservation-product-create-href";

function formatLabel(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Moscow",
  }).format(date);
}

async function sendWithAuthorsSmtp(input: {
  deliveryId: string;
  to: string;
  subject: string;
  html: string;
  text: string;
  supabase?: SupabaseClient;
}) {
  const deliveryContext = resolveAuthorsEmailDeliveryFromEnv();
  if (!deliveryContext.ok) {
    await markOperationalEmailDeliveryFailed(
      input.deliveryId,
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
    to: input.to,
    subject: input.subject,
    html: input.html,
    text: input.text,
  });
  if (!result.ok) {
    await markOperationalEmailDeliveryFailed(
      input.deliveryId,
      `${result.code}:${result.message ?? "send_failed"}`,
      input.supabase,
    );
    return { ok: false as const, code: "send_failed" as const };
  }
  await markOperationalEmailDeliverySent(input.deliveryId, input.supabase);
  return { ok: true as const, providerMessageId: result.providerMessageId };
}

export async function sendSeoQueryProposalApprovedAuthorEmail(input: {
  proposalId: string;
  recipientEmail: string;
  queryText: string;
  frequency: number | null;
  expiresAt: string;
  authorSlug: string;
  reservationId: string;
  supabase?: SupabaseClient;
}) {
  const acquired = await acquireOperationalEmailDelivery(
    {
      applicationId: input.proposalId,
      recipientEmail: input.recipientEmail,
      messageType: SEO_QUERY_PROPOSAL_APPROVED_AUTHOR_MESSAGE_TYPE,
    },
    input.supabase,
  );
  if (!acquired.ok) return { ok: false as const, code: acquired.code };
  if (!acquired.shouldSend) return { ok: true as const, skipped: true as const };

  const delivery = acquired.delivery;
  await markOperationalEmailDeliveryAttempt(delivery.id, input.supabase);

  const origin = getAppOrigin().replace(/\/$/, "");
  const createProductUrl = `${origin}${buildAuthorProductCreateHref({
    authorSlug: input.authorSlug,
    reservationId: input.reservationId,
  })}`;
  const frequencyLabel =
    typeof input.frequency === "number"
      ? input.frequency.toLocaleString("ru-RU")
      : "—";

  const rendered = await brandEmailTemplateRenderer.render({
    templateKey: SEO_QUERY_PROPOSAL_APPROVED_EMAIL_TEMPLATE_KEY,
    templateVersion: SEO_QUERY_PROPOSAL_APPROVED_EMAIL_TEMPLATE_VERSION,
    payload: {
      queryText: input.queryText,
      frequencyLabel,
      expiresAtLabel: formatLabel(input.expiresAt),
      createProductUrl,
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

  return sendWithAuthorsSmtp({
    deliveryId: delivery.id,
    to: input.recipientEmail,
    subject:
      rendered.subject || buildSeoQueryProposalApprovedSubject(input.queryText),
    html: rendered.html,
    text: rendered.text ?? "",
    supabase: input.supabase,
  });
}

export async function sendSeoQueryProposalRejectedAuthorEmail(input: {
  proposalId: string;
  recipientEmail: string;
  queryText: string;
  authorSlug: string;
  supabase?: SupabaseClient;
}) {
  const acquired = await acquireOperationalEmailDelivery(
    {
      applicationId: input.proposalId,
      recipientEmail: input.recipientEmail,
      messageType: SEO_QUERY_PROPOSAL_REJECTED_AUTHOR_MESSAGE_TYPE,
    },
    input.supabase,
  );
  if (!acquired.ok) return { ok: false as const, code: acquired.code };
  if (!acquired.shouldSend) return { ok: true as const, skipped: true as const };

  const delivery = acquired.delivery;
  await markOperationalEmailDeliveryAttempt(delivery.id, input.supabase);

  const origin = getAppOrigin().replace(/\/$/, "");
  const opportunitiesUrl = `${origin}/author-dashboard/seo-opportunities?author=${encodeURIComponent(input.authorSlug)}`;

  const rendered = await brandEmailTemplateRenderer.render({
    templateKey: SEO_QUERY_PROPOSAL_REJECTED_EMAIL_TEMPLATE_KEY,
    templateVersion: SEO_QUERY_PROPOSAL_REJECTED_EMAIL_TEMPLATE_VERSION,
    payload: {
      queryText: input.queryText,
      opportunitiesUrl,
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

  return sendWithAuthorsSmtp({
    deliveryId: delivery.id,
    to: input.recipientEmail,
    subject:
      rendered.subject || buildSeoQueryProposalRejectedSubject(input.queryText),
    html: rendered.html,
    text: rendered.text ?? "",
    supabase: input.supabase,
  });
}
