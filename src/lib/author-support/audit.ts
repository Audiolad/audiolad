import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/service-role";

import { peekAuthorExecutionContext } from "./context";
import { sanitizeAuthorSupportAuditMetadata } from "./policy";

export class AuthorSupportAuditError extends Error {
  readonly code = "author_support_audit_failed" as const;
  readonly status = 500;

  constructor(message = "author_support_audit_failed") {
    super(message);
    this.name = "AuthorSupportAuditError";
  }
}

export function isAuthorSupportAuditError(
  error: unknown,
): error is AuthorSupportAuditError {
  return error instanceof AuthorSupportAuditError;
}

async function insertAuthorSupportAuditOrThrow(input: {
  actorUserId: string;
  actingUserId: string;
  actingAuthorId: string;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const service = createServiceRoleClient();
  const { error } = await service.from("author_support_audit_events").insert({
    actor_user_id: input.actorUserId,
    acting_user_id: input.actingUserId,
    acting_author_id: input.actingAuthorId,
    action: input.action,
    resource_type: input.resourceType,
    resource_id: input.resourceId ?? null,
    metadata: sanitizeAuthorSupportAuditMetadata(input.metadata),
  });

  if (error) {
    throw new AuthorSupportAuditError();
  }
}

/**
 * Fail-closed journal for support-mode mutations.
 * Throws if the insert fails so the caller must not continue the change.
 */
export async function recordAuthorSupportAudit(input: {
  action: string;
  resourceType: string;
  resourceId?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const execution = await peekAuthorExecutionContext();
  if (!execution?.isSupportMode || !execution.actingAuthorId) {
    return;
  }

  await insertAuthorSupportAuditOrThrow({
    actorUserId: execution.realUserId,
    actingUserId: execution.actingUserId,
    actingAuthorId: execution.actingAuthorId,
    action: input.action,
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    metadata: input.metadata,
  });
}

export async function recordAuthorSupportSessionAudit(input: {
  action: "support_session_started" | "support_session_ended";
  actorUserId: string;
  actingUserId: string;
  actingAuthorId: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await insertAuthorSupportAuditOrThrow({
    actorUserId: input.actorUserId,
    actingUserId: input.actingUserId,
    actingAuthorId: input.actingAuthorId,
    action: input.action,
    resourceType: "author_support_session",
    resourceId: null,
    metadata: input.metadata,
  });
}
