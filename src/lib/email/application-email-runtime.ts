import { randomUUID } from "node:crypto";

import type { CampaignStatus, RecipientStatus } from "@/lib/admin/mailings/campaign-status";
import { deriveCampaignRollup } from "@/lib/admin/mailings/campaign-status";
import type { PlannedRecipient } from "@/lib/admin/mailings/recipients";
import type {
  AuthorCampaignFilter,
  ManualCampaignContentInput,
} from "@/lib/admin/mailings/validation";
import type { EmailOutboxStatus } from "@/lib/email/types";

export type ApplicationOutboxRow = {
  id: string;
  messageType: string;
  contactId: string | null;
  userId: string | null;
  toEmail: string;
  templateKey: string;
  templateVersion: string;
  payload: Record<string, unknown>;
  status: EmailOutboxStatus;
  priority: number;
  attemptCount: number;
  maxAttempts: number;
  scheduledAt: string;
  lockedAt: string | null;
  sentAt: string | null;
  failedAt: string | null;
  providerMessageId: string | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  deduplicationKey: string | null;
  leaseToken: string | null;
  leaseExpiresAt: string | null;
  campaignId: string | null;
  campaignRecipientId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type NewApplicationOutbox = Omit<
  ApplicationOutboxRow,
  "id" | "createdAt" | "updatedAt"
>;

export type EmailCampaignRecord = {
  id: string;
  name: string | null;
  audienceType: "authors" | "listeners";
  messageType: "author_operational" | "author_marketing" | "listener_operational" | "listener_marketing";
  senderIdentity: "authors" | "listeners" | "support";
  subject: string;
  preheader: string | null;
  content: ManualCampaignContentInput;
  filter: AuthorCampaignFilter;
  status: CampaignStatus;
  createdBy: string;
  launchedBy: string | null;
  createdAt: string;
  updatedAt: string;
  queuedAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  recipientTotal: number;
  recipientQueued: number;
  recipientSent: number;
  recipientFailed: number;
  recipientSuppressed: number;
  recipientExcluded: number;
};

export type EmailCampaignRecipientRecord = {
  id: string;
  campaignId: string;
  contactId: string | null;
  userId: string | null;
  authorId: string | null;
  email: string;
  normalizedEmail: string;
  displayName: string | null;
  firstName: string | null;
  status: RecipientStatus;
  suppressionReason: string | null;
  outboxId: string | null;
  providerMessageId: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: string;
  sentAt: string | null;
  updatedAt: string;
};

export type DeliveryEventRecord = {
  id: string;
  outboxId: string;
  eventType: string;
  providerMessageId: string | null;
  createdAt: string;
};

export type BeginLaunchResult =
  | { ok: true; pendingRecipientIds: string[] }
  | { ok: false; code: "not_found" | "already_launched"; pendingRecipientIds: string[] };

export interface ApplicationEmailRuntime {
  findOutboxByDedup(key: string): Promise<ApplicationOutboxRow | null>;
  insertOutbox(input: NewApplicationOutbox): Promise<{ row: ApplicationOutboxRow; created: boolean }>;
  claimOutbox(input: { limit: number; leaseSeconds: number; now: Date }): Promise<ApplicationOutboxRow[]>;
  completeOutbox(input: {
    id: string;
    leaseToken: string;
    providerMessageId: string | null;
    now: Date;
  }): Promise<boolean>;
  failOutbox(input: {
    id: string;
    leaseToken: string;
    errorCode: string;
    errorMessage: string;
    retryable: boolean;
    now: Date;
  }): Promise<"retry" | "failed" | "lost">;
  suppressOutbox(input: {
    id: string;
    leaseToken: string;
    reason: string;
    now: Date;
  }): Promise<boolean>;
  cancelOutbox(input: { id: string; leaseToken: string; now: Date }): Promise<boolean>;
  recordDeliveryEvent(input: {
    outboxId: string;
    eventType: string;
    providerMessageId?: string | null;
    now: Date;
  }): Promise<void>;
  getCampaign(id: string): Promise<EmailCampaignRecord | null>;
  insertCampaign(input: Omit<EmailCampaignRecord, "id"> & { id?: string }): Promise<EmailCampaignRecord>;
  updateDraft(
    id: string,
    patch: Partial<Pick<EmailCampaignRecord, "name" | "subject" | "preheader" | "content" | "filter" | "messageType">>,
    now: Date,
  ): Promise<EmailCampaignRecord | null>;
  beginLaunch(input: {
    campaignId: string;
    actorId: string;
    recipients: readonly PlannedRecipient[];
    now: Date;
  }): Promise<BeginLaunchResult>;
  attachRecipientOutbox(recipientId: string, outboxId: string, now: Date): Promise<void>;
  markRecipient(input: {
    recipientId: string;
    status: RecipientStatus;
    reason: string | null;
    errorCode?: string | null;
    now: Date;
  }): Promise<void>;
  recomputeCampaign(campaignId: string, now: Date): Promise<EmailCampaignRecord | null>;
  cancelCampaign(campaignId: string, now: Date): Promise<{ ok: true } | { ok: false; code: "not_found" | "not_cancellable" }>;
  listCampaigns(): Promise<EmailCampaignRecord[]>;
  listRecipients(campaignId: string): Promise<EmailCampaignRecipientRecord[]>;
  listEvents(): Promise<DeliveryEventRecord[]>;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function applyRollup(campaign: EmailCampaignRecord, statuses: RecipientStatus[], now: Date) {
  const rollup = deriveCampaignRollup(statuses);
  campaign.recipientTotal = rollup.recipientTotal;
  campaign.recipientQueued = rollup.recipientQueued;
  campaign.recipientSent = rollup.recipientSent;
  campaign.recipientFailed = rollup.recipientFailed;
  campaign.recipientSuppressed = rollup.recipientSuppressed;
  campaign.recipientExcluded = rollup.recipientExcluded;
  campaign.updatedAt = now.toISOString();

  if (campaign.status === "cancelled" || campaign.status === "draft") {
    return;
  }

  campaign.status = rollup.phase;
  if (rollup.phase === "sending" || rollup.phase === "sent" || rollup.phase === "partially_failed" || rollup.phase === "failed") {
    campaign.startedAt = campaign.startedAt ?? now.toISOString();
  }
  if (rollup.phase === "sent" || rollup.phase === "partially_failed" || rollup.phase === "failed") {
    campaign.finishedAt = campaign.finishedAt ?? now.toISOString();
  } else {
    campaign.finishedAt = null;
  }
}

export function createMemoryApplicationEmailRuntime(): ApplicationEmailRuntime {
  const outbox = new Map<string, ApplicationOutboxRow>();
  const campaigns = new Map<string, EmailCampaignRecord>();
  const recipients = new Map<string, EmailCampaignRecipientRecord>();
  const events: DeliveryEventRecord[] = [];

  function recipientsFor(campaignId: string): EmailCampaignRecipientRecord[] {
    return [...recipients.values()].filter((row) => row.campaignId === campaignId);
  }

  function recompute(campaignId: string, now: Date): EmailCampaignRecord | null {
    const campaign = campaigns.get(campaignId);
    if (!campaign) {
      return null;
    }
    applyRollup(
      campaign,
      recipientsFor(campaignId).map((row) => row.status),
      now,
    );
    return campaign;
  }

  return {
    async findOutboxByDedup(key) {
      const row = [...outbox.values()].find((item) => item.deduplicationKey === key) ?? null;
      return row ? clone(row) : null;
    },
    async insertOutbox(input) {
      if (input.deduplicationKey) {
        const existing = [...outbox.values()].find(
          (item) => item.deduplicationKey === input.deduplicationKey,
        );
        if (existing) {
          return { row: clone(existing), created: false };
        }
      }
      const now = input.scheduledAt;
      const row: ApplicationOutboxRow = {
        ...clone(input),
        id: randomUUID(),
        createdAt: now,
        updatedAt: now,
      };
      outbox.set(row.id, row);
      return { row: clone(row), created: true };
    },
    async claimOutbox({ limit, leaseSeconds, now }) {
      const clamped = Math.min(50, Math.max(1, limit));
      for (const row of outbox.values()) {
        if (
          row.status === "processing" &&
          row.leaseExpiresAt &&
          Date.parse(row.leaseExpiresAt) <= now.getTime()
        ) {
          row.status = "pending";
          row.leaseToken = null;
          row.leaseExpiresAt = null;
          row.lockedAt = null;
          row.lastErrorCode = row.lastErrorCode ?? "lease_expired";
          row.updatedAt = now.toISOString();
        }
      }
      const due = [...outbox.values()]
        .filter(
          (row) =>
            row.status === "pending" && Date.parse(row.scheduledAt) <= now.getTime(),
        )
        .sort((left, right) => left.scheduledAt.localeCompare(right.scheduledAt))
        .slice(0, clamped);
      for (const row of due) {
        row.status = "processing";
        row.leaseToken = randomUUID();
        row.lockedAt = now.toISOString();
        row.leaseExpiresAt = new Date(now.getTime() + leaseSeconds * 1000).toISOString();
        row.attemptCount += 1;
        row.updatedAt = now.toISOString();
      }
      return due.map((row) => clone(row));
    },
    async completeOutbox({ id, leaseToken, providerMessageId, now }) {
      const row = outbox.get(id);
      if (!row || row.status !== "processing" || row.leaseToken !== leaseToken) {
        return false;
      }
      row.status = "sent";
      row.sentAt = now.toISOString();
      row.providerMessageId = providerMessageId;
      row.leaseToken = null;
      row.leaseExpiresAt = null;
      row.updatedAt = now.toISOString();
      if (row.campaignRecipientId) {
        const recipient = recipients.get(row.campaignRecipientId);
        if (recipient && recipient.status === "queued") {
          recipient.status = "sent";
          recipient.sentAt = now.toISOString();
          recipient.providerMessageId = providerMessageId;
          recipient.updatedAt = now.toISOString();
        }
      }
      if (row.campaignId) {
        recompute(row.campaignId, now);
      }
      events.push({
        id: randomUUID(),
        outboxId: row.id,
        eventType: "sent",
        providerMessageId,
        createdAt: now.toISOString(),
      });
      return true;
    },
    async failOutbox({ id, leaseToken, errorCode, errorMessage, retryable, now }) {
      const row = outbox.get(id);
      if (!row || row.status !== "processing" || row.leaseToken !== leaseToken) {
        return "lost";
      }
      const retry = retryable && row.attemptCount < row.maxAttempts;
      row.lastErrorCode = errorCode.slice(0, 80);
      row.lastErrorMessage = errorMessage.slice(0, 500);
      row.leaseToken = null;
      row.leaseExpiresAt = null;
      row.lockedAt = null;
      row.updatedAt = now.toISOString();
      if (retry) {
        const delaySec = Math.min(3600, 60 * 2 ** Math.max(0, row.attemptCount - 1));
        row.status = "pending";
        row.scheduledAt = new Date(now.getTime() + delaySec * 1000).toISOString();
        events.push({
          id: randomUUID(),
          outboxId: row.id,
          eventType: "deferred",
          providerMessageId: null,
          createdAt: now.toISOString(),
        });
        return "retry";
      }
      row.status = "failed";
      row.failedAt = now.toISOString();
      if (row.campaignRecipientId) {
        const recipient = recipients.get(row.campaignRecipientId);
        if (recipient && recipient.status === "queued") {
          recipient.status = "failed";
          recipient.errorCode = row.lastErrorCode;
          recipient.errorMessage = row.lastErrorMessage;
          recipient.updatedAt = now.toISOString();
        }
      }
      if (row.campaignId) {
        recompute(row.campaignId, now);
      }
      events.push({
        id: randomUUID(),
        outboxId: row.id,
        eventType: "failed",
        providerMessageId: null,
        createdAt: now.toISOString(),
      });
      return "failed";
    },
    async suppressOutbox({ id, leaseToken, reason, now }) {
      const row = outbox.get(id);
      if (!row || row.status !== "processing" || row.leaseToken !== leaseToken) {
        return false;
      }
      row.status = "suppressed";
      row.lastErrorCode = reason.slice(0, 80);
      row.leaseToken = null;
      row.leaseExpiresAt = null;
      row.updatedAt = now.toISOString();
      if (row.campaignRecipientId) {
        const recipient = recipients.get(row.campaignRecipientId);
        if (recipient && recipient.status === "queued") {
          recipient.status = "suppressed";
          recipient.suppressionReason = reason;
          recipient.updatedAt = now.toISOString();
        }
      }
      if (row.campaignId) {
        recompute(row.campaignId, now);
      }
      events.push({
        id: randomUUID(),
        outboxId: row.id,
        eventType: "failed",
        providerMessageId: null,
        createdAt: now.toISOString(),
      });
      return true;
    },
    async cancelOutbox({ id, leaseToken, now }) {
      const row = outbox.get(id);
      if (!row || row.status !== "processing" || row.leaseToken !== leaseToken) {
        return false;
      }
      row.status = "cancelled";
      row.leaseToken = null;
      row.leaseExpiresAt = null;
      row.updatedAt = now.toISOString();
      if (row.campaignRecipientId) {
        const recipient = recipients.get(row.campaignRecipientId);
        if (recipient && recipient.status === "queued") {
          recipient.status = "cancelled";
          recipient.suppressionReason = "cancelled";
          recipient.updatedAt = now.toISOString();
        }
      }
      if (row.campaignId) {
        recompute(row.campaignId, now);
      }
      return true;
    },
    async recordDeliveryEvent(input) {
      events.push({
        id: randomUUID(),
        outboxId: input.outboxId,
        eventType: input.eventType,
        providerMessageId: input.providerMessageId ?? null,
        createdAt: input.now.toISOString(),
      });
    },
    async getCampaign(id) {
      const row = campaigns.get(id);
      return row ? clone(row) : null;
    },
    async insertCampaign(input) {
      const now = input.createdAt;
      const row: EmailCampaignRecord = {
        ...clone(input),
        id: input.id ?? randomUUID(),
        createdAt: now,
        updatedAt: input.updatedAt,
      };
      campaigns.set(row.id, row);
      return clone(row);
    },
    async updateDraft(id, patch, now) {
      const row = campaigns.get(id);
      if (!row || row.status !== "draft") {
        return null;
      }
      Object.assign(row, patch, { updatedAt: now.toISOString() });
      return clone(row);
    },
    async beginLaunch({ campaignId, actorId, recipients: planned, now }) {
      const campaign = campaigns.get(campaignId);
      if (!campaign) {
        return { ok: false, code: "not_found", pendingRecipientIds: [] };
      }
      if (campaign.status !== "draft") {
        const pending = recipientsFor(campaignId)
          .filter((row) => row.status === "queued" && !row.outboxId)
          .map((row) => row.id);
        return { ok: false, code: "already_launched", pendingRecipientIds: pending };
      }
      const seen = new Set<string>();
      for (const plannedRow of planned) {
        if (seen.has(plannedRow.normalizedEmail)) {
          continue;
        }
        seen.add(plannedRow.normalizedEmail);
        const id = randomUUID();
        recipients.set(id, {
          id,
          campaignId,
          contactId: plannedRow.contactId,
          userId: plannedRow.userId,
          authorId: plannedRow.authorId,
          email: plannedRow.email,
          normalizedEmail: plannedRow.normalizedEmail,
          displayName: plannedRow.displayName,
          firstName: plannedRow.firstName,
          status: plannedRow.status,
          suppressionReason: plannedRow.suppressionReason,
          outboxId: null,
          providerMessageId: null,
          errorCode: null,
          errorMessage: null,
          createdAt: now.toISOString(),
          sentAt: null,
          updatedAt: now.toISOString(),
        });
      }
      campaign.status = "queued";
      campaign.queuedAt = now.toISOString();
      campaign.launchedBy = actorId;
      campaign.updatedAt = now.toISOString();
      recompute(campaignId, now);
      const pending = recipientsFor(campaignId)
        .filter((row) => row.status === "queued" && !row.outboxId)
        .map((row) => row.id);
      return { ok: true, pendingRecipientIds: pending };
    },
    async attachRecipientOutbox(recipientId, outboxId, now) {
      const recipient = recipients.get(recipientId);
      if (!recipient || recipient.outboxId) {
        return;
      }
      recipient.outboxId = outboxId;
      recipient.updatedAt = now.toISOString();
      const row = outbox.get(outboxId);
      if (row) {
        row.campaignId = recipient.campaignId;
        row.campaignRecipientId = recipient.id;
        row.updatedAt = now.toISOString();
      }
    },
    async markRecipient({ recipientId, status, reason, errorCode, now }) {
      const recipient = recipients.get(recipientId);
      if (!recipient || recipient.status !== "queued") {
        return;
      }
      recipient.status = status;
      recipient.suppressionReason = reason;
      recipient.errorCode = errorCode ?? null;
      recipient.updatedAt = now.toISOString();
      if (recipient.campaignId) {
        recompute(recipient.campaignId, now);
      }
    },
    async recomputeCampaign(campaignId, now) {
      const row = recompute(campaignId, now);
      return row ? clone(row) : null;
    },
    async cancelCampaign(campaignId, now) {
      const campaign = campaigns.get(campaignId);
      if (!campaign) {
        return { ok: false, code: "not_found" };
      }
      if (campaign.status !== "draft" && campaign.status !== "queued" && campaign.status !== "sending") {
        return { ok: false, code: "not_cancellable" };
      }
      campaign.status = "cancelled";
      campaign.finishedAt = now.toISOString();
      campaign.updatedAt = now.toISOString();
      for (const row of outbox.values()) {
        if (row.campaignId === campaignId && row.status === "pending") {
          row.status = "cancelled";
          row.updatedAt = now.toISOString();
        }
      }
      for (const recipient of recipientsFor(campaignId)) {
        if (recipient.status === "queued") {
          recipient.status = "cancelled";
          recipient.suppressionReason = "cancelled";
          recipient.updatedAt = now.toISOString();
        }
      }
      recompute(campaignId, now);
      campaign.status = "cancelled";
      return { ok: true };
    },
    async listCampaigns() {
      return [...campaigns.values()]
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
        .map((row) => clone(row));
    },
    async listRecipients(campaignId) {
      return recipientsFor(campaignId).map((row) => clone(row));
    },
    async listEvents() {
      return events.map((row) => clone(row));
    },
  };
}

export function campaignOutboxDedupKey(campaignId: string, normalizedEmail: string): string {
  return `manual_campaign:${campaignId}:${normalizedEmail}`;
}
