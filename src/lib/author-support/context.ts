import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { AuthorMemberRole, AuthorWorkspace } from "@/lib/author-products/types";
import type { AuthorAccessStatus } from "@/lib/authors/access";
import { isPlatformOwner } from "@/lib/auth/platform-admin";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

import { assertSupportAuthorScope } from "./policy";
import { readAuthorSupportCookie } from "./session";
import {
  loadActingAuthorMembership,
  lookupAuthorSupportSessionByToken,
  type ActingAuthorMembership,
} from "./store";

export type AuthorExecutionContext = {
  realUserId: string;
  actingUserId: string;
  actingAuthorId: string | null;
  isSupportMode: boolean;
  membershipRole: AuthorMemberRole | null;
  accessStatus: AuthorAccessStatus | null;
  sessionId: string | null;
  actingDisplayName: string | null;
  actingAuthorName: string | null;
  actingAuthorSlug: string | null;
  canBypassProductModeration: boolean;
};

function normalContext(realUserId: string): AuthorExecutionContext {
  return {
    realUserId,
    actingUserId: realUserId,
    actingAuthorId: null,
    isSupportMode: false,
    membershipRole: null,
    accessStatus: null,
    sessionId: null,
    actingDisplayName: null,
    actingAuthorName: null,
    actingAuthorSlug: null,
    canBypassProductModeration: false,
  };
}

export async function peekAuthorExecutionContext(): Promise<AuthorExecutionContext | null> {
  try {
    return await getAuthorExecutionContext();
  } catch {
    return null;
  }
}

export async function getAuthorExecutionContext(): Promise<AuthorExecutionContext> {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (!user || error) {
    throw new Error("unauthorized");
  }

  const token = await readAuthorSupportCookie();
  if (!token) {
    return normalContext(user.id);
  }

  const session = await lookupAuthorSupportSessionByToken(token);
  if (!session || session.actorUserId !== user.id || session.revokedAt) {
    return normalContext(user.id);
  }
  if (new Date(session.expiresAt).getTime() <= Date.now()) {
    return normalContext(user.id);
  }

  const owner = await isPlatformOwner(supabase, user.id);
  if (!owner) {
    return normalContext(user.id);
  }

  const membership = await loadActingAuthorMembership({
    actingUserId: session.actingUserId,
    actingAuthorId: session.actingAuthorId,
  });
  if (!membership) {
    return normalContext(user.id);
  }

  return {
    realUserId: user.id,
    actingUserId: session.actingUserId,
    actingAuthorId: session.actingAuthorId,
    isSupportMode: true,
    membershipRole: membership.role,
    accessStatus: membership.accessStatus,
    sessionId: session.id,
    actingDisplayName: membership.actingDisplayName,
    actingAuthorName: membership.authorName,
    actingAuthorSlug: membership.authorSlug,
    canBypassProductModeration: membership.canBypassProductModeration,
  };
}

export async function getAuthorDataClient(
  execution: AuthorExecutionContext,
  userClient: SupabaseClient,
): Promise<SupabaseClient> {
  if (execution.isSupportMode) {
    return createServiceRoleClient();
  }
  return userClient;
}

export async function getAuthorRpcClient(
  fallback: SupabaseClient,
): Promise<SupabaseClient> {
  const execution = await peekAuthorExecutionContext();
  if (execution?.isSupportMode) {
    return createClient();
  }
  return fallback;
}

export function requestedAuthorMatchesSupport(
  execution: AuthorExecutionContext,
  requestedAuthorId: string,
): boolean {
  if (!execution.isSupportMode || !execution.actingAuthorId) {
    return true;
  }
  return assertSupportAuthorScope({
    actingAuthorId: execution.actingAuthorId,
    requestedAuthorId,
  });
}

export function toSupportWorkspace(
  execution: AuthorExecutionContext,
  membership: ActingAuthorMembership,
): AuthorWorkspace {
  return {
    id: execution.actingAuthorId as string,
    name: membership.authorName,
    slug: membership.authorSlug,
    role: membership.role,
    accessStatus: membership.accessStatus,
    canBypassProductModeration: membership.canBypassProductModeration,
  };
}
