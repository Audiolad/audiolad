/**
 * Ownership gate for /api/author/stats/*.
 *
 * Mirrors requireAuthorFinanceAccess: author_id from the client is only a claim.
 * Platform admins without author_members get 403 – no impersonation via this API.
 */

import {
  AuthorAccessError,
  requireAuthorMembership,
} from "@/lib/author-products/auth";
import type { AuthorMemberRole } from "@/lib/author-products/types";

import {
  getAuthorStatsPeriodBounds,
  parseAuthorStatsPeriod,
} from "./dates";
import type { AuthorStatsPeriodKey } from "./types";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string | null | undefined): boolean {
  return typeof value === "string" && UUID_PATTERN.test(value.trim());
}

export type AuthorStatsContext = {
  authorId: string;
  role: AuthorMemberRole;
  accessStatus: string;
  period: AuthorStatsPeriodKey;
  dateFrom: string | null;
  dateTo: string | null;
};

export async function requireAuthorStatsAccess(
  request: Request,
): Promise<AuthorStatsContext> {
  const url = new URL(request.url);
  const claimed = url.searchParams.get("author_id")?.trim() ?? "";

  if (!UUID_PATTERN.test(claimed)) {
    throw new AuthorAccessError("invalid_request", 400);
  }

  const rawPeriod = url.searchParams.get("period");
  if (
    rawPeriod !== null &&
    rawPeriod !== "" &&
    rawPeriod !== "7d" &&
    rawPeriod !== "30d" &&
    rawPeriod !== "90d" &&
    rawPeriod !== "all"
  ) {
    throw new AuthorAccessError("invalid_request", 400);
  }

  const period = parseAuthorStatsPeriod(rawPeriod);
  const { dateFrom, dateTo } = getAuthorStatsPeriodBounds(period);
  const { role, accessStatus } = await requireAuthorMembership(claimed);

  return {
    authorId: claimed,
    role,
    accessStatus,
    period,
    dateFrom,
    dateTo,
  };
}
