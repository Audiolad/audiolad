/**
 * Service-role wrappers around the P3.3.2 commercial terms RPCs.
 *
 * Terms are the only place a revenue share is ever decided, so every mutation
 * goes through SQL: approved rows are immutable and the RPCs are the only path
 * that may close or supersede them.
 */

import {
  isAuthorTermsStatus,
  type AuthorTermsStatus,
} from "@/lib/payments/author-finance/types";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export type AuthorCommercialTerms = {
  id: string;
  authorId: string;
  currency: string;
  authorShareBps: number;
  holdDays: number;
  status: AuthorTermsStatus;
  validFrom: string;
  validTo: string | null;
  notes: string | null;
  approvedAt: string | null;
  closedAt: string | null;
  createdAt: string | null;
};

export type AuthorTermsRpcResult = {
  ok: boolean;
  outcome: string;
  status: AuthorTermsStatus | null;
  termsId: string | null;
  idempotentReplay: boolean;
  terms: AuthorCommercialTerms | null;
  error: string | null;
};

function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function asText(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

function mapTerms(raw: unknown): AuthorCommercialTerms | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  if (typeof row.id !== "string" || !isAuthorTermsStatus(row.status)) return null;

  return {
    id: row.id,
    authorId: String(row.author_id ?? ""),
    currency: String(row.currency ?? "RUB"),
    authorShareBps: asNumber(row.author_share_bps),
    holdDays: asNumber(row.hold_days),
    status: row.status,
    validFrom: String(row.valid_from ?? ""),
    validTo: asText(row.valid_to),
    notes: asText(row.notes),
    approvedAt: asText(row.approved_at),
    closedAt: asText(row.closed_at),
    createdAt: asText(row.created_at),
  };
}

function mapResult(raw: unknown): AuthorTermsRpcResult {
  const row = (raw ?? {}) as Record<string, unknown>;

  return {
    ok: row.ok === true,
    outcome: typeof row.outcome === "string" ? row.outcome : "unknown",
    status: isAuthorTermsStatus(row.status) ? row.status : null,
    termsId: asText(row.terms_id),
    idempotentReplay: row.idempotent_replay === true,
    terms: mapTerms(row.terms),
    error: asText(row.error),
  };
}

/**
 * Postgres RAISE EXCEPTION messages here are our own snake_case validation
 * codes, so they are safe to hand back to admin callers.
 */
function toValidationCode(message: string | undefined): string {
  const known = [
    "author_id_required",
    "author_not_found",
    "terms_id_required",
    "terms_not_found",
    "invalid_author_share_bps",
    "invalid_hold_days",
    "invalid_validity_window",
    "invalid_close_status",
    "terms_not_approvable",
    "terms_not_closable",
    "author_commercial_terms_overlap",
    "author_commercial_terms_approved_immutable",
    "author_commercial_terms_rpc_required",
  ];
  const match = known.find((code) => message?.includes(code));
  return match ?? "author_terms_rpc_error";
}

function rpcFailure(code: string): AuthorTermsRpcResult {
  return {
    ok: false,
    outcome: "rejected",
    status: null,
    termsId: null,
    idempotentReplay: false,
    terms: null,
    error: code,
  };
}

export async function createAuthorCommercialTermsDraft(input: {
  authorId: string;
  authorShareBps: number;
  validFrom: string;
  validTo?: string | null;
  holdDays?: number;
  currency?: string;
  notes?: string | null;
  actorUserId: string | null;
  correlationId?: string | null;
  approveImmediately?: boolean;
}): Promise<AuthorTermsRpcResult> {
  const supabase = createServiceRoleClient();

  const { data, error } = await supabase.rpc(
    "create_author_commercial_terms_draft",
    {
      p_author_id: input.authorId,
      p_author_share_bps: input.authorShareBps,
      p_valid_from: input.validFrom,
      p_valid_to: input.validTo ?? null,
      p_hold_days: input.holdDays ?? 14,
      p_currency: input.currency ?? "RUB",
      p_notes: input.notes ?? null,
      p_actor_user_id: input.actorUserId,
      p_correlation_id: input.correlationId ?? null,
      p_approve_immediately: input.approveImmediately === true,
    },
  );

  if (error) {
    const code = toValidationCode(error.message);
    if (code === "author_terms_rpc_error") {
      console.error("create_author_commercial_terms_draft_error", error.message);
    }
    return rpcFailure(code);
  }

  return mapResult(data);
}

export async function approveAuthorCommercialTerms(input: {
  termsId: string;
  actorUserId: string | null;
  correlationId?: string | null;
}): Promise<AuthorTermsRpcResult> {
  const supabase = createServiceRoleClient();

  const { data, error } = await supabase.rpc(
    "approve_author_commercial_terms",
    {
      p_terms_id: input.termsId,
      p_actor_user_id: input.actorUserId,
      p_correlation_id: input.correlationId ?? null,
    },
  );

  if (error) {
    const code = toValidationCode(error.message);
    if (code === "author_terms_rpc_error") {
      console.error("approve_author_commercial_terms_error", error.message);
    }
    return rpcFailure(code);
  }

  return mapResult(data);
}

export async function closeAuthorCommercialTerms(input: {
  termsId: string;
  validTo: string;
  reason?: string | null;
  actorUserId: string | null;
  correlationId?: string | null;
  newStatus?: "superseded" | "cancelled";
}): Promise<AuthorTermsRpcResult> {
  const supabase = createServiceRoleClient();

  const { data, error } = await supabase.rpc("close_author_commercial_terms", {
    p_terms_id: input.termsId,
    p_valid_to: input.validTo,
    p_reason: input.reason ?? null,
    p_actor_user_id: input.actorUserId,
    p_correlation_id: input.correlationId ?? null,
    p_new_status: input.newStatus ?? "superseded",
  });

  if (error) {
    const code = toValidationCode(error.message);
    if (code === "author_terms_rpc_error") {
      console.error("close_author_commercial_terms_error", error.message);
    }
    return rpcFailure(code);
  }

  return mapResult(data);
}

/**
 * Payout eligibility is an explicit admin decision, never inferred from a
 * commercial access status: the current commercial catalog is platform-owned.
 */
export async function setAuthorPayoutEligibility(input: {
  authorId: string;
  payoutEligible: boolean;
}): Promise<boolean> {
  const supabase = createServiceRoleClient();

  const { error } = await supabase
    .from("authors")
    .update({ payout_eligible: input.payoutEligible })
    .eq("id", input.authorId);

  if (error) {
    console.error("set_author_payout_eligibility_error", error.message);
    return false;
  }

  return true;
}
