import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/service-role";

import { peekAuthorExecutionContext } from "./context";
import { sanitizeAuthorSupportAuditMetadata } from "./policy";

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

  const service = createServiceRoleClient();
  const { error } = await service.from("author_support_audit_events").insert({
    actor_user_id: execution.realUserId,
    acting_user_id: execution.actingUserId,
    acting_author_id: execution.actingAuthorId,
    action: input.action,
    resource_type: input.resourceType,
    resource_id: input.resourceId ?? null,
    metadata: sanitizeAuthorSupportAuditMetadata(input.metadata),
  });

  if (error) {
    console.error("author_support_audit_insert_failed");
  }
}

export async function recordAuthorSupportSessionAudit(input: {
  action: "support_session_started" | "support_session_ended";
  actorUserId: string;
  actingUserId: string;
  actingAuthorId: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const service = createServiceRoleClient();
  const { error } = await service.from("author_support_audit_events").insert({
    actor_user_id: input.actorUserId,
    acting_user_id: input.actingUserId,
    acting_author_id: input.actingAuthorId,
    action: input.action,
    resource_type: "author_support_session",
    resource_id: null,
    metadata: sanitizeAuthorSupportAuditMetadata(input.metadata),
  });

  if (error) {
    console.error("author_support_audit_insert_failed");
  }
}
