import type { ApplicationEmailRuntime } from "@/lib/email/application-email-runtime";
import { campaignOutboxDedupKey } from "@/lib/email/application-email-runtime";
import type {
  EmailCampaignRecipientRecord,
  EmailCampaignRecord,
} from "@/lib/email/application-email-runtime";
import { enqueueApplicationEmail } from "@/lib/email/enqueue";
import { logMailingEvent } from "@/lib/email/mask-email";
import {
  MANUAL_CAMPAIGN_TEMPLATE_KEY,
  MANUAL_CAMPAIGN_TEMPLATE_VERSION,
} from "@/lib/email/templates/manual-campaign";
import { buildUnsubscribeUrl, signUnsubscribeToken } from "@/lib/email/unsubscribe-token";

import type { DeliveryGateFacts } from "./recipients";
import { planAuthorRecipients, type AuthorMailingCandidate } from "./recipients";
import { validateCampaignDraft } from "./validation";

const UNSUBSCRIBE_TTL_MS = 180 * 24 * 60 * 60 * 1000;

export async function launchAuthorCampaign(input: {
  campaign: EmailCampaignRecord;
  candidates: readonly AuthorMailingCandidate[];
  gatesByEmail?: ReadonlyMap<string, DeliveryGateFacts>;
  actorId: string;
  now?: Date;
  siteOrigin: string;
  unsubscribeSecret: string | null;
  runtime: ApplicationEmailRuntime;
}): Promise<
  | {
      ok: true;
      campaignId: string;
      ready: number;
      alreadyLaunched: boolean;
    }
  | {
      ok: false;
      code:
        | "invalid_campaign"
        | "no_eligible_recipients"
        | "too_many_recipients"
        | "unsubscribe_not_configured"
        | "not_found"
        | "filter_invalid";
    }
> {
  const now = input.now ?? new Date();
  const validated = validateCampaignDraft({
    name: input.campaign.name,
    audienceType: input.campaign.audienceType,
    messageType: input.campaign.messageType,
    senderIdentity: input.campaign.senderIdentity,
    subject: input.campaign.subject,
    preheader: input.campaign.preheader,
    content: input.campaign.content,
    filter: input.campaign.filter,
  });

  if (!validated.ok) {
    return { ok: false, code: "invalid_campaign" };
  }

  if (
    validated.value.messageType === "author_marketing" &&
    !input.unsubscribeSecret?.trim()
  ) {
    return { ok: false, code: "unsubscribe_not_configured" };
  }

  const plan = planAuthorRecipients({
    candidates: input.candidates,
    filter: validated.value.filter,
    messageType: validated.value.messageType,
    gatesByEmail: input.gatesByEmail,
    now,
  });

  if (!plan.ok) {
    return { ok: false, code: plan.code };
  }

  if (plan.summary.ready === 0 && input.campaign.status === "draft") {
    return { ok: false, code: "no_eligible_recipients" };
  }

  const began = await input.runtime.beginLaunch({
    campaignId: input.campaign.id,
    actorId: input.actorId,
    recipients: plan.rows,
    now,
  });

  if (!began.ok && began.code === "not_found") {
    return { ok: false, code: "not_found" };
  }

  const pendingIds = began.pendingRecipientIds;
  const recipients = await input.runtime.listRecipients(input.campaign.id);
  const byId = new Map(recipients.map((row) => [row.id, row]));

  for (const recipientId of pendingIds) {
    const recipient = byId.get(recipientId);
    if (!recipient) {
      continue;
    }
    await enqueuePlannedRecipient({
      campaign: input.campaign,
      recipient,
      siteOrigin: input.siteOrigin,
      unsubscribeSecret: input.unsubscribeSecret,
      gatesByEmail: input.gatesByEmail,
      runtime: input.runtime,
      now,
    });
  }

  await input.runtime.recomputeCampaign(input.campaign.id, now);
  logMailingEvent(began.ok ? "mailing_campaign_queued" : "mailing_campaign_resumed", {
    campaignId: input.campaign.id,
    ready: plan.summary.ready,
    pending: pendingIds.length,
  });

  return {
    ok: true,
    campaignId: input.campaign.id,
    ready: plan.summary.ready,
    alreadyLaunched: !began.ok,
  };
}

async function enqueuePlannedRecipient(input: {
  campaign: EmailCampaignRecord;
  recipient: EmailCampaignRecipientRecord;
  siteOrigin: string;
  unsubscribeSecret: string | null;
  gatesByEmail?: ReadonlyMap<string, DeliveryGateFacts>;
  runtime: ApplicationEmailRuntime;
  now: Date;
}) {
  if (
    input.campaign.messageType !== "author_operational" &&
    input.campaign.messageType !== "author_marketing"
  ) {
    await input.runtime.markRecipient({
      recipientId: input.recipient.id,
      status: "excluded",
      reason: "message_type_invalid",
      now: input.now,
    });
    return;
  }

  const gate = input.gatesByEmail?.get(input.recipient.normalizedEmail);
  let unsubscribeUrl: string | null = null;

  if (input.campaign.messageType === "author_marketing") {
    const token = signUnsubscribeToken({
      normalizedEmail: input.recipient.normalizedEmail,
      secret: input.unsubscribeSecret ?? "",
      expiresAt: new Date(input.now.getTime() + UNSUBSCRIBE_TTL_MS),
    });
    unsubscribeUrl = token ? buildUnsubscribeUrl(input.siteOrigin, token) : null;
    if (!unsubscribeUrl) {
      await input.runtime.markRecipient({
        recipientId: input.recipient.id,
        status: "excluded",
        reason: "unsubscribe_not_configured",
        now: input.now,
      });
      return;
    }
  }

  const enqueued = await enqueueApplicationEmail(
    {
      messageType: input.campaign.messageType,
      contactId: input.recipient.contactId,
      userId: input.recipient.userId,
      toEmail: input.recipient.normalizedEmail,
      templateKey: MANUAL_CAMPAIGN_TEMPLATE_KEY,
      templateVersion: MANUAL_CAMPAIGN_TEMPLATE_VERSION,
      deduplicationKey: campaignOutboxDedupKey(
        input.campaign.id,
        input.recipient.normalizedEmail,
      ),
      campaignId: input.campaign.id,
      campaignRecipientId: input.recipient.id,
      gate,
      payload: {
        subject: input.campaign.subject,
        preheader: input.campaign.preheader,
        heading: input.campaign.content.heading,
        paragraphs: input.campaign.content.paragraphs,
        cta: input.campaign.content.cta,
        infoBlock: input.campaign.content.infoBlock,
        secondaryLink: input.campaign.content.secondaryLink,
        firstName: input.recipient.firstName,
        unsubscribeUrl,
        senderIdentity: "authors",
        siteOrigin: input.siteOrigin,
        campaignId: input.campaign.id,
      },
    },
    input.runtime,
    input.now,
  );

  if (!enqueued.ok) {
    await input.runtime.markRecipient({
      recipientId: input.recipient.id,
      status: enqueued.code === "suppressed" ? "suppressed" : "excluded",
      reason: enqueued.reason ?? enqueued.code,
      now: input.now,
    });
    return;
  }

  await input.runtime.attachRecipientOutbox(
    input.recipient.id,
    enqueued.outboxId,
    input.now,
  );
}
