import "server-only";

import type { EditionDateRow } from "@/lib/author-terms/edition-dates";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  AUTHOR_TERMS_APPROVED_META,
  AUTHOR_TERMS_APPROVED_TEXT,
} from "@/lib/author-terms/approved-content";
import {
  APPROVED_AUTHOR_TERMS_EDITIONS,
  evaluateTermsGate,
  findAcceptableEditionByHash,
  type TermsGateResult,
} from "@/lib/author-terms/editions";
import { AuthorTermsError } from "@/lib/author-terms/errors";
import { assertAuthorTermsContentHash } from "@/lib/author-terms/hash";
import { loadAuthorsOnContinuingEdition } from "@/lib/author-terms/continuing-editions";
import { isUnifiedAgreementEnabled } from "@/lib/author-terms/unified-agreement-flag";
import type {
  AuthorTermsAcceptanceRow,
  AuthorTermsStatusView,
  AuthorTermsVersionRow,
} from "@/lib/author-terms/types";
import {
  AUTHOR_TERMS_ACCEPTANCE_CHECKBOX_TEXT,
  AUTHOR_TERMS_ACCEPTANCE_CHECKBOX_TEXT_UPDATED,
} from "@/lib/author-terms/types";
import { activateCommercialAccessAfterTermsAccepted } from "@/lib/authors/activate-commercial-after-terms";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

assertAuthorTermsContentHash(
  AUTHOR_TERMS_APPROVED_TEXT,
  AUTHOR_TERMS_APPROVED_META.contentHash,
);
for (const edition of APPROVED_AUTHOR_TERMS_EDITIONS) {
  assertAuthorTermsContentHash(edition.text, edition.contentHash);
}

const VERSION_COLUMNS =
  "id, version, title, published_at, effective_at, content_hash, document_key, is_current, created_at";
/** Selected only when the unified-agreement flag is on (columns from migration 20270109120000). */
const UNIFIED_VERSION_COLUMNS = `${VERSION_COLUMNS}, covers_business, commercial_access_continues`;

function adminClient(): SupabaseClient {
  return createServiceRoleClient();
}

export function getApprovedAuthorTermsDocument() {
  return {
    ...AUTHOR_TERMS_APPROVED_META,
    text: AUTHOR_TERMS_APPROVED_TEXT,
  };
}

export async function getCurrentAuthorTermsVersion(
  client: SupabaseClient = adminClient(),
): Promise<AuthorTermsVersionRow | null> {
  const { data, error } = await client
    .from("author_terms_versions")
    .select(isUnifiedAgreementEnabled() ? UNIFIED_VERSION_COLUMNS : VERSION_COLUMNS)
    .eq("is_current", true)
    .maybeSingle();

  if (error) {
    console.error("author_terms_current_version_error", error.message);
    throw new AuthorTermsError("internal_error", 500);
  }

  return (data as unknown as AuthorTermsVersionRow | null) ?? null;
}

/**
 * Publication / effective dates of all Author Terms editions from the DB (the only source of the
 * 2.0 dates: set when 2.0 becomes current). Read-only, no PII.
 */
export async function listAuthorTermsVersionDates(
  client: SupabaseClient = adminClient(),
): Promise<EditionDateRow[]> {
  const { data, error } = await client
    .from("author_terms_versions")
    .select("content_hash, published_at, effective_at, is_current")
    .eq("document_key", "author-terms");
  if (error) {
    console.error("author_terms_version_dates_error", error.message);
    throw new AuthorTermsError("internal_error", 500);
  }
  return (data ?? []) as EditionDateRow[];
}

type EditionFlags = { covers_business: boolean | null; commercial_access_continues: boolean | null };

/** All acceptances of an author with the edition flags (flag on only). */
async function listAuthorTermsAcceptanceEditions(
  authorId: string,
  client: SupabaseClient,
): Promise<{ termsVersionId: string; coversBusiness: boolean; keepsCommercialAccess: boolean }[]> {
  const { data, error } = await client
    .from("author_terms_acceptances")
    .select("terms_version_id, author_terms_versions!inner(covers_business, commercial_access_continues, document_key)")
    .eq("author_id", authorId)
    .eq("author_terms_versions.document_key", "author-terms");
  if (error) {
    console.error("author_terms_acceptance_editions_error", error.message);
    throw new AuthorTermsError("internal_error", 500);
  }
  return ((data ?? []) as unknown as {
    terms_version_id: string;
    author_terms_versions: EditionFlags | EditionFlags[] | null;
  }[]).map((row) => {
    const version = Array.isArray(row.author_terms_versions)
      ? row.author_terms_versions[0]
      : row.author_terms_versions;
    return {
      termsVersionId: row.terms_version_id,
      coversBusiness: version?.covers_business === true,
      keepsCommercialAccess: version?.commercial_access_continues === true,
    };
  });
}

export async function getAuthorTermsAcceptanceForVersion(
  authorId: string,
  termsVersionId: string,
  client: SupabaseClient = adminClient(),
): Promise<AuthorTermsAcceptanceRow | null> {
  const { data, error } = await client
    .from("author_terms_acceptances")
    .select(
      "id, author_id, terms_version_id, accepted_at, accepted_by_user_id, acceptance_text, created_at",
    )
    .eq("author_id", authorId)
    .eq("terms_version_id", termsVersionId)
    .maybeSingle();

  if (error) {
    console.error("author_terms_acceptance_lookup_error", error.message);
    throw new AuthorTermsError("internal_error", 500);
  }

  return (data as AuthorTermsAcceptanceRow | null) ?? null;
}

export async function hasAcceptedCurrentAuthorTerms(
  authorId: string,
  client: SupabaseClient = adminClient(),
): Promise<{
  /** Commercial gates: current edition accepted, or (flag on) an earlier edition that keeps commercial access (no end date). */
  accepted: boolean;
  currentVersion: AuthorTermsVersionRow | null;
  acceptance: AuthorTermsAcceptanceRow | null;
  gate: TermsGateResult;
}> {
  const currentVersion = await getCurrentAuthorTermsVersion(client);
  const acceptance = currentVersion
    ? await getAuthorTermsAcceptanceForVersion(authorId, currentVersion.id, client)
    : null;
  const unifiedEnabled = isUnifiedAgreementEnabled();
  let acceptances: { termsVersionId: string; coversBusiness: boolean; keepsCommercialAccess: boolean }[] =
    unifiedEnabled && currentVersion
      ? await listAuthorTermsAcceptanceEditions(authorId, client)
      : acceptance
        ? [{ termsVersionId: acceptance.terms_version_id, coversBusiness: false, keepsCommercialAccess: false }]
        : [];
  if (!unifiedEnabled && currentVersion && !acceptance) {
    // Flag off but DB already switched (flag turned off / lost on redeploy): 1.2 authors must keep
    // their commercial access — no forced cut-off. Commercial only; never Business, never an invite.
    let continuing: Set<string>;
    try {
      continuing = await loadAuthorsOnContinuingEdition(client, [authorId]);
    } catch (error) {
      console.error("author_terms_continuing_lookup_error", error instanceof Error ? error.message : "unknown");
      throw new AuthorTermsError("internal_error", 500);
    }
    if (continuing.has(authorId)) {
      acceptances = [{ termsVersionId: "earlier-continuing-edition", coversBusiness: false, keepsCommercialAccess: true }];
    }
  }
  const gate = evaluateTermsGate({
    unifiedEnabled,
    now: new Date(),
    current: currentVersion
      ? {
          id: currentVersion.id,
          coversBusiness: currentVersion.covers_business === true,
        }
      : null,
    acceptances,
  });

  return {
    accepted: gate.accepted,
    currentVersion,
    acceptance,
    gate,
  };
}

export async function loadAuthorTermsStatus(input: {
  authorId: string;
  role: "owner" | "editor";
  /** Platform-owner support session: acceptance is never offered (8dcba9d1). */
  supportMode: boolean;
}): Promise<AuthorTermsStatusView> {
  const { currentVersion, acceptance, gate } =
    await hasAcceptedCurrentAuthorTerms(input.authorId);
  const accepted = gate.acceptedCurrent;

  return {
    currentVersion: currentVersion
      ? {
          id: currentVersion.id,
          version: currentVersion.version,
          title: currentVersion.title,
          publishedAt: currentVersion.published_at,
          effectiveAt: currentVersion.effective_at,
          contentHash: currentVersion.content_hash,
          url: "/author-terms",
        }
      : null,
    acceptedCurrent: accepted,
    acceptance:
      acceptance && currentVersion
        ? {
            acceptedAt: acceptance.accepted_at,
            termsVersionId: acceptance.terms_version_id,
            version: currentVersion.version,
          }
        : null,
    canAccept:
      !input.supportMode &&
      input.role === "owner" &&
      Boolean(currentVersion) &&
      !accepted,
    role: input.role,
    supportMode: input.supportMode,
    reacceptInvited: gate.reacceptInvited,
    previousEditionActive: gate.previousEditionActive,
    coversBusiness: currentVersion?.covers_business === true,
    businessAgreement: gate.businessAgreement,
  };
}

export async function acceptCurrentAuthorTerms(input: {
  authorId: string;
  userId: string;
  role: "owner" | "editor";
  ipAddress: string | null;
  userAgent: string | null;
  hadPriorAcceptance: boolean;
  /** Must be false: support mode never records an acceptance (8dcba9d1). */
  supportMode: boolean;
  /**
   * Edition the author actually saw (id + content hash from the status view).
   * Required when the unified-agreement flag is on: a form opened under 1.2 can
   * never record an acceptance of 2.0. Validated whenever provided.
   */
  expectedTermsVersionId?: string | null;
  expectedContentHash?: string | null;
}): Promise<{
  acceptance: AuthorTermsAcceptanceRow;
  created: boolean;
  currentVersion: AuthorTermsVersionRow;
}> {
  if (input.supportMode !== false) {
    throw new AuthorTermsError("support_mode_acceptance_forbidden", 403);
  }
  if (input.role !== "owner") {
    throw new AuthorTermsError("forbidden", 403);
  }

  const currentVersion = await getCurrentAuthorTermsVersion();
  if (!currentVersion) {
    throw new AuthorTermsError("terms_not_published", 503);
  }

  const unifiedEnabled = isUnifiedAgreementEnabled();
  const bindingProvided = Boolean(input.expectedTermsVersionId || input.expectedContentHash);
  if (
    (unifiedEnabled && !bindingProvided) ||
    (bindingProvided &&
      (input.expectedTermsVersionId !== currentVersion.id ||
        input.expectedContentHash !== currentVersion.content_hash))
  ) {
    throw new AuthorTermsError("terms_version_changed", 409);
  }

  // Client cannot choose a non-current edition. The DB current hash must be an
  // approved edition in code (flag off: only 1.2, exactly as before).
  const edition = findAcceptableEditionByHash(
    currentVersion.content_hash,
    unifiedEnabled,
  );
  if (!edition || edition.version !== currentVersion.version) {
    console.error("author_terms_hash_drift", {
      db: currentVersion.content_hash,
      code: AUTHOR_TERMS_APPROVED_META.contentHash,
    });
    throw new AuthorTermsError("terms_hash_mismatch", 500);
  }

  const acceptanceText =
    edition.contentHash === AUTHOR_TERMS_APPROVED_META.contentHash
      ? input.hadPriorAcceptance
        ? AUTHOR_TERMS_ACCEPTANCE_CHECKBOX_TEXT_UPDATED
        : AUTHOR_TERMS_ACCEPTANCE_CHECKBOX_TEXT
      : input.hadPriorAcceptance
        ? edition.acceptanceTextUpdated
        : edition.acceptanceText;

  const existing = await getAuthorTermsAcceptanceForVersion(
    input.authorId,
    currentVersion.id,
  );
  if (existing) {
    // Self-heal: previously accepted terms but still stuck in onboarding.
    await activateCommercialAccessAfterTermsAccepted({
      authorId: input.authorId,
      actorUserId: input.userId,
    });
    return {
      acceptance: existing,
      created: false,
      currentVersion,
    };
  }

  const client = adminClient();
  const { data, error } = await client
    .from("author_terms_acceptances")
    .insert({
      author_id: input.authorId,
      terms_version_id: currentVersion.id,
      accepted_by_user_id: input.userId,
      ip_address: input.ipAddress,
      user_agent: input.userAgent
        ? input.userAgent.slice(0, 512)
        : null,
      acceptance_text: acceptanceText,
    })
    .select(
      "id, author_id, terms_version_id, accepted_at, accepted_by_user_id, acceptance_text, created_at",
    )
    .single();

  if (error) {
    // Unique race: treat as idempotent success.
    if (error.code === "23505") {
      const again = await getAuthorTermsAcceptanceForVersion(
        input.authorId,
        currentVersion.id,
      );
      if (again) {
        await activateCommercialAccessAfterTermsAccepted({
          authorId: input.authorId,
          actorUserId: input.userId,
        });
        return {
          acceptance: again,
          created: false,
          currentVersion,
        };
      }
    }

    console.error("author_terms_accept_insert_error", error.message);
    throw new AuthorTermsError("internal_error", 500);
  }

  await activateCommercialAccessAfterTermsAccepted({
    authorId: input.authorId,
    actorUserId: input.userId,
  });

  return {
    acceptance: data as AuthorTermsAcceptanceRow,
    created: true,
    currentVersion,
  };
}

export async function authorHasAnyTermsAcceptance(
  authorId: string,
  client: SupabaseClient = adminClient(),
): Promise<boolean> {
  const { data, error } = await client
    .from("author_terms_acceptances")
    .select("id")
    .eq("author_id", authorId)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("author_terms_any_acceptance_error", error.message);
    throw new AuthorTermsError("internal_error", 500);
  }

  return Boolean(data?.id);
}
