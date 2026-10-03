import type { SupabaseClient } from "@supabase/supabase-js";

import type { CampaignStatus, RecipientStatus } from "@/lib/admin/mailings/campaign-status";
import { deriveCampaignRollup } from "@/lib/admin/mailings/campaign-status";
import type {
  AuthorCampaignFilter,
  ManualCampaignContentInput,
} from "@/lib/admin/mailings/validation";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

import type {
  ApplicationEmailRuntime,
  ApplicationOutboxRow,
  BeginLaunchResult,
  DeliveryEventRecord,
  EmailCampaignRecipientRecord,
  EmailCampaignRecord,
  NewApplicationOutbox,
} from "./application-email-runtime";
import type { EmailOutboxStatus } from "./types";

type Row = Record<string, unknown>;

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function mapOutbox(row: Row): ApplicationOutboxRow {
  return {
    id: String(row.id),
    messageType: String(row.message_type),
    contactId: asString(row.contact_id),
    userId: asString(row.user_id),
    toEmail: String(row.to_email),
    templateKey: String(row.template_key),
    templateVersion: String(row.template_version),
    payload: asObject(row.payload),
    status: String(row.status) as EmailOutboxStatus,
    priority: Number(row.priority ?? 100),
    attemptCount: Number(row.attempt_count ?? 0),
    maxAttempts: Number(row.max_attempts ?? 5),
    scheduledAt: String(row.scheduled_at),
    lockedAt: asString(row.locked_at),
    sentAt: asString(row.sent_at),
    failedAt: asString(row.failed_at),
    providerMessageId: asString(row.provider_message_id),
    lastErrorCode: asString(row.last_error_code),
    lastErrorMessage: asString(row.last_error_message),
    deduplicationKey: asString(row.deduplication_key),
    leaseToken: asString(row.lease_token),
    leaseExpiresAt: asString(row.lease_expires_at),
    campaignId: asString(row.campaign_id),
    campaignRecipientId: asString(row.campaign_recipient_id),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapCampaign(row: Row): EmailCampaignRecord {
  return {
    id: String(row.id),
    name: asString(row.name),
    audienceType: String(row.audience_type) as EmailCampaignRecord["audienceType"],
    messageType: String(row.message_type) as EmailCampaignRecord["messageType"],
    senderIdentity: String(row.sender_identity) as EmailCampaignRecord["senderIdentity"],
    subject: String(row.subject),
    preheader: asString(row.preheader),
    content: asObject(row.content) as unknown as ManualCampaignContentInput,
    filter: asObject(row.filter) as unknown as AuthorCampaignFilter,
    status: String(row.status) as CampaignStatus,
    createdBy: String(row.created_by),
    launchedBy: asString(row.launched_by),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    queuedAt: asString(row.queued_at),
    startedAt: asString(row.started_at),
    finishedAt: asString(row.finished_at),
    recipientTotal: Number(row.recipient_total ?? 0),
    recipientQueued: Number(row.recipient_queued ?? 0),
    recipientSent: Number(row.recipient_sent ?? 0),
    recipientFailed: Number(row.recipient_failed ?? 0),
    recipientSuppressed: Number(row.recipient_suppressed ?? 0),
    recipientExcluded: Number(row.recipient_excluded ?? 0),
  };
}

function mapRecipient(row: Row): EmailCampaignRecipientRecord {
  return {
    id: String(row.id),
    campaignId: String(row.campaign_id),
    contactId: asString(row.contact_id),
    userId: asString(row.user_id),
    authorId: asString(row.author_id),
    email: String(row.email),
    normalizedEmail: String(row.normalized_email),
    displayName: asString(row.display_name),
    firstName: asString(row.first_name),
    status: String(row.status) as RecipientStatus,
    suppressionReason: asString(row.suppression_reason),
    outboxId: asString(row.outbox_id),
    providerMessageId: asString(row.provider_message_id),
    errorCode: asString(row.error_code),
    errorMessage: asString(row.error_message),
    createdAt: String(row.created_at),
    sentAt: asString(row.sent_at),
    updatedAt: String(row.updated_at),
  };
}

function outboxInsert(input: NewApplicationOutbox) {
  return {
    message_type: input.messageType,
    contact_id: input.contactId,
    user_id: input.userId,
    to_email: input.toEmail,
    template_key: input.templateKey,
    template_version: input.templateVersion,
    payload: input.payload,
    status: input.status,
    priority: input.priority,
    attempt_count: input.attemptCount,
    max_attempts: input.maxAttempts,
    scheduled_at: input.scheduledAt,
    deduplication_key: input.deduplicationKey,
    campaign_id: input.campaignId,
    campaign_recipient_id: input.campaignRecipientId,
  };
}

async function recomputeFromRows(
  supabase: SupabaseClient,
  campaignId: string,
  now: Date,
): Promise<EmailCampaignRecord | null> {
  const { data: campaignRow, error: campaignError } = await supabase
    .from("email_campaigns")
    .select("*")
    .eq("id", campaignId)
    .maybeSingle();

  if (campaignError) {
    throw new Error("email_campaign_lookup_failed");
  }
  if (!campaignRow) {
    return null;
  }

  const campaign = mapCampaign(campaignRow as Row);
  if (campaign.status === "draft") {
    return campaign;
  }

  const { data: recipientRows, error: recipientError } = await supabase
    .from("email_campaign_recipients")
    .select("status")
    .eq("campaign_id", campaignId);

  if (recipientError) {
    throw new Error("email_campaign_recipients_lookup_failed");
  }

  const rollup = deriveCampaignRollup(
    ((recipientRows ?? []) as Row[]).map((row) => String(row.status) as RecipientStatus),
  );
  const nextStatus = campaign.status === "cancelled" ? "cancelled" : rollup.phase;
  const terminal =
    nextStatus === "sent" || nextStatus === "partially_failed" || nextStatus === "failed";
  const started =
    nextStatus === "sending" || terminal
      ? campaign.startedAt ?? now.toISOString()
      : campaign.startedAt;

  const { data: updated, error: updateError } = await supabase
    .from("email_campaigns")
    .update({
      status: nextStatus,
      recipient_total: rollup.recipientTotal,
      recipient_queued: rollup.recipientQueued,
      recipient_sent: rollup.recipientSent,
      recipient_failed: rollup.recipientFailed,
      recipient_suppressed: rollup.recipientSuppressed,
      recipient_excluded: rollup.recipientExcluded,
      started_at: started,
      finished_at: terminal ? campaign.finishedAt ?? now.toISOString() : null,
      updated_at: now.toISOString(),
    })
    .eq("id", campaignId)
    .select("*")
    .single();

  if (updateError) {
    throw new Error("email_campaign_recompute_failed");
  }

  return mapCampaign(updated as Row);
}

export function createSupabaseApplicationEmailRuntime(
  supabase: SupabaseClient = createServiceRoleClient(),
): ApplicationEmailRuntime {
  return {
    async findOutboxByDedup(key) {
      const { data, error } = await supabase
        .from("email_outbox")
        .select("*")
        .eq("deduplication_key", key)
        .limit(1)
        .maybeSingle();
      if (error) {
        throw new Error("email_outbox_lookup_failed");
      }
      return data ? mapOutbox(data as Row) : null;
    },
    async insertOutbox(input) {
      const { data, error } = await supabase
        .from("email_outbox")
        .insert(outboxInsert(input))
        .select("*")
        .single();
      if (!error && data) {
        return { row: mapOutbox(data as Row), created: true };
      }
      if (input.deduplicationKey) {
        const existing = await this.findOutboxByDedup(input.deduplicationKey);
        if (existing) {
          return { row: existing, created: false };
        }
      }
      throw new Error("email_outbox_insert_failed");
    },
    async claimOutbox({ limit, leaseSeconds }) {
      const { data, error } = await supabase.rpc("claim_application_email_outbox", {
        p_limit: limit,
        p_lease_seconds: leaseSeconds,
      });
      if (error) {
        throw new Error("application_email_outbox_claim_failed");
      }
      return ((data ?? []) as Row[]).map(mapOutbox);
    },
    async completeOutbox({ id, leaseToken, providerMessageId }) {
      const { data, error } = await supabase.rpc("complete_application_email_outbox", {
        p_id: id,
        p_lease_token: leaseToken,
        p_provider_message_id: providerMessageId,
      });
      if (error) {
        throw new Error("application_email_outbox_complete_failed");
      }
      return data === true;
    },
    async failOutbox({ id, leaseToken, errorCode, errorMessage, retryable }) {
      const { data, error } = await supabase.rpc("fail_application_email_outbox", {
        p_id: id,
        p_lease_token: leaseToken,
        p_error_code: errorCode,
        p_error_message: errorMessage,
        p_retryable: retryable,
      });
      if (error) {
        throw new Error("application_email_outbox_fail_failed");
      }
      if (data === "retry" || data === "failed" || data === "lost") {
        return data;
      }
      return "lost";
    },
    async suppressOutbox({ id, leaseToken, reason }) {
      const { data, error } = await supabase.rpc("suppress_application_email_outbox", {
        p_id: id,
        p_lease_token: leaseToken,
        p_reason: reason,
      });
      if (error) {
        throw new Error("application_email_outbox_suppress_failed");
      }
      return data === true;
    },
    async cancelOutbox({ id, leaseToken, now }) {
      const { data, error } = await supabase
        .from("email_outbox")
        .update({
          status: "cancelled",
          lease_token: null,
          lease_expires_at: null,
          updated_at: now.toISOString(),
        })
        .eq("id", id)
        .eq("status", "processing")
        .eq("lease_token", leaseToken)
        .select("campaign_recipient_id, campaign_id")
        .maybeSingle();
      if (error) {
        throw new Error("application_email_outbox_cancel_failed");
      }
      if (!data) {
        return false;
      }
      const row = data as Row;
      if (row.campaign_recipient_id) {
        await supabase
          .from("email_campaign_recipients")
          .update({
            status: "cancelled",
            suppression_reason: "cancelled",
            updated_at: now.toISOString(),
          })
          .eq("id", row.campaign_recipient_id)
          .eq("status", "queued");
      }
      if (row.campaign_id) {
        await recomputeFromRows(supabase, String(row.campaign_id), now);
      }
      return true;
    },
    async recordDeliveryEvent(input) {
      const { error } = await supabase.from("email_delivery_events").insert({
        outbox_id: input.outboxId,
        event_type: input.eventType,
        provider: "smtp",
        provider_message_id: input.providerMessageId ?? null,
        event_at: input.now.toISOString(),
      });
      if (error) {
        throw new Error("email_delivery_event_insert_failed");
      }
    },
    async getCampaign(id) {
      const { data, error } = await supabase
        .from("email_campaigns")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) {
        throw new Error("email_campaign_lookup_failed");
      }
      return data ? mapCampaign(data as Row) : null;
    },
    async insertCampaign(input) {
      const { data, error } = await supabase
        .from("email_campaigns")
        .insert({
          id: input.id,
          name: input.name,
          audience_type: input.audienceType,
          message_type: input.messageType,
          sender_identity: input.senderIdentity,
          subject: input.subject,
          preheader: input.preheader,
          content: input.content,
          filter: input.filter,
          status: input.status,
          created_by: input.createdBy,
          launched_by: input.launchedBy,
          created_at: input.createdAt,
          updated_at: input.updatedAt,
          queued_at: input.queuedAt,
          started_at: input.startedAt,
          finished_at: input.finishedAt,
          recipient_total: input.recipientTotal,
          recipient_queued: input.recipientQueued,
          recipient_sent: input.recipientSent,
          recipient_failed: input.recipientFailed,
          recipient_suppressed: input.recipientSuppressed,
          recipient_excluded: input.recipientExcluded,
        })
        .select("*")
        .single();
      if (error || !data) {
        throw new Error("email_campaign_insert_failed");
      }
      return mapCampaign(data as Row);
    },
    async updateDraft(id, patch, now) {
      const update: Row = { updated_at: now.toISOString() };
      if (patch.name !== undefined) update.name = patch.name;
      if (patch.subject !== undefined) update.subject = patch.subject;
      if (patch.preheader !== undefined) update.preheader = patch.preheader;
      if (patch.content !== undefined) update.content = patch.content;
      if (patch.filter !== undefined) update.filter = patch.filter;
      if (patch.messageType !== undefined) update.message_type = patch.messageType;
      const { data, error } = await supabase
        .from("email_campaigns")
        .update(update)
        .eq("id", id)
        .eq("status", "draft")
        .select("*")
        .maybeSingle();
      if (error) {
        throw new Error("email_campaign_update_failed");
      }
      return data ? mapCampaign(data as Row) : null;
    },
    async beginLaunch({ campaignId, actorId, recipients, now: _now }) {
      void _now;
      const payload = recipients.map((row) => ({
        contactId: row.contactId,
        userId: row.userId,
        authorId: row.authorId,
        email: row.email,
        normalizedEmail: row.normalizedEmail,
        displayName: row.displayName,
        firstName: row.firstName,
        status: row.status,
        suppressionReason: row.suppressionReason,
      }));
      const { data, error } = await supabase.rpc("begin_email_campaign_launch", {
        p_campaign_id: campaignId,
        p_actor: actorId,
        p_recipients: payload,
      });
      if (error) {
        throw new Error("email_campaign_launch_failed");
      }
      const result = (data ?? {}) as Row;
      const pending = Array.isArray(result.pendingRecipientIds)
        ? result.pendingRecipientIds.map(String)
        : [];
      if (result.ok === true) {
        return { ok: true, pendingRecipientIds: pending };
      }
      const code = result.code === "not_found" ? "not_found" : "already_launched";
      return { ok: false, code, pendingRecipientIds: pending } satisfies BeginLaunchResult;
    },
    async attachRecipientOutbox(recipientId, outboxId, now) {
      await supabase
        .from("email_campaign_recipients")
        .update({ outbox_id: outboxId, updated_at: now.toISOString() })
        .eq("id", recipientId)
        .is("outbox_id", null);
      await supabase
        .from("email_outbox")
        .update({
          campaign_recipient_id: recipientId,
          updated_at: now.toISOString(),
        })
        .eq("id", outboxId);
    },
    async markRecipient({ recipientId, status, reason, errorCode, now }) {
      const { data, error } = await supabase
        .from("email_campaign_recipients")
        .update({
          status,
          suppression_reason: reason,
          error_code: errorCode ?? null,
          updated_at: now.toISOString(),
        })
        .eq("id", recipientId)
        .eq("status", "queued")
        .select("campaign_id")
        .maybeSingle();
      if (error) {
        throw new Error("email_campaign_recipient_update_failed");
      }
      if (data && (data as Row).campaign_id) {
        await recomputeFromRows(supabase, String((data as Row).campaign_id), now);
      }
    },
    async recomputeCampaign(campaignId, now) {
      return recomputeFromRows(supabase, campaignId, now);
    },
    async cancelCampaign(campaignId, now) {
      const current = await this.getCampaign(campaignId);
      if (!current) {
        return { ok: false, code: "not_found" };
      }
      if (current.status !== "draft" && current.status !== "queued" && current.status !== "sending") {
        return { ok: false, code: "not_cancellable" };
      }
      const { error } = await supabase
        .from("email_campaigns")
        .update({
          status: "cancelled",
          finished_at: now.toISOString(),
          updated_at: now.toISOString(),
        })
        .eq("id", campaignId);
      if (error) {
        throw new Error("email_campaign_cancel_failed");
      }
      await supabase
        .from("email_outbox")
        .update({ status: "cancelled", updated_at: now.toISOString() })
        .eq("campaign_id", campaignId)
        .eq("status", "pending");
      await supabase
        .from("email_campaign_recipients")
        .update({
          status: "cancelled",
          suppression_reason: "cancelled",
          updated_at: now.toISOString(),
        })
        .eq("campaign_id", campaignId)
        .eq("status", "queued");
      await recomputeFromRows(supabase, campaignId, now);
      return { ok: true };
    },
    async listCampaigns() {
      const { data, error } = await supabase
        .from("email_campaigns")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) {
        throw new Error("email_campaign_list_failed");
      }
      return ((data ?? []) as Row[]).map(mapCampaign);
    },
    async listRecipients(campaignId) {
      const { data, error } = await supabase
        .from("email_campaign_recipients")
        .select("*")
        .eq("campaign_id", campaignId)
        .order("created_at", { ascending: true });
      if (error) {
        throw new Error("email_campaign_recipients_lookup_failed");
      }
      return ((data ?? []) as Row[]).map(mapRecipient);
    },
    async listEvents() {
      return [] as DeliveryEventRecord[];
    },
  };
}
