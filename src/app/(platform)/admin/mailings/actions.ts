"use server";

import { revalidatePath } from "next/cache";

import { requireAdminPermission } from "@/lib/admin/guard";
import {
  launchSavedAuthorCampaign,
  loadAuthorMailingCandidates,
  loadDeliveryGates,
  saveAuthorMailingDraft,
  searchAuthorMailingCandidates,
} from "@/lib/admin/mailings/service";
import { planAuthorRecipients } from "@/lib/admin/mailings/recipients";
import { sendAuthorMailingTest } from "@/lib/admin/mailings/test-send";
import {
  parseAuthorCampaignFilter,
  type CampaignDraftInput,
  type ManualCampaignContentInput,
} from "@/lib/admin/mailings/validation";
import { createSupabaseApplicationEmailRuntime } from "@/lib/email/supabase-application-email-runtime";
import {
  normalizeOptionalCampaignLink,
  renderManualCampaignEmail,
} from "@/lib/email/templates/manual-campaign";
import { formatHumanSenderLabel, getSenderIdentity } from "@/lib/email/sender-identities";
import { getAppOrigin } from "@/lib/seo/app-origin";

function contentFromUnknown(value: unknown): ManualCampaignContentInput {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const paragraphs = Array.isArray(record.paragraphs)
    ? record.paragraphs.filter((item): item is string => typeof item === "string")
    : [];
  const link = (raw: unknown) => {
    if (!raw || typeof raw !== "object") return null;
    const item = raw as Record<string, unknown>;
    return normalizeOptionalCampaignLink({
      label: typeof item.label === "string" ? item.label : "",
      url: typeof item.url === "string" ? item.url : "",
    });
  };
  const info = record.infoBlock;
  return {
    heading: typeof record.heading === "string" ? record.heading : "",
    paragraphs,
    cta: link(record.cta),
    secondaryLink: link(record.secondaryLink),
    infoBlock:
      info && typeof info === "object"
        ? {
            title: typeof (info as Record<string, unknown>).title === "string"
              ? String((info as Record<string, unknown>).title)
              : "",
            text: typeof (info as Record<string, unknown>).text === "string"
              ? String((info as Record<string, unknown>).text)
              : "",
          }
        : null,
  };
}

function draftFromPayload(payload: CampaignDraftInput): CampaignDraftInput {
  const filter = parseAuthorCampaignFilter(payload.filter) ?? {
    version: 1 as const,
    kind: "all_authors" as const,
  };
  return {
    ...payload,
    content: contentFromUnknown(payload.content),
    filter,
  };
}

export async function saveMailingDraftAction(payload: CampaignDraftInput & { campaignId?: string }) {
  const session = await requireAdminPermission("mailings.manage");
  const result = await saveAuthorMailingDraft({
    actorId: session.userId,
    campaignId: payload.campaignId,
    draft: draftFromPayload(payload),
  });
  if (result.ok) {
    revalidatePath("/admin/mailings");
    revalidatePath(`/admin/mailings/${result.id}`);
  }
  return result;
}

export async function previewMailingAction(payload: CampaignDraftInput & { firstName?: string | null }) {
  await requireAdminPermission("mailings.view");
  const draft = draftFromPayload(payload);
  const rendered = renderManualCampaignEmail({
    subject: draft.subject,
    preheader: draft.preheader,
    content: draft.content,
    firstName: payload.firstName,
    siteOrigin: getAppOrigin(),
    unsubscribeUrl:
      draft.messageType === "author_marketing"
        ? `${getAppOrigin()}/email/unsubscribe?token=preview`
        : null,
  });
  if (!rendered.ok) {
    return { ok: false as const, code: rendered.code };
  }
  return {
    ok: true as const,
    subject: rendered.subject,
    preheader: draft.preheader,
    html: rendered.html,
    text: rendered.text,
    sender: formatHumanSenderLabel(getSenderIdentity("authors")),
  };
}

export async function sendMailingTestAction(payload: CampaignDraftInput & { requestedEmail: string }) {
  const session = await requireAdminPermission("mailings.send");
  const draft = draftFromPayload(payload);
  return sendAuthorMailingTest({
    actorEmail: session.email,
    requestedEmail: payload.requestedEmail,
    isOwner: session.access.roles.includes("owner"),
    subject: draft.subject,
    preheader: draft.preheader,
    content: draft.content,
    siteOrigin: getAppOrigin(),
  });
}

export async function previewMailingRecipientsAction(payload: CampaignDraftInput) {
  await requireAdminPermission("mailings.view");
  const draft = draftFromPayload(payload);
  if (draft.messageType !== "author_operational" && draft.messageType !== "author_marketing") {
    return { ok: false as const, code: "message_type_invalid" };
  }
  const filter = parseAuthorCampaignFilter(draft.filter);
  if (!filter) {
    return { ok: false as const, code: "filter_invalid" };
  }
  const candidates = await loadAuthorMailingCandidates();
  const gates = await loadDeliveryGates(candidates);
  const plan = planAuthorRecipients({
    candidates,
    filter,
    messageType: draft.messageType,
    gatesByEmail: gates,
  });
  if (!plan.ok) {
    return plan;
  }
  return { ok: true as const, summary: plan.summary };
}

export async function launchMailingAction(campaignId: string) {
  const session = await requireAdminPermission("mailings.send");
  const result = await launchSavedAuthorCampaign({
    campaignId,
    actorId: session.userId,
  });
  if (result.ok) {
    revalidatePath("/admin/mailings");
    revalidatePath(`/admin/mailings/${campaignId}`);
  }
  return result;
}

export async function cancelMailingAction(campaignId: string) {
  await requireAdminPermission("mailings.send");
  const runtime = createSupabaseApplicationEmailRuntime();
  const result = await runtime.cancelCampaign(campaignId, new Date());
  if (result.ok) {
    revalidatePath("/admin/mailings");
    revalidatePath(`/admin/mailings/${campaignId}`);
  }
  return result;
}

export async function searchMailingAuthorsAction(query: string) {
  await requireAdminPermission("mailings.manage");
  return searchAuthorMailingCandidates(query);
}
