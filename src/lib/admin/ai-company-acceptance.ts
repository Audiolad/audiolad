/**
 * Owner acceptance for /admin/ai-company.
 * Contract: Audiolad/company-core#28, docs/user-acceptance-api.md, head 16e1a3b2.
 * The browser never calls Company Core. Availability comes from GET /v1/status
 * fields (user_acceptance, presentation, result_version), not a capabilities route.
 */

import { copySafeProse } from "@/lib/admin/ai-company-task-copy";

export const ACCEPTANCE_UNAVAILABLE = "Приёмка пока недоступна.";
export const ACCEPTANCE_OWNER_ONLY = "Приёмку записывает только владелец платформы. Ваше решение не отправлено.";
export const COMPANY_ACTOR = "sergey";

/** Same task id rule as Company Core (TASK_ID_RE in src/user-acceptance.mjs): a UUID, never a path segment. */
const TASK_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RESULT_VERSION = /^[a-f0-9]{64}$/i;
const IDEMPOTENCY_KEY = /^[A-Za-z0-9:._-]{8,115}$/;
const SECRET_WORD = /token|secret|password|api[_-]?key|authorization|credential|bearer/i;
const ONE_WORD = /^(ok|yes|no|true|false|blocked|error|failed|stop|cancel|done)$/i;
const FORBIDDEN_BODY = ["actor", "verified_by", "decided_by", "accepted_by", "decided_at", "production_verified"] as const;

export type AcceptanceDecision = "accepted" | "rejected" | "reopen";

export type AcceptanceCommand = {
  taskId: string;
  decision: AcceptanceDecision;
  comment: string | null;
  resultVersion: string;
  idempotencyKey: string;
};

export type AcceptanceSuccess = {
  ok: true;
  taskId: string;
  decision: AcceptanceDecision;
  actor: string | null;
  at: string | null;
  resultVersion: string | null;
  idempotent: boolean;
  archive: boolean;
  message: string;
};

export type AcceptanceFailure = {
  ok: false;
  code: string;
  message: string;
  keepRow: true;
  resultVersion: string | null;
};

export type AcceptanceOutcome = AcceptanceSuccess | AcceptanceFailure;

export function isAcceptanceTaskId(value: unknown): value is string {
  return typeof value === "string" && TASK_ID.test(value);
}

export function acceptanceCommandPath(taskId: string): string {
  if (!TASK_ID.test(taskId)) throw new Error("invalid_task_id");
  return `/v1/tasks/${encodeURIComponent(taskId)}/acceptance`;
}

/**
 * Who may record an owner decision. Core records every decision as actor `sergey`
 * (X-Company-Actor), so Audiolad only forwards it for a session that holds the
 * existing platform `owner` role. `ai_company.view` alone (default `admin` bundle)
 * may look at the board but not decide as the owner. No new permission or role.
 */
export type AcceptanceSessionActor = {
  userId: string;
  isOwner: boolean;
};

export function safeResultVersion(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!RESULT_VERSION.test(trimmed)) return null;
  return trimmed.toLowerCase();
}

export function validateRejectionComment(value: string): string | null {
  const text = value.trim();
  if (ONE_WORD.test(text)) return "Замечание не может быть одним словом вроде ok, yes, no или done.";
  if (text.length < 8 || text.length > 500) return "Нужно замечание от 8 до 500 символов.";
  return null;
}

export function validateAcceptanceCommand(input: unknown): { ok: true; command: AcceptanceCommand } | AcceptanceFailure {
  const record = input && typeof input === "object" && !Array.isArray(input) ? (input as Record<string, unknown>) : null;
  if (!record) return fail("invalid_json", "Некорректный запрос.");
  if (FORBIDDEN_BODY.some((key) => key in record)) return fail("actor_in_body", "В запрос попало запрещённое поле. Решение не отправлено.");
  const taskId = typeof record.taskId === "string" ? record.taskId.trim() : "";
  const decision = record.decision;
  const idempotencyKey = typeof record.idempotencyKey === "string" ? record.idempotencyKey.trim() : "";
  if (!TASK_ID.test(taskId)) return fail("invalid_task_id", "Некорректный идентификатор задачи.");
  if (decision !== "accepted" && decision !== "rejected" && decision !== "reopen") {
    return fail("invalid_decision", "Некорректное решение.");
  }
  const resultVersion = safeResultVersion(record.resultVersion);
  if (!resultVersion) return fail("invalid_result_version", "Версия результата не подходит. Нужны 64 hex из снимка.");
  if (!IDEMPOTENCY_KEY.test(idempotencyKey) || SECRET_WORD.test(idempotencyKey)) {
    return fail("invalid_idempotency_key", "Некорректный ключ повтора.");
  }
  let comment: string | null = null;
  if (decision === "rejected") {
    if (typeof record.comment !== "string") return fail("comment_required", "Нужно замечание от 8 до 500 символов.");
    const problem = validateRejectionComment(record.comment);
    if (problem) return fail(record.comment.trim() ? "invalid_comment" : "comment_required", problem);
    comment = copySafeProse(record.comment.trim());
    if (validateRejectionComment(comment)) return fail("invalid_comment", "Замечание не подходит: нужно 8–500 символов и не одно слово вроде ok или done.");
  } else if (typeof record.comment === "string" && record.comment.trim()) {
    const text = copySafeProse(record.comment.trim()).slice(0, 500);
    comment = text || null;
  }
  return { ok: true, command: { taskId, decision, comment, resultVersion, idempotencyKey } };
}

export function coreAcceptanceBody(command: AcceptanceCommand): Record<string, string> {
  const body: Record<string, string> = {
    decision: command.decision,
    expected_result_version: command.resultVersion,
    idempotency_key: command.idempotencyKey,
  };
  if (command.comment) body.comment = command.comment;
  return body;
}

export function sameAcceptanceReplay(left: AcceptanceCommand, right: AcceptanceCommand): boolean {
  return (
    left.idempotencyKey === right.idempotencyKey &&
    left.taskId === right.taskId &&
    left.decision === right.decision &&
    left.resultVersion === right.resultVersion &&
    left.comment === right.comment
  );
}

function fail(code: string, message: string, resultVersion: string | null = null): AcceptanceFailure {
  return { ok: false, code, message, keepRow: true, resultVersion };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function readCode(record: Record<string, unknown> | null): string {
  const code = record?.code ?? record?.error;
  return typeof code === "string" ? code : "";
}

function isoOrNull(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  if (Number.isNaN(Date.parse(value))) return null;
  return value.trim();
}

const ERROR_TEXT: Record<string, string> = {
  unauthorized: "Нет доступа к Company Core.",
  actor_not_authenticated: "Сессия не подтверждена для приёмки.",
  invalid_json: "Некорректный запрос.",
  actor_in_body: "В запрос попало запрещённое поле. Решение не отправлено.",
  invalid_task_id: "Некорректный идентификатор задачи.",
  invalid_decision: "Некорректное решение.",
  invalid_result_version: "Версия результата не подходит.",
  invalid_idempotency_key: "Некорректный ключ повтора.",
  comment_required: "Нужно замечание от 8 до 500 символов.",
  invalid_comment: "Замечание не подходит: нужно 8–500 символов и не одно слово вроде ok или done.",
  not_found: "Задача не найдена.",
  stale_result: "Версия результата устарела. Обновите страницу и проверьте актуальный результат.",
  idempotency_conflict: "Этот повтор уже использован с другим решением. Обновите страницу.",
  not_archived: "Вернуть можно только принятую задачу.",
  gate_open: "Сначала нужно закрыть открытое решение. Приёмка его не заменяет.",
  result_not_presented: "Результат ещё не предъявлен.",
  historical_blocked: "Это историческая блокировка. Новое решение по ней не записывается.",
  task_closed: "Задача закрыта для этой приёмки.",
  payload_too_large: "Запрос слишком большой.",
  internal_error: "Company Core не сохранил решение.",
  owner_required: ACCEPTANCE_OWNER_ONLY,
};

export function interpretAcceptanceResponse(
  status: number,
  body: unknown,
  expected?: { taskId: string; decision: AcceptanceDecision },
): AcceptanceOutcome {
  const record = asRecord(body);
  const code = readCode(record);
  const currentVersion = safeResultVersion(record?.result_version);
  if (status === 401 || code === "unauthorized") return fail("unauthorized", ERROR_TEXT.unauthorized);
  if (status === 403 || code === "actor_not_authenticated") return fail("actor_not_authenticated", ERROR_TEXT.actor_not_authenticated);
  if (status === 413 || code === "payload_too_large") return fail("payload_too_large", ERROR_TEXT.payload_too_large);
  if (status === 404 || code === "not_found") return fail("not_found", ERROR_TEXT.not_found);
  if (status === 500 || code === "internal_error") return fail("internal_error", ERROR_TEXT.internal_error);
  if (code === "stale_result" || (status === 409 && code === "stale_result")) {
    const extra = currentVersion ? ` Актуальная версия: ${currentVersion}.` : "";
    return fail("stale_result", `${ERROR_TEXT.stale_result}${extra}`, currentVersion);
  }
  if (status === 409 || status === 400) {
    const known = ERROR_TEXT[code];
    return fail(code || (status === 409 ? "conflict" : "invalid"), known ?? "Решение не сохранено. Строка остаётся на месте.");
  }
  const decision = record?.decision;
  const taskId = typeof record?.task_id === "string" ? record.task_id : "";
  if (
    status === 200 &&
    TASK_ID.test(taskId) &&
    (decision === "accepted" || decision === "rejected" || decision === "reopen")
  ) {
    if (expected && (taskId.toLowerCase() !== expected.taskId.toLowerCase() || decision !== expected.decision)) {
      return fail("response_mismatch", "Company Core ответил про другую задачу или другое решение. Сохранение не подтверждено.");
    }
    const message =
      decision === "accepted"
        ? "Решение сохранено. Строка уйдёт в «Архив / Принятые», когда снимок покажет user_acceptance=accepted."
        : decision === "rejected"
          ? "Замечание сохранено. Доработка останется в текущем списке, когда снимок покажет отказ."
          : "Возврат сохранён. Задача снова в текущем списке, когда снимок это подтвердит.";
    return {
      ok: true,
      taskId,
      decision,
      actor: typeof record?.actor === "string" && record.actor.trim() ? record.actor.trim() : null,
      at: isoOrNull(record?.decided_at),
      resultVersion: safeResultVersion(record?.result_version),
      idempotent: record?.idempotent === true,
      archive: record?.archive === true,
      message,
    };
  }
  return fail("rejected", "Company Core не подтвердил сохранение решения.");
}

export function createAcceptanceGate() {
  let inflight: Promise<unknown> | null = null;
  return {
    get busy() {
      return inflight != null;
    },
    run<T>(send: () => Promise<T>): Promise<T> {
      if (inflight) return inflight as Promise<T>;
      const promise = send().finally(() => {
        inflight = null;
      });
      inflight = promise;
      return promise;
    },
  };
}

export async function postOwnerAcceptance(input: {
  base: string;
  token: string;
  command: AcceptanceCommand;
  fetchImpl?: typeof fetch;
}): Promise<AcceptanceOutcome> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const body = coreAcceptanceBody(input.command);
  try {
    const response = await fetchImpl(`${input.base.replace(/\/$/, "")}${acceptanceCommandPath(input.command.taskId)}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.token}`,
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-Company-Actor": COMPANY_ACTOR,
      },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    const payload = await response.json().catch(() => null);
    return interpretAcceptanceResponse(response.status, payload, {
      taskId: input.command.taskId,
      decision: input.command.decision,
    });
  } catch {
    return fail("unavailable", ACCEPTANCE_UNAVAILABLE);
  }
}

export async function handleOwnerAcceptanceRequest(input: {
  body: unknown;
  base: string | null | undefined;
  token: string | null | undefined;
  actor: AcceptanceSessionActor;
  fetchImpl?: typeof fetch;
}): Promise<{ status: number; body: Record<string, unknown> }> {
  if (!input.actor.isOwner) {
    return { status: 403, body: { ok: false, code: "owner_required", message: ACCEPTANCE_OWNER_ONLY, keepRow: true } };
  }
  const command = validateAcceptanceCommand(input.body);
  if (!command.ok) {
    return {
      status: 400,
      body: { ok: false, code: command.code, message: command.message, keepRow: true, resultVersion: command.resultVersion },
    };
  }
  if (!input.base || !input.token) {
    return { status: 503, body: { ok: false, code: "unavailable", message: ACCEPTANCE_UNAVAILABLE, keepRow: true } };
  }
  const outcome = await postOwnerAcceptance({
    base: input.base,
    token: input.token,
    command: command.command,
    fetchImpl: input.fetchImpl,
  });
  if (!outcome.ok) {
    const status =
      outcome.code === "unavailable"
        ? 503
        : outcome.code === "unauthorized"
          ? 401
          : outcome.code === "actor_not_authenticated"
            ? 403
            : outcome.code === "response_mismatch" || outcome.code === "rejected"
              ? 502
              : outcome.code === "not_found"
              ? 404
              : outcome.code === "payload_too_large"
                ? 413
                : outcome.code === "internal_error"
                  ? 500
                  : outcome.code === "stale_result" ||
                      outcome.code === "idempotency_conflict" ||
                      outcome.code === "not_archived" ||
                      outcome.code === "gate_open" ||
                      outcome.code === "result_not_presented" ||
                      outcome.code === "historical_blocked" ||
                      outcome.code === "task_closed"
                    ? 409
                    : 400;
    return {
      status,
      body: { ok: false, code: outcome.code, message: outcome.message, keepRow: true, resultVersion: outcome.resultVersion },
    };
  }
  return {
    status: 200,
    body: {
      ok: true,
      taskId: outcome.taskId,
      decision: outcome.decision,
      actor: outcome.actor,
      at: outcome.at,
      resultVersion: outcome.resultVersion,
      idempotent: outcome.idempotent,
      archive: outcome.archive,
      message: outcome.message,
      keepRow: false,
    },
  };
}
