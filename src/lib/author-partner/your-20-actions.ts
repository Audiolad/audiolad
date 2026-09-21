"use server";

import { peekAuthorExecutionContext } from "@/lib/author-support/context";
import {
  AuthorAccessError,
  requireAuthorMembership,
} from "@/lib/author-products/auth";
import { createClient } from "@/lib/supabase/server";
import {
  canAccessAuthorPartnerYour20Ui,
  isAuthorPartnerUiBetaEnabled,
} from "@/lib/author-partner/ui-beta";
import {
  parsePartnerRpcErrorCode,
  partnerCodeUserMessage,
  type PartnerCodeUserErrorCode,
} from "@/lib/author-partner/rpc-user-messages";
import {
  parseAuthorPartnerProfilePayload,
  type AuthorPartnerProfileView,
} from "@/lib/author-partner/profile-types";

export type PartnerYour20ActionResult =
  | {
      ok: true;
      profile: AuthorPartnerProfileView;
      previousCodeKeptAsAlias?: boolean;
    }
  | {
      ok: false;
      code: PartnerCodeUserErrorCode;
      message: string;
    };

async function assertPartnerYour20MutationAccess(
  authorId: string,
): Promise<PartnerYour20ActionResult | { ok: true; role: string }> {
  const execution = await peekAuthorExecutionContext();
  if (execution?.isSupportMode) {
    return {
      ok: false,
      code: "support_mode_blocked",
      message: partnerCodeUserMessage("support_mode_blocked"),
    };
  }

  if (!isAuthorPartnerUiBetaEnabled({ authorId })) {
    return {
      ok: false,
      code: "beta_disabled",
      message: partnerCodeUserMessage("beta_disabled"),
    };
  }

  let role: string;
  try {
    const membership = await requireAuthorMembership(authorId);
    role = membership.role;
  } catch (error) {
    if (error instanceof AuthorAccessError) {
      return {
        ok: false,
        code: "forbidden",
        message: partnerCodeUserMessage("forbidden"),
      };
    }
    throw error;
  }

  if (
    !canAccessAuthorPartnerYour20Ui({
      authorId,
      role,
      isSupportMode: false,
    })
  ) {
    return {
      ok: false,
      code: "forbidden",
      message: partnerCodeUserMessage("forbidden"),
    };
  }

  return { ok: true, role };
}

export async function loadAuthorPartnerProfileAction(
  authorId: string,
): Promise<PartnerYour20ActionResult> {
  const gate = await assertPartnerYour20MutationAccess(authorId);
  if (!gate.ok) return gate;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_author_partner_profile", {
    p_author_id: authorId,
  });

  if (error) {
    const code = parsePartnerRpcErrorCode(error);
    return { ok: false, code, message: partnerCodeUserMessage(code) };
  }

  return {
    ok: true,
    profile: parseAuthorPartnerProfilePayload(data, authorId),
  };
}

export async function ensureAuthorPartnerProfileAction(
  authorId: string,
): Promise<PartnerYour20ActionResult> {
  const gate = await assertPartnerYour20MutationAccess(authorId);
  if (!gate.ok) return gate;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("ensure_author_partner_profile", {
    p_author_id: authorId,
  });

  if (error) {
    const code = parsePartnerRpcErrorCode(error);
    return { ok: false, code, message: partnerCodeUserMessage(code) };
  }

  const reload = await supabase.rpc("get_author_partner_profile", {
    p_author_id: authorId,
  });
  if (reload.error) {
    const row = (data ?? {}) as Record<string, unknown>;
    if (typeof row.primary_code === "string") {
      return {
        ok: true,
        profile: {
          exists: true,
          authorId,
          primaryCode: row.primary_code,
          status: typeof row.status === "string" ? row.status : "active",
          aliases: [],
        },
      };
    }
    const code = parsePartnerRpcErrorCode(reload.error);
    return { ok: false, code, message: partnerCodeUserMessage(code) };
  }

  return {
    ok: true,
    profile: parseAuthorPartnerProfilePayload(reload.data, authorId),
  };
}

export async function changeAuthorPartnerCodeAction(
  authorId: string,
  newCode: string,
): Promise<PartnerYour20ActionResult> {
  const gate = await assertPartnerYour20MutationAccess(authorId);
  if (!gate.ok) return gate;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("change_author_partner_code", {
    p_author_id: authorId,
    p_new_code: newCode,
  });

  if (error) {
    const code = parsePartnerRpcErrorCode(error);
    return { ok: false, code, message: partnerCodeUserMessage(code) };
  }

  const row = (data ?? {}) as Record<string, unknown>;
  const previousKept = row.previous_code_is_alias === true;

  const reload = await supabase.rpc("get_author_partner_profile", {
    p_author_id: authorId,
  });
  if (reload.error) {
    if (typeof row.primary_code === "string") {
      return {
        ok: true,
        previousCodeKeptAsAlias: previousKept,
        profile: {
          exists: true,
          authorId,
          primaryCode: row.primary_code,
          status: "active",
          aliases: [],
        },
      };
    }
    const code = parsePartnerRpcErrorCode(reload.error);
    return { ok: false, code, message: partnerCodeUserMessage(code) };
  }

  return {
    ok: true,
    previousCodeKeptAsAlias: previousKept,
    profile: parseAuthorPartnerProfilePayload(reload.data, authorId),
  };
}
