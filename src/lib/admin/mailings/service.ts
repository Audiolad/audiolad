import { validateEmailFormat } from "@/lib/auth/email/validate-format";
import type { EmailCampaignRecord } from "@/lib/email/application-email-runtime";
import { createSupabaseApplicationEmailRuntime } from "@/lib/email/supabase-application-email-runtime";
import { latestConsentStatus } from "@/lib/email/delivery-gate";
import { logMailingEvent } from "@/lib/email/mask-email";
import type { ApplicationSuppressionScope } from "@/lib/email/delivery-gate";
import { isApplicationSuppressionScope } from "@/lib/email/delivery-gate";
import { getAppOrigin } from "@/lib/seo/app-origin";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

import { launchAuthorCampaign } from "./launch";
import {
  isCommercialAuthorStatus,
  isMailingFixtureCandidate,
  type AuthorMailingCandidate,
  type DeliveryGateFacts,
} from "./recipients";
import { validateCampaignDraft, type CampaignDraftInput } from "./validation";

type Row = Record<string, unknown>;

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

export async function loadAuthorMailingCandidates(): Promise<AuthorMailingCandidate[]> {
  const supabase = createServiceRoleClient();
  const [{ data: authors, error: authorsError }, { data: members, error: membersError }, { data: profiles, error: profilesError }, { data: contacts, error: contactsError }, { data: products, error: productsError }] =
    await Promise.all([
      supabase.from("authors").select("id, name, avatar_image, access_status").limit(5000),
      supabase.from("author_members").select("author_id, user_id, role").eq("role", "owner").limit(5000),
      supabase.from("profiles").select("id, email, contact_email, full_name").limit(5000),
      supabase.from("email_contacts").select("id, user_id, normalized_email, status").eq("status", "active").limit(5000),
      supabase.from("practices").select("author_id").eq("status", "published").limit(5000),
    ]);

  if (authorsError || membersError || profilesError || contactsError || productsError) {
    throw new Error("author_mailing_candidates_failed");
  }

  const profileById = new Map(
    ((profiles ?? []) as Row[]).map((row) => [String(row.id), row]),
  );
  const contactByUser = new Map<string, string>();
  for (const row of (contacts ?? []) as Row[]) {
    if (row.user_id) {
      contactByUser.set(String(row.user_id), String(row.id));
    }
  }
  const published = new Set(
    ((products ?? []) as Row[])
      .map((row) => text(row.author_id))
      .filter((id): id is string => Boolean(id)),
  );
  const authorById = new Map(((authors ?? []) as Row[]).map((row) => [String(row.id), row]));
  const candidates: AuthorMailingCandidate[] = [];

  for (const member of (members ?? []) as Row[]) {
    const authorId = text(member.author_id);
    const userId = text(member.user_id);
    if (!authorId || !userId) {
      continue;
    }
    const author = authorById.get(authorId);
    const profile = profileById.get(userId);
    const email = text(profile?.contact_email) ?? text(profile?.email);
    candidates.push({
      authorId,
      userId,
      contactId: contactByUser.get(userId) ?? null,
      email,
      displayName: text(author?.name),
      fullName: text(profile?.full_name),
      isFixture: isMailingFixtureCandidate({
        avatarImage: author?.avatar_image,
        email,
      }),
      hasPublishedProduct: published.has(authorId),
      isCommercial: isCommercialAuthorStatus(text(author?.access_status)),
    });
  }

  return candidates;
}

export async function loadDeliveryGates(
  candidates: readonly AuthorMailingCandidate[],
): Promise<Map<string, DeliveryGateFacts>> {
  const supabase = createServiceRoleClient();
  const emails = [
    ...new Set(
      candidates
        .map((candidate) => (candidate.email ? validateEmailFormat(candidate.email) : null))
        .filter((result): result is { ok: true; normalizedEmail: string; domain: string } => Boolean(result && result.ok))
        .map((result) => result.normalizedEmail),
    ),
  ];
  const userIds = [
    ...new Set(candidates.map((candidate) => candidate.userId).filter((id): id is string => Boolean(id))),
  ];
  const gates = new Map<string, DeliveryGateFacts>();

  if (emails.length === 0) {
    return gates;
  }

  const [{ data: suppressions, error: suppressionError }, { data: preferences, error: preferenceError }, { data: consents, error: consentError }] =
    await Promise.all([
      supabase.from("email_suppressions").select("normalized_email, scope, expires_at, reason").in("normalized_email", emails).limit(5000),
      userIds.length
        ? supabase.from("email_preferences").select("user_id, author_operational, author_marketing").in("user_id", userIds)
        : Promise.resolve({ data: [], error: null }),
      userIds.length
        ? supabase
            .from("email_consents")
            .select("user_id, purpose, status, created_at")
            .eq("purpose", "author_marketing")
            .in("user_id", userIds)
            .order("created_at", { ascending: false })
            .limit(5000)
        : Promise.resolve({ data: [], error: null }),
    ]);

  if (suppressionError || preferenceError || consentError) {
    throw new Error("author_mailing_gates_failed");
  }

  const preferenceByUser = new Map(
    ((preferences ?? []) as Row[]).map((row) => [String(row.user_id), row]),
  );
  const consentsByUser = new Map<string, { purpose: string; status: "granted" | "revoked"; createdAt: string }[]>();
  for (const row of (consents ?? []) as Row[]) {
    const userId = text(row.user_id);
    const status = row.status === "granted" || row.status === "revoked" ? row.status : null;
    if (!userId || !status) {
      continue;
    }
    const list = consentsByUser.get(userId) ?? [];
    list.push({
      purpose: "author_marketing",
      status,
      createdAt: String(row.created_at ?? ""),
    });
    consentsByUser.set(userId, list);
  }
  const suppressionsByEmail = new Map<string, DeliveryGateFacts["suppressions"][number][]>();
  for (const row of (suppressions ?? []) as Row[]) {
    const email = text(row.normalized_email);
    const scope = text(row.scope);
    if (!email || !scope || !isApplicationSuppressionScope(scope)) {
      continue;
    }
    const list = suppressionsByEmail.get(email) ?? [];
    list.push({
      normalizedEmail: email,
      scope: scope as ApplicationSuppressionScope,
      expiresAt: text(row.expires_at),
    });
    suppressionsByEmail.set(email, list);
  }

  for (const candidate of candidates) {
    const parsed = candidate.email ? validateEmailFormat(candidate.email) : null;
    if (!parsed || !parsed.ok || !candidate.userId) {
      continue;
    }
    const preference = preferenceByUser.get(candidate.userId);
    gates.set(parsed.normalizedEmail, {
      suppressions: suppressionsByEmail.get(parsed.normalizedEmail) ?? [],
      preference: preference
        ? {
            author_operational: preference.author_operational !== false,
            author_marketing: preference.author_marketing === true,
          }
        : null,
      latestAuthorMarketingConsent: latestConsentStatus(
        consentsByUser.get(candidate.userId) ?? [],
        "author_marketing",
      ),
    });
  }

  return gates;
}

export async function saveAuthorMailingDraft(input: {
  actorId: string;
  campaignId?: string | null;
  draft: CampaignDraftInput;
}): Promise<{ ok: true; id: string } | { ok: false; code: string }> {
  const validated = validateCampaignDraft(input.draft);
  if (!validated.ok) {
    return validated;
  }

  const runtime = createSupabaseApplicationEmailRuntime();
  const now = new Date().toISOString();

  if (input.campaignId) {
    const updated = await runtime.updateDraft(
      input.campaignId,
      {
        name: validated.value.name,
        subject: validated.value.subject,
        preheader: validated.value.preheader,
        content: validated.value.content,
        filter: validated.value.filter,
        messageType: validated.value.messageType,
      },
      new Date(),
    );
    if (!updated) {
      return { ok: false, code: "not_draft" };
    }
    return { ok: true, id: updated.id };
  }

  const created = await runtime.insertCampaign({
    name: validated.value.name,
    audienceType: "authors",
    messageType: validated.value.messageType,
    senderIdentity: "authors",
    subject: validated.value.subject,
    preheader: validated.value.preheader,
    content: validated.value.content,
    filter: validated.value.filter,
    status: "draft",
    createdBy: input.actorId,
    launchedBy: null,
    createdAt: now,
    updatedAt: now,
    queuedAt: null,
    startedAt: null,
    finishedAt: null,
    recipientTotal: 0,
    recipientQueued: 0,
    recipientSent: 0,
    recipientFailed: 0,
    recipientSuppressed: 0,
    recipientExcluded: 0,
  });

  logMailingEvent("mailing_campaign_created", {
    campaignId: created.id,
    messageType: created.messageType,
  });

  return { ok: true, id: created.id };
}

export async function launchSavedAuthorCampaign(input: {
  campaignId: string;
  actorId: string;
}): Promise<{ ok: true; id: string; ready: number; alreadyLaunched: boolean } | { ok: false; code: string }> {
  const runtime = createSupabaseApplicationEmailRuntime();
  const campaign = await runtime.getCampaign(input.campaignId);
  if (!campaign) {
    return { ok: false, code: "not_found" };
  }

  const candidates = await loadAuthorMailingCandidates();
  const gatesByEmail = await loadDeliveryGates(candidates);
  const result = await launchAuthorCampaign({
    campaign,
    candidates,
    gatesByEmail,
    actorId: input.actorId,
    siteOrigin: getAppOrigin(),
    unsubscribeSecret: process.env.AUDIOLAD_EMAIL_UNSUBSCRIBE_SECRET ?? null,
    runtime,
  });

  if (!result.ok) {
    return result;
  }

  return {
    ok: true,
    id: result.campaignId,
    ready: result.ready,
    alreadyLaunched: result.alreadyLaunched,
  };
}

export async function searchAuthorMailingCandidates(query: string): Promise<
  Array<{ authorId: string; name: string; email: string | null }>
> {
  const needle = query.trim().toLowerCase();
  if (needle.length < 2) {
    return [];
  }
  const candidates = await loadAuthorMailingCandidates();
  return candidates
    .filter((candidate) => {
      const name = candidate.displayName?.toLowerCase() ?? "";
      const email = candidate.email?.toLowerCase() ?? "";
      return name.includes(needle) || email.includes(needle);
    })
    .slice(0, 20)
    .map((candidate) => ({
      authorId: candidate.authorId,
      name: candidate.displayName ?? "Автор",
      email: candidate.email,
    }));
}

export type { EmailCampaignRecord };
