import { validateEmailFormat } from "@/lib/auth/email/validate-format";
import {
  evaluateAuthorDelivery,
  activeSuppressionScopes,
  type ApplicationSuppressionEntry,
  type AuthorDeliveryPreference,
} from "@/lib/email/delivery-gate";
import { parseAbsoluteHttpUrl } from "@/lib/email/templates/manual-campaign";
import type { EmailOutboxStatus } from "@/lib/email/types";

import type { ApplicationEmailRuntime } from "./application-email-runtime";
import { APPLICATION_EMAIL_MESSAGE_TYPES, type ApplicationEmailMessageType } from "./message-types";

export type EnqueueEmailInput = {
  messageType: ApplicationEmailMessageType;
  contactId?: string | null;
  userId?: string | null;
  toEmail: string;
  templateKey: string;
  templateVersion: string;
  payload?: Record<string, unknown>;
  priority?: number;
  scheduledAt?: string;
  deduplicationKey?: string | null;
  campaignId?: string | null;
  campaignRecipientId?: string | null;
  gate?: {
    suppressions: readonly ApplicationSuppressionEntry[];
    preference: AuthorDeliveryPreference | null;
    latestAuthorMarketingConsent: "granted" | "revoked" | null;
  };
};

export type EnqueueEmailResult =
  | { ok: true; outboxId: string; status: EmailOutboxStatus; deduped: boolean }
  | {
      ok: false;
      code:
        | "suppressed"
        | "preference"
        | "consent_required"
        | "invalid_input"
        | "unsubscribe_not_configured";
      reason?: string;
    };

const MAX_PAYLOAD_CHARS = 20000;

function isAuthorMessage(
  messageType: ApplicationEmailMessageType,
): messageType is "author_operational" | "author_marketing" {
  return messageType === "author_operational" || messageType === "author_marketing";
}

function safePayload(payload: Record<string, unknown> | undefined): Record<string, unknown> | null {
  const source = payload ?? {};
  let encoded: string;

  try {
    encoded = JSON.stringify(source);
  } catch {
    return null;
  }

  if (!encoded || encoded.length > MAX_PAYLOAD_CHARS) {
    return null;
  }

  const parsed = JSON.parse(encoded) as Record<string, unknown>;
  if (Object.prototype.hasOwnProperty.call(parsed, "html")) {
    return null;
  }

  return parsed;
}

export async function enqueueApplicationEmail(
  input: EnqueueEmailInput,
  runtime: ApplicationEmailRuntime,
  now: Date = new Date(),
): Promise<EnqueueEmailResult> {
  if (!(APPLICATION_EMAIL_MESSAGE_TYPES as readonly string[]).includes(input.messageType)) {
    return { ok: false, code: "invalid_input" };
  }

  const email = validateEmailFormat(input.toEmail);
  if (!email.ok || !input.templateKey.trim() || !input.templateVersion.trim()) {
    return { ok: false, code: "invalid_input" };
  }

  const payload = safePayload(input.payload);
  if (!payload) {
    return { ok: false, code: "invalid_input" };
  }

  if (isAuthorMessage(input.messageType)) {
    const decision = evaluateAuthorDelivery({
      messageType: input.messageType,
      scopes: activeSuppressionScopes({
        normalizedEmail: email.normalizedEmail,
        suppressions: input.gate?.suppressions ?? [],
        now,
      }),
      preference: input.gate?.preference ?? null,
      latestAuthorMarketingConsent: input.gate?.latestAuthorMarketingConsent ?? null,
    });

    if (!decision.ok) {
      return { ok: false, code: decision.code, reason: decision.reason };
    }
  }

  if (input.messageType === "author_marketing") {
    const unsubscribeUrl =
      typeof payload.unsubscribeUrl === "string" ? payload.unsubscribeUrl : "";
    if (!parseAbsoluteHttpUrl(unsubscribeUrl)) {
      return { ok: false, code: "unsubscribe_not_configured" };
    }
  } else if ("unsubscribeUrl" in payload) {
    delete payload.unsubscribeUrl;
  }

  const deduplicationKey = input.deduplicationKey?.trim() || null;
  if (deduplicationKey) {
    const existing = await runtime.findOutboxByDedup(deduplicationKey);
    if (existing) {
      return {
        ok: true,
        outboxId: existing.id,
        status: existing.status,
        deduped: true,
      };
    }
  }

  const scheduledAt = input.scheduledAt ?? now.toISOString();
  const inserted = await runtime.insertOutbox({
    messageType: input.messageType,
    contactId: input.contactId ?? null,
    userId: input.userId ?? null,
    toEmail: email.normalizedEmail,
    templateKey: input.templateKey.trim(),
    templateVersion: input.templateVersion.trim(),
    payload,
    status: "pending",
    priority: input.priority ?? 100,
    attemptCount: 0,
    maxAttempts: 5,
    scheduledAt,
    lockedAt: null,
    sentAt: null,
    failedAt: null,
    providerMessageId: null,
    lastErrorCode: null,
    lastErrorMessage: null,
    deduplicationKey,
    leaseToken: null,
    leaseExpiresAt: null,
    campaignId: input.campaignId ?? null,
    campaignRecipientId: input.campaignRecipientId ?? null,
  });

  if (inserted.created) {
    await runtime.recordDeliveryEvent({
      outboxId: inserted.row.id,
      eventType: "queued",
      now,
    });
  }

  return {
    ok: true,
    outboxId: inserted.row.id,
    status: inserted.row.status,
    deduped: !inserted.created,
  };
}
