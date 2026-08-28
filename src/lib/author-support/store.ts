import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/service-role";

import type { AuthorMemberRole } from "@/lib/author-products/types";
import type { AuthorAccessStatus } from "@/lib/authors/access";

import { AUTHOR_SUPPORT_TTL_SECONDS, isAuthorSupportSessionUsable } from "./policy";
import {
  authorSupportTokenHashesEqual,
  hashAuthorSupportToken,
  type AuthorSupportSessionRecord,
} from "./session";

const SESSION_SELECT =
  "id, token_hash, actor_user_id, acting_user_id, acting_author_id, expires_at, revoked_at";

type SessionRow = {
  id: string;
  token_hash: string;
  actor_user_id: string;
  acting_user_id: string;
  acting_author_id: string;
  expires_at: string;
  revoked_at: string | null;
};

export type { AuthorSupportSessionRecord };

export type ActingAuthorMembership = {
  role: AuthorMemberRole;
  accessStatus: AuthorAccessStatus;
  authorName: string;
  authorSlug: string;
  canBypassProductModeration: boolean;
  actingDisplayName: string;
};

function mapSessionRow(row: SessionRow): AuthorSupportSessionRecord {
  return {
    id: row.id,
    actorUserId: row.actor_user_id,
    actingUserId: row.acting_user_id,
    actingAuthorId: row.acting_author_id,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
  };
}

export async function lookupAuthorSupportSessionByToken(
  token: string,
): Promise<AuthorSupportSessionRecord | null> {
  const tokenHash = hashAuthorSupportToken(token);
  const service = createServiceRoleClient();
  const { data, error } = await service
    .from("author_support_sessions")
    .select(SESSION_SELECT)
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (error) {
    console.error("author_support_session_lookup_error");
    return null;
  }
  if (!data) {
    return null;
  }

  const row = data as SessionRow;
  if (!authorSupportTokenHashesEqual(row.token_hash, tokenHash)) {
    return null;
  }

  return mapSessionRow(row);
}

export async function createAuthorSupportSession(input: {
  token: string;
  actorUserId: string;
  actingUserId: string;
  actingAuthorId: string;
}): Promise<AuthorSupportSessionRecord> {
  const service = createServiceRoleClient();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + AUTHOR_SUPPORT_TTL_SECONDS * 1000).toISOString();

  const { error: revokeError } = await service
    .from("author_support_sessions")
    .update({ revoked_at: now.toISOString() })
    .eq("actor_user_id", input.actorUserId)
    .is("revoked_at", null);

  if (revokeError) {
    console.error("author_support_session_revoke_previous_error");
    throw new Error("author_support_session_create_failed");
  }

  const { data, error } = await service
    .from("author_support_sessions")
    .insert({
      token_hash: hashAuthorSupportToken(input.token),
      actor_user_id: input.actorUserId,
      acting_user_id: input.actingUserId,
      acting_author_id: input.actingAuthorId,
      created_at: now.toISOString(),
      expires_at: expiresAt,
    })
    .select(SESSION_SELECT)
    .single();

  if (error || !data) {
    console.error("author_support_session_create_error");
    throw new Error("author_support_session_create_failed");
  }

  return mapSessionRow(data as SessionRow);
}

export async function revokeAuthorSupportSession(sessionId: string): Promise<void> {
  const service = createServiceRoleClient();
  const { error } = await service
    .from("author_support_sessions")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", sessionId)
    .is("revoked_at", null);

  if (error) {
    console.error("author_support_session_revoke_error");
  }
}

export async function revokeAuthorSupportSessionsForActor(actorUserId: string): Promise<void> {
  const service = createServiceRoleClient();
  const { error } = await service
    .from("author_support_sessions")
    .update({ revoked_at: new Date().toISOString() })
    .eq("actor_user_id", actorUserId)
    .is("revoked_at", null);

  if (error) {
    console.error("author_support_session_revoke_actor_error");
  }
}

export async function loadActingAuthorMembership(input: {
  actingUserId: string;
  actingAuthorId: string;
}): Promise<ActingAuthorMembership | null> {
  const service = createServiceRoleClient();
  const { data, error } = await service
    .from("author_members")
    .select(
      `
      role,
      authors!author_members_author_id_fkey (
        id,
        name,
        slug,
        access_status,
        can_bypass_product_moderation
      )
    `,
    )
    .eq("user_id", input.actingUserId)
    .eq("author_id", input.actingAuthorId)
    .maybeSingle();

  if (error) {
    console.error("author_support_membership_lookup_error");
    return null;
  }

  const author = Array.isArray(data?.authors) ? data.authors[0] : data?.authors;
  if (!data || !author?.id || (data.role !== "owner" && data.role !== "editor")) {
    return null;
  }

  const { data: profile } = await service
    .from("profiles")
    .select("full_name, email")
    .eq("id", input.actingUserId)
    .maybeSingle();

  const displayName =
    (typeof profile?.full_name === "string" && profile.full_name.trim()) ||
    (typeof profile?.email === "string" && profile.email.split("@")[0]) ||
    "Автор";

  return {
    role: data.role as AuthorMemberRole,
    accessStatus: (author.access_status ?? "free") as AuthorAccessStatus,
    authorName: (author.name as string) || "Автор",
    authorSlug: (author.slug as string) || "",
    canBypassProductModeration: author.can_bypass_product_moderation === true,
    actingDisplayName: displayName,
  };
}

export async function loadTargetUserExists(userId: string): Promise<boolean> {
  const service = createServiceRoleClient();
  const { data, error } = await service
    .from("profiles")
    .select("id")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    console.error("author_support_target_user_lookup_error");
    return false;
  }

  return Boolean(data?.id);
}

export function sessionIsActiveForActor(
  session: AuthorSupportSessionRecord | null,
  realUserId: string,
): boolean {
  return isAuthorSupportSessionUsable({ session, realUserId });
}
