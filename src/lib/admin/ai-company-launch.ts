/**
 * «В работу» for /admin/ai-company.
 * One server operation in Company Core (POST /v1/tasks/{id}/launch, docs/launch-api.md): idempotent,
 * serialized, audited. The board button and Oriy/Core both end there. The browser never calls Core and
 * never switches a status locally: the row changes only when the next snapshot says so.
 */

import { COMPANY_ACTOR, isAcceptanceTaskId } from "@/lib/admin/ai-company-acceptance";

export const LAUNCH_UNAVAILABLE = "Запуск пока недоступен: нет связи с Company Core.";
export const LAUNCH_OWNER_ONLY = "Запускать задачи из плана может только владелец платформы. Запрос не отправлен.";

const IDEMPOTENCY_KEY = /^[A-Za-z0-9:._-]{8,115}$/;
const FORBIDDEN_BODY = ["actor", "verified_by", "decided_by", "accepted_by", "decided_at", "production_verified"] as const;

export type LaunchCommand = { taskId: string; idempotencyKey: string };

export type LaunchSuccess = {
  ok: true;
  taskId: string;
  state: string;
  admitted: boolean;
  idempotent: boolean;
  waitingReason: string | null;
  deliveryFailed: boolean;
  message: string;
};

export type LaunchFailure = { ok: false; code: string; message: string };
export type LaunchOutcome = LaunchSuccess | LaunchFailure;

function fail(code: string, message: string): LaunchFailure {
  return { ok: false, code, message };
}

export function launchCommandPath(taskId: string): string {
  if (!isAcceptanceTaskId(taskId)) throw new Error("invalid_task_id");
  return `/v1/tasks/${encodeURIComponent(taskId)}/launch`;
}

export function validateLaunchCommand(input: unknown): { ok: true; command: LaunchCommand } | LaunchFailure {
  const record = input && typeof input === "object" && !Array.isArray(input) ? (input as Record<string, unknown>) : null;
  if (!record) return fail("invalid_json", "Некорректный запрос.");
  if (FORBIDDEN_BODY.some((key) => key in record)) return fail("actor_in_body", "В запрос попало запрещённое поле. Запуск не отправлен.");
  const taskId = typeof record.taskId === "string" ? record.taskId.trim() : "";
  const idempotencyKey = typeof record.idempotencyKey === "string" ? record.idempotencyKey.trim() : "";
  if (!isAcceptanceTaskId(taskId)) return fail("invalid_task_id", "Некорректный идентификатор задачи.");
  if (!IDEMPOTENCY_KEY.test(idempotencyKey)) return fail("invalid_idempotency_key", "Некорректный ключ повтора.");
  return { ok: true, command: { taskId, idempotencyKey } };
}

const ERROR_TEXT: Record<string, string> = {
  unauthorized: "Нет доступа к Company Core.",
  actor_not_authenticated: "Сессия не подтверждена для запуска.",
  invalid_task_id: "Некорректный идентификатор задачи.",
  invalid_idempotency_key: "Некорректный ключ повтора.",
  actor_in_body: "В запрос попало запрещённое поле. Запуск не отправлен.",
  not_found: "Задача не найдена.",
  not_launchable: "Эту задачу нельзя запустить из текущего состояния. Обновите страницу.",
  historical_blocked_no_requeue: "Это историческая блокировка. Новый запуск по ней не выполняется.",
  internal_error: "Company Core не выполнил запуск.",
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

const WAIT_TEXT: Record<string, string> = {
  wip_active_full: "Все слоты исполнения заняты (лимит активных задач).",
  wip_heavy_full: "Тяжёлая задача уже в работе (лимит тяжёлых).",
};

export function interpretLaunchResponse(status: number, body: unknown, expectedTaskId?: string): LaunchOutcome {
  const record = asRecord(body);
  const rawCode = record?.code ?? record?.error;
  const code = typeof rawCode === "string" ? rawCode : "";
  if (status === 401 || code === "unauthorized") return fail("unauthorized", ERROR_TEXT.unauthorized);
  if (status === 403) return fail("actor_not_authenticated", ERROR_TEXT.actor_not_authenticated);
  if (status === 404) return fail("not_found", ERROR_TEXT.not_found);
  if (status === 500) return fail("internal_error", ERROR_TEXT.internal_error);
  if (status === 409 || status === 400) {
    return fail(code || "conflict", ERROR_TEXT[code] ?? "Запуск не выполнен. Строка остаётся на месте.");
  }
  const taskId = typeof record?.task_id === "string" ? record.task_id : "";
  if (status === 200 && isAcceptanceTaskId(taskId)) {
    if (expectedTaskId && taskId.toLowerCase() !== expectedTaskId.toLowerCase()) {
      return fail("response_mismatch", "Company Core ответил про другую задачу. Запуск не подтверждён.");
    }
    const state = typeof record?.state === "string" ? record.state : "";
    const admitted = record?.admitted === true;
    const idempotent = record?.idempotent === true;
    const waitingReason = typeof record?.waiting_reason === "string" ? record.waiting_reason : null;
    const delivery = asRecord(record?.delivery);
    const deliveryFailed = delivery != null && delivery.delivered === false;
    let message: string;
    if (deliveryFailed) {
      const label = typeof delivery?.label === "string" && delivery.label ? delivery.label : "причина не передана";
      message = `Допущена, но не отправлена Грогу: ${label}. Строка остаётся на месте. Нажмите ещё раз — это безопасный повтор.`;
    } else if (waitingReason) {
      message = `Ожидает: ${WAIT_TEXT[waitingReason] ?? "нет свободной мощности"} Запуск начнётся сам, по порядку.`;
    } else if (state === "sent" || admitted) {
      message = "Передана в мост Грога. Подтверждения исполнителя пока нет: это ещё не «выполнено».";
    } else if (idempotent) {
      message = "Эта задача уже запущена. Повторная отправка не создана.";
    } else {
      message = "Запрос принят. Состояние покажет следующий снимок.";
    }
    return { ok: true, taskId, state, admitted, idempotent, waitingReason, deliveryFailed, message };
  }
  return fail("rejected", "Company Core не подтвердил запуск.");
}

export async function postOwnerLaunch(input: {
  base: string;
  token: string;
  command: LaunchCommand;
  fetchImpl?: typeof fetch;
}): Promise<LaunchOutcome> {
  const fetchImpl = input.fetchImpl ?? fetch;
  try {
    const response = await fetchImpl(`${input.base.replace(/\/$/, "")}${launchCommandPath(input.command.taskId)}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.token}`,
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-Company-Actor": COMPANY_ACTOR,
      },
      body: JSON.stringify({ idempotency_key: input.command.idempotencyKey }),
      cache: "no-store",
      // Core delivers to Grok's bridge inside this call (10 s timeout there).
      signal: AbortSignal.timeout(20000),
    });
    const payload = await response.json().catch(() => null);
    return interpretLaunchResponse(response.status, payload, input.command.taskId);
  } catch {
    return fail("unavailable", LAUNCH_UNAVAILABLE);
  }
}

function httpStatusFor(code: string): number {
  switch (code) {
    case "unavailable":
      return 503;
    case "unauthorized":
      return 401;
    case "actor_not_authenticated":
      return 403;
    case "response_mismatch":
    case "rejected":
      return 502;
    case "not_found":
      return 404;
    case "internal_error":
      return 500;
    case "not_launchable":
    case "historical_blocked_no_requeue":
      return 409;
    default:
      return 400;
  }
}

export async function handleOwnerLaunchRequest(input: {
  body: unknown;
  base: string | null | undefined;
  token: string | null | undefined;
  actor: { userId: string; isOwner: boolean };
  fetchImpl?: typeof fetch;
}): Promise<{ status: number; body: Record<string, unknown> }> {
  if (!input.actor.isOwner) {
    return { status: 403, body: { ok: false, code: "owner_required", message: LAUNCH_OWNER_ONLY } };
  }
  const command = validateLaunchCommand(input.body);
  if (!command.ok) return { status: 400, body: { ok: false, code: command.code, message: command.message } };
  if (!input.base || !input.token) {
    return { status: 503, body: { ok: false, code: "unavailable", message: LAUNCH_UNAVAILABLE } };
  }
  const outcome = await postOwnerLaunch({
    base: input.base,
    token: input.token,
    command: command.command,
    fetchImpl: input.fetchImpl,
  });
  if (!outcome.ok) {
    return { status: httpStatusFor(outcome.code), body: { ok: false, code: outcome.code, message: outcome.message } };
  }
  return {
    status: 200,
    body: {
      ok: true,
      taskId: outcome.taskId,
      state: outcome.state,
      admitted: outcome.admitted,
      idempotent: outcome.idempotent,
      waitingReason: outcome.waitingReason,
      deliveryFailed: outcome.deliveryFailed,
      message: outcome.message,
    },
  };
}
