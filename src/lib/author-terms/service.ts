import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  AUTHOR_TERMS_APPROVED_META,
  AUTHOR_TERMS_APPROVED_TEXT,
} from "@/lib/author-terms/approved-content";
import { AuthorTermsError } from "@/lib/author-terms/errors";
import { assertAuthorTermsContentHash } from "@/lib/author-terms/hash";
import type {
  AuthorTermsAcceptanceRow,
  AuthorTermsStatusView,
  AuthorTermsVersionRow,
} from "@/lib/author-terms/types";
import {
  AUTHOR_TERMS_ACCEPTANCE_CHECKBOX_TEXT,
  AUTHOR_TERMS_ACCEPTANCE_CHECKBOX_TEXT_UPDATED,
} from "@/lib/author-terms/types";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

assertAuthorTermsContentHash(
  AUTHOR_TERMS_APPROVED_TEXT,
  AUTHOR_TERMS_APPROVED_META.contentHash,
);

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
    .select(
      "id, version, title, published_at, effective_at, content_hash, document_key, is_current, created_at",
    )
    .eq("is_current", true)
    .maybeSingle();

  if (error) {
    console.error("author_terms_current_version_error", error.message);
    throw new AuthorTermsError("internal_error", 500);
  }

  return (data as AuthorTermsVersionRow | null) ?? null;
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
  accepted: boolean;
  currentVersion: AuthorTermsVersionRow | null;
  acceptance: AuthorTermsAcceptanceRow | null;
}> {
  const currentVersion = await getCurrentAuthorTermsVersion(client);
  if (!currentVersion) {
    return { accepted: false, currentVersion: null, acceptance: null };
  }

  const acceptance = await getAuthorTermsAcceptanceForVersion(
    authorId,
    currentVersion.id,
    client,
  );

  return {
    accepted: Boolean(acceptance),
    currentVersion,
    acceptance,
  };
}

export async function loadAuthorTermsStatus(input: {
  authorId: string;
  role: "owner" | "editor";
}): Promise<AuthorTermsStatusView> {
  const { accepted, currentVersion, acceptance } =
    await hasAcceptedCurrentAuthorTerms(input.authorId);

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
    canAccept: input.role === "owner" && Boolean(currentVersion) && !accepted,
    role: input.role,
  };
}

export async function acceptCurrentAuthorTerms(input: {
  authorId: string;
  userId: string;
  role: "owner" | "editor";
  ipAddress: string | null;
  userAgent: string | null;
  hadPriorAcceptance: boolean;
}): Promise<{
  acceptance: AuthorTermsAcceptanceRow;
  created: boolean;
  currentVersion: AuthorTermsVersionRow;
}> {
  if (input.role !== "owner") {
    throw new AuthorTermsError("forbidden", 403);
  }

  const currentVersion = await getCurrentAuthorTermsVersion();
  if (!currentVersion) {
    throw new AuthorTermsError("terms_not_published", 503);
  }

  // Client cannot choose a non-current edition.
  if (currentVersion.content_hash !== AUTHOR_TERMS_APPROVED_META.contentHash) {
    console.error("author_terms_hash_drift", {
      db: currentVersion.content_hash,
      code: AUTHOR_TERMS_APPROVED_META.contentHash,
    });
    throw new AuthorTermsError("terms_hash_mismatch", 500);
  }

  const acceptanceText = input.hadPriorAcceptance
    ? AUTHOR_TERMS_ACCEPTANCE_CHECKBOX_TEXT_UPDATED
    : AUTHOR_TERMS_ACCEPTANCE_CHECKBOX_TEXT;

  const existing = await getAuthorTermsAcceptanceForVersion(
    input.authorId,
    currentVersion.id,
  );
  if (existing) {
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
