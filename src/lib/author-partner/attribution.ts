import { createServiceRoleClient } from "@/lib/supabase/service-role";

import { logPartnerAttribution } from "./log";
import {
  createPartnerAttributionToken,
  hashPartnerAttributionToken,
  isPartnerAttributionTokenShape,
} from "./token";

export type PartnerTouchResult =
  | {
      ok: true;
      result:
        | "created"
        | "preserved_first_touch"
        | "already_bound"
        | "already_author"
        | "referral_already_activated"
        | "bound"
        | "already_bound"
        | "preserved_first_touch"
        | "already_author";
      token?: string;
      setCookie: boolean;
      code?: string;
      referrerAuthorId?: string;
      attributionId?: string;
      referralId?: string;
      expiresAt?: string;
    }
  | {
      ok: false;
      error: string;
      setCookie: false;
    };

export type PartnerClaimResult =
  | {
      ok: true;
      result: string;
      referralId?: string;
      referrerAuthorId?: string;
      code?: string;
    }
  | {
      ok: false;
      error: string;
    };

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/**
 * First-touch invite: create or preserve anonymous attribution.
 * Returns a fresh opaque token when a new cookie must be set.
 */
export async function touchPartnerInvite(input: {
  code: string;
  existingToken: string | null | undefined;
  inviteeUserId?: string | null;
}): Promise<PartnerTouchResult> {
  const code = input.code.trim();
  if (!code) {
    return { ok: false, error: "not_found", setCookie: false };
  }

  const existingToken = isPartnerAttributionTokenShape(input.existingToken)
    ? input.existingToken!
    : null;
  const token = existingToken ?? createPartnerAttributionToken();
  const tokenHash = hashPartnerAttributionToken(token);

  try {
    const supabase = createServiceRoleClient();
    const { data, error } = await supabase.rpc("author_partner_touch_invite", {
      p_code: code,
      p_token_hash: tokenHash,
      p_invitee_user_id: input.inviteeUserId ?? null,
    });

    if (error) {
      logPartnerAttribution({
        event: "partner_attribution_touch_failed",
        error: error.message,
        hasToken: Boolean(existingToken),
      });
      return { ok: false, error: "touch_failed", setCookie: false };
    }

    const row = asRecord(data);
    if (!row || row.ok !== true) {
      const err = asString(row?.error) ?? "not_found";
      if (err === "self_referral") {
        logPartnerAttribution({
          event: "partner_attribution_rejected_self_referral",
          error: err,
        });
      } else {
        logPartnerAttribution({
          event: "partner_attribution_rejected_not_found",
          error: err,
        });
      }
      return { ok: false, error: err, setCookie: false };
    }

    const result = asString(row.result) ?? "created";

    if (result === "already_author") {
      logPartnerAttribution({
        event: "partner_attribution_rejected_existing_author",
        result,
      });
      return {
        ok: true,
        result: "already_author",
        setCookie: false,
      };
    }

    if (result === "preserved_first_touch" || result === "already_bound") {
      logPartnerAttribution({
        event: "partner_attribution_preserved_first_touch",
        result,
        attributionId: asString(row.attribution_id),
        referralId: asString(row.referral_id),
        referrerAuthorId: asString(row.referrer_author_id),
      });
      return {
        ok: true,
        result: result as "preserved_first_touch" | "already_bound",
        token: existingToken ?? token,
        setCookie: !existingToken,
        code: asString(row.code),
        referrerAuthorId: asString(row.referrer_author_id),
        attributionId: asString(row.attribution_id),
        referralId: asString(row.referral_id),
        expiresAt: asString(row.expires_at),
      };
    }

    if (result === "bound" || result === "already_bound") {
      logPartnerAttribution({
        event: "partner_attribution_bound_invite_authenticated",
        result,
        referralId: asString(row.referral_id),
        referrerAuthorId: asString(row.referrer_author_id),
      });
      return {
        ok: true,
        result: result as "bound" | "already_bound",
        token,
        setCookie: true,
        code: asString(row.code),
        referrerAuthorId: asString(row.referrer_author_id),
        referralId: asString(row.referral_id),
        expiresAt: asString(row.attribution_expires_at) ?? asString(row.expires_at),
      };
    }

    logPartnerAttribution({
      event: "partner_attribution_created",
      result,
      attributionId: asString(row.attribution_id),
      referrerAuthorId: asString(row.referrer_author_id),
    });

    return {
      ok: true,
      result: "created",
      token,
      setCookie: true,
      code: asString(row.code),
      referrerAuthorId: asString(row.referrer_author_id),
      attributionId: asString(row.attribution_id),
      expiresAt: asString(row.expires_at),
    };
  } catch (error) {
    logPartnerAttribution({
      event: "partner_attribution_touch_failed",
      error: error instanceof Error ? error.message : "unknown",
    });
    return { ok: false, error: "touch_failed", setCookie: false };
  }
}

/**
 * Bind pending cookie attribution to the authenticated user.
 * Fail-safe: callers must not break signup/sign-in on error.
 */
export async function claimPartnerAttribution(input: {
  token: string | null | undefined;
  inviteeUserId: string;
  source: "signup" | "signin" | "invite";
}): Promise<PartnerClaimResult> {
  if (!isPartnerAttributionTokenShape(input.token)) {
    return { ok: false, error: "no_token" };
  }

  try {
    const supabase = createServiceRoleClient();
    const { data, error } = await supabase.rpc("author_partner_claim_attribution", {
      p_token_hash: hashPartnerAttributionToken(input.token!),
      p_invitee_user_id: input.inviteeUserId,
    });

    if (error) {
      logPartnerAttribution({
        event: "partner_attribution_claim_failed",
        error: error.message,
        hasToken: true,
      });
      return { ok: false, error: "claim_failed" };
    }

    const row = asRecord(data);
    if (!row || row.ok !== true) {
      const err = asString(row?.error) ?? "claim_failed";
      if (err === "self_referral") {
        logPartnerAttribution({
          event: "partner_attribution_rejected_self_referral",
          error: err,
        });
      } else if (err === "attribution_expired") {
        logPartnerAttribution({
          event: "partner_attribution_expired",
          error: err,
        });
      } else if (err === "already_author" || asString(row?.result) === "already_author") {
        logPartnerAttribution({
          event: "partner_attribution_rejected_existing_author",
          error: err,
        });
      } else {
        logPartnerAttribution({
          event: "partner_attribution_claim_failed",
          error: err,
        });
      }
      return { ok: false, error: err };
    }

    const result = asString(row.result) ?? "bound";
    const event =
      input.source === "signup"
        ? "partner_attribution_bound_signup"
        : input.source === "signin"
          ? "partner_attribution_bound_signin"
          : "partner_attribution_bound_invite_authenticated";

    if (result === "already_author") {
      logPartnerAttribution({
        event: "partner_attribution_rejected_existing_author",
        result,
      });
      return { ok: true, result };
    }

    if (result === "preserved_first_touch") {
      logPartnerAttribution({
        event: "partner_attribution_preserved_first_touch",
        result,
        referralId: asString(row.referral_id),
      });
    } else {
      logPartnerAttribution({
        event,
        result,
        referralId: asString(row.referral_id),
        referrerAuthorId: asString(row.referrer_author_id),
      });
    }

    return {
      ok: true,
      result,
      referralId: asString(row.referral_id),
      referrerAuthorId: asString(row.referrer_author_id),
      code: asString(row.code),
    };
  } catch (error) {
    logPartnerAttribution({
      event: "partner_attribution_claim_failed",
      error: error instanceof Error ? error.message : "unknown",
    });
    return { ok: false, error: "claim_failed" };
  }
}

export async function bindManualPartnerCode(input: {
  code: string;
  inviteeUserId: string;
}): Promise<PartnerClaimResult> {
  const code = input.code.trim();
  if (!code) {
    return { ok: false, error: "empty" };
  }

  try {
    const supabase = createServiceRoleClient();
    const { data, error } = await supabase.rpc("author_partner_bind_manual_code", {
      p_code: code,
      p_invitee_user_id: input.inviteeUserId,
    });

    if (error) {
      logPartnerAttribution({
        event: "partner_attribution_claim_failed",
        error: error.message,
      });
      return { ok: false, error: "claim_failed" };
    }

    const row = asRecord(data);
    if (!row || row.ok !== true) {
      const err = asString(row?.error) ?? "not_found";
      if (err === "self_referral") {
        logPartnerAttribution({
          event: "partner_attribution_rejected_self_referral",
          error: err,
        });
      } else {
        logPartnerAttribution({
          event: "partner_attribution_rejected_not_found",
          error: err,
        });
      }
      return { ok: false, error: err };
    }

    const result = asString(row.result) ?? "bound";
    if (result === "preserved_first_touch") {
      logPartnerAttribution({
        event: "partner_attribution_preserved_first_touch",
        result,
        referralId: asString(row.referral_id),
      });
    } else if (result === "already_author") {
      logPartnerAttribution({
        event: "partner_attribution_rejected_existing_author",
        result,
      });
    } else {
      logPartnerAttribution({
        event: "partner_attribution_bound_manual",
        result,
        referralId: asString(row.referral_id),
        referrerAuthorId: asString(row.referrer_author_id),
      });
    }

    return {
      ok: true,
      result,
      referralId: asString(row.referral_id),
      referrerAuthorId: asString(row.referrer_author_id),
      code: asString(row.code),
    };
  } catch (error) {
    logPartnerAttribution({
      event: "partner_attribution_claim_failed",
      error: error instanceof Error ? error.message : "unknown",
    });
    return { ok: false, error: "claim_failed" };
  }
}

export async function getInviteePartnerAttribution(inviteeUserId: string): Promise<{
  exists: boolean;
  code?: string;
  status?: string;
  expired?: boolean;
}> {
  try {
    const supabase = createServiceRoleClient();
    const { data, error } = await supabase.rpc(
      "author_partner_get_invitee_attribution",
      { p_invitee_user_id: inviteeUserId },
    );
    if (error) {
      return { exists: false };
    }
    const row = asRecord(data);
    if (!row || row.ok !== true) {
      return { exists: false };
    }
    return {
      exists: row.exists === true,
      code: asString(row.code),
      status: asString(row.status),
      expired: row.expired === true,
    };
  } catch {
    return { exists: false };
  }
}
