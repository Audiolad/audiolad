import type { SupabaseClient } from "@supabase/supabase-js";

import type { AuthorCommercialApplicationFormValues } from "./types";
import { mapCommercialApplicationRpcError } from "./validation";

export type CommercialApplicationRpcResult = {
  ok: boolean;
  idempotent?: boolean;
  application_id?: string;
  author_id?: string;
  status?: string;
  access_status?: string;
};

export function parseCommercialApplicationRpcResult(
  data: unknown,
): CommercialApplicationRpcResult | null {
  if (!data || typeof data !== "object") {
    return null;
  }

  const row = data as Record<string, unknown>;

  if (row.ok !== true) {
    return null;
  }

  return {
    ok: true,
    idempotent: row.idempotent === true,
    application_id:
      typeof row.application_id === "string" ? row.application_id : undefined,
    author_id: typeof row.author_id === "string" ? row.author_id : undefined,
    status: typeof row.status === "string" ? row.status : undefined,
    access_status:
      typeof row.access_status === "string" ? row.access_status : undefined,
  };
}

export async function callCommercialApplicationRpc(
  supabase: SupabaseClient,
  functionName: string,
  args: Record<string, unknown>,
): Promise<
  | { ok: true; result: CommercialApplicationRpcResult }
  | { ok: false; error: string }
> {
  const { data, error } = await supabase.rpc(functionName, args);

  if (error) {
    console.error(`commercial_application_${functionName}_error`, error.message);
    return {
      ok: false,
      error: mapCommercialApplicationRpcError(error.message),
    };
  }

  const parsed = parseCommercialApplicationRpcResult(data);

  if (!parsed) {
    return { ok: false, error: "Не удалось выполнить действие." };
  }

  return { ok: true, result: parsed };
}

function toRpcArgs(
  authorId: string,
  values: AuthorCommercialApplicationFormValues,
) {
  return {
    p_author_id: authorId,
    p_planned_products: values.plannedProducts,
    p_topics: values.topics,
    p_format_plan: values.formatPlan,
    p_rights_confirmation: values.rightsConfirmation,
    p_team_comment: values.teamComment || null,
  };
}

/**
 * Persist a draft. `authorId` must already be membership-checked by the caller.
 */
export async function saveAuthorCommercialApplicationDraft(
  supabase: SupabaseClient,
  authorId: string,
  values: AuthorCommercialApplicationFormValues,
) {
  return callCommercialApplicationRpc(
    supabase,
    "save_author_commercial_application_draft",
    toRpcArgs(authorId, values),
  );
}

/**
 * Submit an application. `authorId` must already be membership-checked by the caller.
 */
export async function submitAuthorCommercialApplication(
  supabase: SupabaseClient,
  authorId: string,
  values: AuthorCommercialApplicationFormValues,
) {
  return callCommercialApplicationRpc(
    supabase,
    "submit_author_commercial_application",
    toRpcArgs(authorId, values),
  );
}
