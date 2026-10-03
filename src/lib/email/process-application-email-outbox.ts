import { activeSuppressionScopes, type ApplicationSuppressionEntry } from "@/lib/email/delivery-gate";
import { logMailingEvent } from "@/lib/email/mask-email";
import { brandEmailTemplateRenderer } from "@/lib/email/templates/renderer";
import type { EmailProviderResult } from "@/lib/email/types";

import type { ApplicationEmailRuntime, ApplicationOutboxRow } from "./application-email-runtime";
import { formatSenderAddress, getSenderIdentity } from "./sender-identities";

const DEFAULT_BATCH = 25;
const DEFAULT_LEASE_SECONDS = 120;

export type OutboundApplicationEmail = {
  from: string;
  replyTo: string;
  envelopeFrom: string;
  to: string;
  subject: string;
  html: string;
  text: string;
  messageId: string;
};

export type ApplicationEmailTransport =
  | {
      ok: true;
      from: string;
      replyTo: string;
      envelopeFrom: string;
    }
  | { ok: false; code: "sender_not_enabled" | "authors_smtp_not_configured"; retryable: boolean };

function senderIdentityFromPayload(payload: Record<string, unknown>): string {
  return typeof payload.senderIdentity === "string" && payload.senderIdentity.trim()
    ? payload.senderIdentity.trim()
    : "authors";
}

export function resolveApplicationEmailTransport(
  payload: Record<string, unknown>,
  options?: { authorsSmtpReady?: boolean },
): ApplicationEmailTransport {
  const identityKey = senderIdentityFromPayload(payload);

  if (identityKey !== "authors") {
    return { ok: false, code: "sender_not_enabled", retryable: false };
  }

  if (options?.authorsSmtpReady === false) {
    return { ok: false, code: "authors_smtp_not_configured", retryable: true };
  }

  const identity = getSenderIdentity("authors");
  return {
    ok: true,
    from: formatSenderAddress(identity),
    replyTo: (identity.replyTo ?? identity.from).trim().toLowerCase(),
    envelopeFrom: identity.from.trim().toLowerCase(),
  };
}

function suppressionBlocksRow(
  row: ApplicationOutboxRow,
  entries: readonly ApplicationSuppressionEntry[],
  now: Date,
): string | null {
  const scopes = activeSuppressionScopes({
    normalizedEmail: row.toEmail,
    suppressions: entries,
    now,
  });

  if (scopes.has("all") || scopes.has("all_non_critical")) {
    return scopes.has("all") ? "all" : "all_non_critical";
  }

  if (row.messageType === "author_marketing") {
    if (scopes.has("author_marketing")) return "author_marketing";
    if (scopes.has("marketing")) return "marketing";
  }

  return null;
}

export async function processApplicationEmailOutbox(options: {
  runtime: ApplicationEmailRuntime;
  deliver: (message: OutboundApplicationEmail) => Promise<EmailProviderResult>;
  now?: Date;
  limit?: number;
  leaseSeconds?: number;
  authorsSmtpReady?: boolean;
  suppressionsFor?: (
    normalizedEmail: string,
  ) => readonly ApplicationSuppressionEntry[] | Promise<readonly ApplicationSuppressionEntry[]>;
}): Promise<{ claimed: number; sent: number; failed: number; suppressed: number }> {
  const now = options.now ?? new Date();
  const claimedRows = await options.runtime.claimOutbox({
    limit: options.limit ?? DEFAULT_BATCH,
    leaseSeconds: options.leaseSeconds ?? DEFAULT_LEASE_SECONDS,
    now,
  });
  let sent = 0;
  let failed = 0;
  let suppressed = 0;
  const completedCampaigns = new Set<string>();

  for (const row of claimedRows) {
    const leaseToken = row.leaseToken;
    if (!leaseToken) {
      failed += 1;
      continue;
    }

    if (row.campaignId) {
      const campaign = await options.runtime.getCampaign(row.campaignId);
      if (campaign?.status === "cancelled") {
        const cancelled = await options.runtime.cancelOutbox({
          id: row.id,
          leaseToken,
          now,
        });
        if (cancelled) {
          suppressed += 1;
        }
        continue;
      }
    }

    const blocked = suppressionBlocksRow(
      row,
      (await options.suppressionsFor?.(row.toEmail)) ?? [],
      now,
    );
    if (blocked) {
      const ok = await options.runtime.suppressOutbox({
        id: row.id,
        leaseToken,
        reason: blocked,
        now,
      });
      if (ok) {
        suppressed += 1;
        logMailingEvent("mailing_recipient_failed", {
          outboxId: row.id,
          code: blocked,
        });
      }
      continue;
    }

    const transport = resolveApplicationEmailTransport(row.payload, {
      authorsSmtpReady: options.authorsSmtpReady,
    });
    if (!transport.ok) {
      const outcome = await options.runtime.failOutbox({
        id: row.id,
        leaseToken,
        errorCode: transport.code,
        errorMessage: transport.code,
        retryable: transport.retryable,
        now,
      });
      if (outcome !== "lost") {
        failed += 1;
        logMailingEvent("mailing_recipient_failed", {
          outboxId: row.id,
          code: transport.code,
        });
      }
      continue;
    }

    const rendered = await brandEmailTemplateRenderer.render({
      templateKey: row.templateKey,
      templateVersion: row.templateVersion,
      payload: row.payload,
    });

    if (!rendered.ok || !rendered.text) {
      const outcome = await options.runtime.failOutbox({
        id: row.id,
        leaseToken,
        errorCode: "invalid_payload",
        errorMessage: "invalid_payload",
        retryable: false,
        now,
      });
      if (outcome !== "lost") {
        failed += 1;
        logMailingEvent("mailing_recipient_failed", {
          outboxId: row.id,
          code: "invalid_payload",
        });
      }
      continue;
    }

    const delivery = await options.deliver({
      from: transport.from,
      replyTo: transport.replyTo,
      envelopeFrom: transport.envelopeFrom,
      to: row.toEmail,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      messageId: `<manual-campaign-${row.id}@audiolad.ru>`,
    });

    if (!delivery.ok) {
      const outcome = await options.runtime.failOutbox({
        id: row.id,
        leaseToken,
        errorCode: delivery.code,
        errorMessage: delivery.message,
        retryable: delivery.retryable !== false,
        now,
      });
      if (outcome !== "lost") {
        failed += 1;
        logMailingEvent("mailing_recipient_failed", {
          outboxId: row.id,
          code: delivery.code,
          email: row.toEmail,
        });
      }
      continue;
    }

    const completed = await options.runtime.completeOutbox({
      id: row.id,
      leaseToken,
      providerMessageId: delivery.providerMessageId ?? null,
      now,
    });
    if (completed) {
      sent += 1;
      if (row.campaignId) {
        completedCampaigns.add(row.campaignId);
      }
    }
  }

  for (const campaignId of completedCampaigns) {
    const campaign = await options.runtime.getCampaign(campaignId);
    if (
      campaign &&
      (campaign.status === "sent" ||
        campaign.status === "partially_failed" ||
        campaign.status === "failed")
    ) {
      logMailingEvent("mailing_campaign_completed", {
        campaignId,
        status: campaign.status,
        sent: campaign.recipientSent,
        failed: campaign.recipientFailed,
      });
    }
  }

  logMailingEvent("mailing_batch_processed", {
    claimed: claimedRows.length,
    sent,
    failed,
    suppressed,
  });

  return { claimed: claimedRows.length, sent, failed, suppressed };
}
