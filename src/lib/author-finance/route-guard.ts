/**
 * The single ownership gate for /api/author/finance/*.
 *
 * The client sends an author id. That id is never trusted on its own: it is
 * only ever a *claim*. This helper resolves it against the caller's own session
 * through requireAuthorMembership(), which reads author_members with the user's
 * token, and returns the id only once the membership is proved. Every finance
 * route calls this before touching a query, and the verified id — not the query
 * parameter — is what reaches the RPC layer.
 *
 * Both owner and editor may read: the finance cabinet is read-only, and an
 * editor who runs a workspace day to day needs to see whether money arrived.
 *
 * A platform admin deliberately gets nothing extra here. Viewing another
 * author's finance is an admin capability and lives in the admin panel, behind
 * its own RBAC. Letting a staff account borrow this endpoint would turn an
 * author-scoped API into an unaudited cross-author one.
 */

import {
  AuthorAccessError,
  requireAuthorMembership,
} from "@/lib/author-products/auth";
import type { AuthorMemberRole } from "@/lib/author-products/types";
import { peekAuthorExecutionContext } from "@/lib/author-support/context";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string | null | undefined): boolean {
  return typeof value === "string" && UUID_PATTERN.test(value.trim());
}

export type AuthorFinanceContext = {
  authorId: string;
  role: AuthorMemberRole;
  accessStatus: string;
};

export async function requireAuthorFinanceAccess(
  request: Request,
): Promise<AuthorFinanceContext> {
  const execution = await peekAuthorExecutionContext();
  if (execution?.isSupportMode) {
    throw new AuthorAccessError("support_sensitive_route_blocked", 403);
  }

  const url = new URL(request.url);
  const claimed = url.searchParams.get("author_id")?.trim() ?? "";

  if (!UUID_PATTERN.test(claimed)) {
    throw new AuthorAccessError("invalid_request", 400);
  }

  const { role, accessStatus } = await requireAuthorMembership(claimed);

  return { authorId: claimed, role, accessStatus };
}

export function parsePositiveInt(
  value: string | null,
  fallback: number,
  max: number,
): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
}

export function parseOffset(value: string | null): number {
  if (!value) return 0;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return parsed;
}
