/**
 * Owner acceptance adapter for /admin/ai-company.
 * Company Core owns the stored decision. This module does not invent
 * actor, time, or success when the Core endpoint is missing.
 *
 * Expected Core contract (not confirmed in this repo; feature-detected):
 * GET  /v1/acceptance/capabilities
 *   200 { "accept": true, "reject": true, "reopen": true }
 *   anything else → приёмка пока недоступна
 * POST /v1/tasks/{task_id}/acceptance
 *   headers: Authorization Bearer (server token), Idempotency-Key, X-Audiolad-Actor-Id
 *   body: { action: "accept"|"reject"|"reopen", comment, result_version, result_sha, expected_result_version }
 *   200 { ok: true, task_id, state, actor, at, result_version, result_sha }
 *   409 { ok: false, code: "stale_result_version"|"conflict" }
 *   404/501/503 → недоступна
 * Same Idempotency-Key returns the same stored decision. Health JSON is not a decision.
 */

import { copySafeProse } from "@/lib/admin/ai-company-task-copy";

export const ACCEPTANCE_CAPABILITIES_PATH = "/v1/acceptance/capabilities";
export const ACCEPTANCE_UNAVAILABLE = "Приёмка пока недоступна.";

const TASK_ID = /^[A-Za-z0-9_.:-]{1,120}$/;
const VERSION = /^[A-Za-z0-9_.:-]{1,80}$/;
const SHA = /^[a-f0-9]{7,64}$/i;
const IDEMPOTENCY_KEY = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SECRET_WORD = /token|secret|password|api[_-]?key|authorization|credential|bearer/i;

export type AcceptanceAction = "accept" | "reject" | "reopen";

export type AcceptanceCommand = {
  taskId: string;
  action: AcceptanceAction;
  comment: string | null;
  resultVersion: string | null;
  resultSha: string | null;
  idempotencyKey: string;
};

export type AcceptanceSuccess = {
  ok: true;
  taskId: string;
  state: "pending" | "accepted" | "returned";
  actor: string | null;
  at: string | null;
  resultVersion: string | null;
  resultSha: string | null;
  message: string;
};

export type AcceptanceFailure = {
  ok: false;
  code: "unavailable" | "stale_result_version" | "conflict" | "invalid" | "rejected";
  message: string;
  keepRow: true;
};

export type AcceptanceOutcome = AcceptanceSuccess | AcceptanceFailure;

export function acceptanceCommandPath(taskId: string): string {
  return `/v1/tasks/${encodeURIComponent(taskId)}/acceptance`;
}

export function safeAcceptanceVersion(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!VERSION.test(trimmed) || SECRET_WORD.test(trimmed)) return null;
  return trimmed;
}

export function safeAcceptanceSha(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!SHA.test(trimmed)) return null;
  return trimmed;
}

function safeComment(value: unknown, required: boolean): string | null | undefined {
  if (value == null || value === "") return required ? undefined : null;
  if (typeof value !== "string") return undefined;
  const text = copySafeProse(value).slice(0, 500).trim();
  if (!text) return required ? undefined : null;
  return text;
}

export function validateAcceptanceCommand(input: unknown): { ok: true; command: AcceptanceCommand } | AcceptanceFailure {
  const record = input && typeof input === "object" ? (input as Record<string, unknown>) : null;
  const taskId = typeof record?.taskId === "string" ? record.taskId.trim() : "";
  const action = record?.action;
  const idempotencyKey = typeof record?.idempotencyKey === "string" ? record.idempotencyKey.trim() : "";
  if (!TASK_ID.test(taskId) || SECRET_WORD.test(taskId)) {
    return { ok: false, code: "invalid", message: "Некорректный идентификатор задачи.", keepRow: true };
  }
  if (action !== "accept" && action !== "reject" && action !== "reopen") {
    return { ok: false, code: "invalid", message: "Некорректное действие приёмки.", keepRow: true };
  }
  if (!IDEMPOTENCY_KEY.test(idempotencyKey)) {
    return { ok: false, code: "invalid", message: "Нет ключа идемпотентности.", keepRow: true };
  }
  const comment = safeComment(record?.comment, action === "reject");
  if (comment === undefined) {
    return {
      ok: false,
      code: "invalid",
      message: action === "reject" ? "Нужно короткое замечание." : "Комментарий не удалось прочитать.",
      keepRow: true,
    };
  }
  return {
    ok: true,
    command: {
      taskId,
      action,
      comment,
      resultVersion: safeAcceptanceVersion(typeof record?.resultVersion === "string" ? record.resultVersion : null),
      resultSha: safeAcceptanceSha(typeof record?.resultSha === "string" ? record.resultSha : null),
      idempotencyKey,
    },
  };
}

export function sameAcceptanceReplay(left: AcceptanceCommand, right: AcceptanceCommand): boolean {
  return left.idempotencyKey === right.idempotencyKey && left.taskId === right.taskId && left.action === right.action;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function isoOrNull(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const at = Date.parse(value);
  if (Number.isNaN(at)) return null;
  return value.trim();
}

export function interpretAcceptanceResponse(status: number, body: unknown): AcceptanceOutcome {
  if (status === 404 || status === 501 || status === 503) {
    return { ok: false, code: "unavailable", message: ACCEPTANCE_UNAVAILABLE, keepRow: true };
  }
  const record = asRecord(body);
  const code = typeof record?.code === "string" ? record.code : "";
  if (status === 409 && (code === "stale_result_version" || code === "conflict")) {
    return {
      ok: false,
      code: code === "stale_result_version" ? "stale_result_version" : "conflict",
      message:
        code === "stale_result_version"
          ? "Версия результата устарела. Обновите страницу и проверьте актуальный результат."
          : "Решение уже изменилось. Обновите страницу.",
      keepRow: true,
    };
  }
  const state = record?.state;
  const taskId = typeof record?.task_id === "string" ? record.task_id : "";
  if (
    status === 200 &&
    record?.ok === true &&
    TASK_ID.test(taskId) &&
    (state === "pending" || state === "accepted" || state === "returned")
  ) {
    const actionMessage =
      state === "accepted"
        ? "Решение сохранено. Строка уйдёт в «Архив / Принятые», когда снимок подтвердит приёмку."
        : state === "returned"
          ? "Замечание сохранено. Доработка вернётся в текущий список, когда снимок подтвердит возврат."
          : "Возврат сохранён. Задача снова в текущем списке, когда снимок подтвердит это.";
    return {
      ok: true,
      taskId,
      state,
      actor: typeof record.actor === "string" && record.actor.trim() ? record.actor.trim() : null,
      at: isoOrNull(record.at),
      resultVersion: safeAcceptanceVersion(typeof record.result_version === "string" ? record.result_version : null),
      resultSha: safeAcceptanceSha(typeof record.result_sha === "string" ? record.result_sha : null),
      message: actionMessage,
    };
  }
  return { ok: false, code: "rejected", message: "Company Core не подтвердил сохранение решения.", keepRow: true };
}

export function acceptanceCapabilityEnabled(body: unknown): boolean {
  const record = asRecord(body);
  return record?.accept === true && record?.reject === true && record?.reopen === true;
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

export async function probeOwnerAcceptanceAvailability(input: {
  base: string | null | undefined;
  token: string | null | undefined;
  fetchImpl?: typeof fetch;
}): Promise<boolean> {
  if (!input.base || !input.token) return false;
  const fetchImpl = input.fetchImpl ?? fetch;
  try {
    const response = await fetchImpl(`${input.base.replace(/\/$/, "")}${ACCEPTANCE_CAPABILITIES_PATH}`, {
      headers: { Authorization: `Bearer ${input.token}`, Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) return false;
    return acceptanceCapabilityEnabled(await response.json());
  } catch {
    return false;
  }
}

export async function handleOwnerAcceptanceRequest(input: {
  actorId: string;
  body: unknown;
  base: string | null | undefined;
  token: string | null | undefined;
  fetchImpl?: typeof fetch;
}): Promise<{ status: number; body: Record<string, unknown> }> {
  const command = validateAcceptanceCommand(input.body);
  if (!command.ok) {
    return { status: 400, body: { ok: false, code: command.code, message: command.message, keepRow: true } };
  }
  const available = await probeOwnerAcceptanceAvailability({
    base: input.base,
    token: input.token,
    fetchImpl: input.fetchImpl,
  });
  if (!input.base || !input.token || !available) {
    return { status: 503, body: { ok: false, code: "unavailable", message: ACCEPTANCE_UNAVAILABLE, keepRow: true } };
  }
  const outcome = await postOwnerAcceptance({
    base: input.base,
    token: input.token,
    actorId: input.actorId,
    command: command.command,
    fetchImpl: input.fetchImpl,
  });
  if (!outcome.ok) {
    const status = outcome.code === "unavailable" ? 503 : outcome.code === "stale_result_version" || outcome.code === "conflict" ? 409 : 502;
    return { status, body: { ok: false, code: outcome.code, message: outcome.message, keepRow: true } };
  }
  return {
    status: 200,
    body: {
      ok: true,
      taskId: outcome.taskId,
      state: outcome.state,
      actor: outcome.actor,
      at: outcome.at,
      resultVersion: outcome.resultVersion,
      resultSha: outcome.resultSha,
      message: outcome.message,
      keepRow: false,
    },
  };
}

export async function postOwnerAcceptance(input: {
  base: string;
  token: string;
  actorId: string;
  command: AcceptanceCommand;
  fetchImpl?: typeof fetch;
}): Promise<AcceptanceOutcome> {
  const fetchImpl = input.fetchImpl ?? fetch;
  try {
    const response = await fetchImpl(`${input.base.replace(/\/$/, "")}${acceptanceCommandPath(input.command.taskId)}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.token}`,
        Accept: "application/json",
        "Content-Type": "application/json",
        "Idempotency-Key": input.command.idempotencyKey,
        "X-Audiolad-Actor-Id": input.actorId,
      },
      body: JSON.stringify({
        action: input.command.action,
        comment: input.command.comment,
        result_version: input.command.resultVersion,
        result_sha: input.command.resultSha,
        expected_result_version: input.command.resultVersion,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    const body = await response.json().catch(() => null);
    return interpretAcceptanceResponse(response.status, body);
  } catch {
    return { ok: false, code: "unavailable", message: ACCEPTANCE_UNAVAILABLE, keepRow: true };
  }
}
