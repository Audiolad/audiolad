import type { SupabaseClient } from "@supabase/supabase-js";

export type AuthorApplicationRpcResult = {
  ok: boolean;
  idempotent?: boolean;
  application_id?: string;
  author_id?: string;
  author_slug?: string;
  status?: string;
  access_status?: string;
};

export function parseAuthorApplicationRpcResult(
  data: unknown,
): AuthorApplicationRpcResult | null {
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
    author_slug:
      typeof row.author_slug === "string" ? row.author_slug : undefined,
    status: typeof row.status === "string" ? row.status : undefined,
    access_status:
      typeof row.access_status === "string" ? row.access_status : undefined,
  };
}

export function mapAuthorApplicationRpcError(message: string): string {
  if (message.includes("forbidden")) {
    return "Недостаточно прав для этого действия.";
  }

  if (message.includes("application_not_found")) {
    return "Заявка не найдена.";
  }

  if (message.includes("application_not_approvable")) {
    return "Эту заявку нельзя одобрить в текущем статусе.";
  }

  if (message.includes("application_transition_not_allowed")) {
    return "Переход статуса недопустим.";
  }

  if (message.includes("applicant_comment_required")) {
    return "Укажите комментарий для заявителя.";
  }

  if (message.includes("reason_required")) {
    return "Укажите причину приостановки.";
  }

  if (message.includes("author_not_found")) {
    return "Авторское пространство не найдено.";
  }

  if (message.includes("author_access_transition_not_allowed")) {
    return "Изменение статуса доступа недопустимо.";
  }

  return "Не удалось выполнить действие.";
}

export async function callAuthorApplicationRpc(
  supabase: SupabaseClient,
  functionName: string,
  args: Record<string, unknown>,
): Promise<
  | { ok: true; result: AuthorApplicationRpcResult }
  | { ok: false; error: string }
> {
  const { data, error } = await supabase.rpc(functionName, args);

  if (error) {
    console.error(`admin_${functionName}_error`, error.message);
    return { ok: false, error: mapAuthorApplicationRpcError(error.message) };
  }

  const parsed = parseAuthorApplicationRpcResult(data);

  if (!parsed) {
    return { ok: false, error: "Не удалось выполнить действие." };
  }

  return { ok: true, result: parsed };
}
