/**
 * Owner lifecycle buttons for /admin/ai-company: «Отложить в план», «Снять задачу», «Завершить с доказательствами»,
 * «Остановить». One server proxy to Company Core POST /v1/tasks/{id}/{defer|cancel|complete|stop}
 * (company-core docs/lifecycle-api.md). Same pattern as «В работу» and «Принять»: owner session only, the Core token
 * stays on the server, actor is always `sergey` in the header, never in the body. Core decides what is allowed
 * (allowed_actions) and re-checks it under a row lock; the browser never changes a status locally.
 */

import { COMPANY_ACTOR, isAcceptanceTaskId } from "@/lib/admin/ai-company-acceptance";
import { LIFECYCLE_ACTIONS, type LifecycleAction } from "@/lib/admin/ai-company-dashboard";

export const LIFECYCLE_UNAVAILABLE = "Действие пока недоступно: нет связи с Company Core.";
export const LIFECYCLE_OWNER_ONLY = "Менять состояние задач может только владелец платформы. Запрос не отправлен.";

export const LIFECYCLE_LABELS: Record<LifecycleAction, string> = {
  defer: "Отложить в план",
  cancel: "Снять задачу",
  complete: "Завершить с доказательствами",
  stop: "Остановить",
};

export const EVIDENCE_TYPES = ["code_delivery", "document", "core_record", "external_confirmation"] as const;
export type EvidenceType = (typeof EVIDENCE_TYPES)[number];
export const EVIDENCE_TYPE_LABELS: Record<EvidenceType, string> = {
  code_delivery: "Код в проде (PR + merge + deploy)",
  document: "Документ или отчёт (ссылка)",
  core_record: "Запись Core (решение, артефакт, событие)",
  external_confirmation: "Внешнее подтверждение",
};
export const EVIDENCE_REFERENCE_HINT: Record<EvidenceType, string> = {
  code_delivery: "Ссылка на PR GitHub",
  document: "https-ссылка на документ",
  core_record: "UUID записи Core",
  external_confirmation: "Номер сообщения, проверка в БД и т.п.",
};

const IDEMPOTENCY_KEY = /^[A-Za-z0-9:._-]{8,115}$/;
const STATUS_TOKEN = /^[a-z_]{2,40}$/;
const SHA = /^[0-9a-f]{7,40}$/i;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FORBIDDEN_BODY = ["actor", "verified_by", "decided_by", "accepted_by", "decided_at", "production_verified"] as const;
const EMPTY_REASONS = new Set(["stop", "cancel", "снять", "отмена", "стоп", "отменить", "снять задачу"]);

export type EvidenceItem = {
  type: EvidenceType;
  reference: string;
  description: string;
  merge_sha?: string;
  deploy_sha?: string;
  source?: string;
};

export type LifecycleCommand = {
  taskId: string;
  action: LifecycleAction;
  expectedStatus: string;
  idempotencyKey: string;
  reason: string | null;
  after: "defer" | "cancel" | null;
  evidence: EvidenceItem[] | null;
};

export type LifecycleFailure = { ok: false; code: string; message: string };
export type LifecycleSuccess = { ok: true; taskId: string; action: LifecycleAction; toStatus: string; idempotent: boolean; message: string };
export type LifecycleOutcome = LifecycleSuccess | LifecycleFailure;

function fail(code: string, message: string): LifecycleFailure {
  return { ok: false, code, message };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export function lifecycleCommandPath(taskId: string, action: LifecycleAction): string {
  if (!isAcceptanceTaskId(taskId)) throw new Error("invalid_task_id");
  if (!LIFECYCLE_ACTIONS.includes(action)) throw new Error("invalid_action");
  return `/v1/tasks/${encodeURIComponent(taskId)}/${action}`;
}

/** A reason Core will accept: at least 8 characters and not just «stop/снять». Shared by the dialog and the proxy. */
export function validateReason(reason: string, required: boolean): string | null {
  const value = reason.trim();
  if (!value) return required ? "Укажите причину." : null;
  if (value.length < 8) return "Причина слишком короткая: напишите, почему (от 8 символов).";
  if (EMPTY_REASONS.has(value.toLowerCase())) return "Напишите настоящую причину, а не просто «снять».";
  return null;
}

/** One evidence item from the «Завершить» dialog. Returns an error text or the normalized item. */
export function validateEvidence(input: unknown): { ok: true; item: EvidenceItem } | LifecycleFailure {
  const record = asRecord(input);
  if (!record) return fail("invalid_evidence", "Добавьте доказательство.");
  const type = text(record.type, 40) as EvidenceType;
  if (!EVIDENCE_TYPES.includes(type)) return fail("invalid_evidence", "Выберите тип доказательства.");
  const reference = text(record.reference, 500);
  const description = text(record.description, 2000);
  if (!reference) return fail("invalid_evidence", "Укажите ссылку или идентификатор доказательства.");
  if (description.length < 10) return fail("invalid_evidence", "Опишите доказательство (от 10 символов).");
  const item: EvidenceItem = { type, reference, description };
  if (type === "code_delivery") {
    if (!/^https:\/\/github\.com\/[^/\s]+\/[^/\s]+\/pull\/\d+\/?$/.test(reference)) {
      return fail("invalid_evidence", "Для кода нужна ссылка на PR GitHub.");
    }
    const merge = text(record.merge_sha, 40);
    const deploy = text(record.deploy_sha, 40);
    if (!SHA.test(merge) || !SHA.test(deploy)) return fail("invalid_evidence", "Для кода укажите SHA слияния и SHA выкладки.");
    item.merge_sha = merge.toLowerCase();
    item.deploy_sha = deploy.toLowerCase();
  } else if (type === "document") {
    let url: URL | null = null;
    try {
      url = new URL(reference);
    } catch {
      url = null;
    }
    if (!url || url.protocol !== "https:" || url.username || url.password) return fail("invalid_evidence", "Для документа нужна https-ссылка.");
  } else if (type === "core_record") {
    if (!UUID.test(reference)) return fail("invalid_evidence", "Для записи Core нужен её UUID.");
  } else {
    const source = text(record.source, 60);
    if (!source) return fail("invalid_evidence", "Укажите источник подтверждения (telegram, email, db_check…).");
    item.source = source;
  }
  return { ok: true, item };
}

export function validateLifecycleCommand(input: unknown): { ok: true; command: LifecycleCommand } | LifecycleFailure {
  const record = asRecord(input);
  if (!record) return fail("invalid_json", "Некорректный запрос.");
  if (FORBIDDEN_BODY.some((key) => key in record)) return fail("actor_in_body", "В запрос попало запрещённое поле. Запрос не отправлен.");
  const taskId = text(record.taskId, 64);
  const action = text(record.action, 20) as LifecycleAction;
  const expectedStatus = text(record.expectedStatus, 40);
  const idempotencyKey = text(record.idempotencyKey, 200);
  if (!isAcceptanceTaskId(taskId)) return fail("invalid_task_id", "Некорректный идентификатор задачи.");
  if (!LIFECYCLE_ACTIONS.includes(action)) return fail("invalid_action", "Неизвестное действие.");
  if (!STATUS_TOKEN.test(expectedStatus)) return fail("invalid_expected_status", "Нет состояния задачи из табло. Обновите страницу.");
  if (!IDEMPOTENCY_KEY.test(idempotencyKey)) return fail("invalid_idempotency_key", "Некорректный ключ повтора.");
  const reason = text(record.reason, 2000);
  const reasonError = validateReason(reason, action === "cancel" || action === "stop");
  if (reasonError) return fail("invalid_reason", reasonError);
  let after: "defer" | "cancel" | null = null;
  if (action === "stop") {
    if (record.after !== "defer" && record.after !== "cancel") return fail("invalid_after", "Выберите, что сделать после остановки.");
    after = record.after;
  }
  let evidence: EvidenceItem[] | null = null;
  if (action === "complete") {
    const list = Array.isArray(record.evidence) ? record.evidence : [];
    if (list.length < 1 || list.length > 10) return fail("invalid_evidence", "Добавьте доказательство.");
    evidence = [];
    for (const entry of list) {
      const checked = validateEvidence(entry);
      if (!checked.ok) return checked;
      evidence.push(checked.item);
    }
  }
  return { ok: true, command: { taskId, action, expectedStatus, idempotencyKey, reason: reason || null, after, evidence } };
}

export function lifecycleCoreBody(command: LifecycleCommand): Record<string, unknown> {
  const body: Record<string, unknown> = { idempotency_key: command.idempotencyKey, expected_status: command.expectedStatus };
  if (command.reason) body.reason = command.reason;
  if (command.after) body.after = command.after;
  if (command.evidence) body.evidence = command.evidence;
  return body;
}

const ERROR_TEXT: Record<string, string> = {
  unauthorized: "Нет доступа к Company Core.",
  actor_not_authenticated: "Сессия не подтверждена для этого действия.",
  not_found: "Задача не найдена.",
  core_route_unavailable: "Company Core недоступен: адрес действия не открыт на шлюзе (ответ 404 без кода Core). Ничего не изменено.",
  status_changed: "Состояние задачи уже изменилось. Обновите страницу и проверьте ещё раз.",
  idempotency_key_conflict: "Этот запрос уже отправлялся с другими данными. Обновите страницу.",
  historical_blocked_no_requeue: "Это защищённая историческая задача. Менять её нельзя.",
  already_terminal: "Задача уже закрыта.",
  stop_confirmation_pending: "Остановка уже запрошена, ждём подтверждения исполнителя.",
  executing_stop_required: "Исполнитель работает над задачей: сначала «Остановить».",
  rework_open: "Задача на доработке: завершить её сейчас нельзя.",
  not_executing: "Исполнитель не работает над задачей: используйте «Отложить» или «Снять».",
  action_not_allowed: "Это действие для задачи сейчас не разрешено. Обновите страницу.",
  reason_required: "Укажите причину.",
  meaningful_reason_required: "Напишите настоящую причину.",
  production_proof_required: "Core не нашёл подтверждения на проде. Задача не завершена.",
  deploy_sha_mismatch: "SHA выкладки не совпадает с проверенным в Core.",
  pr_url_mismatch: "PR не совпадает с PR задачи в Core.",
  core_record_not_found: "Запись Core с таким UUID не найдена.",
  core_record_other_task: "Эта запись Core относится к другой задаче.",
  internal_error: "Company Core не выполнил действие.",
};

const DONE_TEXT: Record<LifecycleAction, string> = {
  defer: "Задача отложена в план. Вернуть — кнопкой «В работу».",
  cancel: "Задача снята и перенесена в архив. История и PR сохранены.",
  complete: "Задача завершена с доказательствами и перенесена в архив.",
  stop: "Остановка запрошена. Ждём подтверждения исполнителя.",
};

export function interpretLifecycleResponse(
  status: number,
  body: unknown,
  expected: { taskId: string; action: LifecycleAction },
): LifecycleOutcome {
  const record = asRecord(body);
  const rawCode = record?.code ?? record?.error;
  const code = typeof rawCode === "string" ? rawCode : "";
  if (status === 401 || code === "unauthorized") return fail("unauthorized", ERROR_TEXT.unauthorized);
  if (status === 403) return fail("actor_not_authenticated", ERROR_TEXT.actor_not_authenticated);
  if (code === "not_found") return fail("not_found", ERROR_TEXT.not_found);
  if (status === 404) return fail("core_route_unavailable", ERROR_TEXT.core_route_unavailable);
  if (status >= 500) return fail("internal_error", ERROR_TEXT.internal_error);
  if (status === 409 || status === 400) return fail(code || "conflict", ERROR_TEXT[code] ?? "Действие не выполнено. Задача не изменена.");
  const taskId = typeof record?.task_id === "string" ? record.task_id : "";
  if (status === 200 && isAcceptanceTaskId(taskId)) {
    if (taskId.toLowerCase() !== expected.taskId.toLowerCase()) {
      return fail("response_mismatch", "Company Core ответил про другую задачу. Действие не подтверждено.");
    }
    const toStatus = typeof record?.to_status === "string" ? record.to_status : typeof record?.status === "string" ? record.status : "";
    const idempotent = record?.idempotent === true;
    return { ok: true, taskId, action: expected.action, toStatus, idempotent, message: DONE_TEXT[expected.action] };
  }
  return fail("rejected", "Company Core не подтвердил действие.");
}

export async function postOwnerLifecycle(input: {
  base: string;
  token: string;
  command: LifecycleCommand;
  fetchImpl?: typeof fetch;
}): Promise<LifecycleOutcome> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const { command } = input;
  try {
    const response = await fetchImpl(`${input.base.replace(/\/$/, "")}${lifecycleCommandPath(command.taskId, command.action)}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.token}`,
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-Company-Actor": COMPANY_ACTOR,
      },
      body: JSON.stringify(lifecycleCoreBody(command)),
      cache: "no-store",
      // stop delivers to the executor bridge inside the call.
      signal: AbortSignal.timeout(20000),
    });
    const payload = await response.json().catch(() => null);
    return interpretLifecycleResponse(response.status, payload, { taskId: command.taskId, action: command.action });
  } catch {
    return fail("unavailable", LIFECYCLE_UNAVAILABLE);
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
    case "not_found":
      return 404;
    case "response_mismatch":
    case "rejected":
    case "core_route_unavailable":
      return 502;
    case "internal_error":
      return 500;
    case "invalid_json":
    case "actor_in_body":
    case "invalid_task_id":
    case "invalid_action":
    case "invalid_expected_status":
    case "invalid_idempotency_key":
    case "invalid_reason":
    case "invalid_after":
    case "invalid_evidence":
    case "reason_required":
    case "meaningful_reason_required":
      return 400;
    default:
      return 409;
  }
}

export async function handleOwnerLifecycleRequest(input: {
  body: unknown;
  base: string | null | undefined;
  token: string | null | undefined;
  actor: { userId: string; isOwner: boolean };
  fetchImpl?: typeof fetch;
}): Promise<{ status: number; body: Record<string, unknown> }> {
  if (!input.actor.isOwner) {
    return { status: 403, body: { ok: false, code: "owner_required", message: LIFECYCLE_OWNER_ONLY } };
  }
  const command = validateLifecycleCommand(input.body);
  if (!command.ok) return { status: 400, body: { ok: false, code: command.code, message: command.message } };
  if (!input.base || !input.token) {
    return { status: 503, body: { ok: false, code: "unavailable", message: LIFECYCLE_UNAVAILABLE } };
  }
  const outcome = await postOwnerLifecycle({ base: input.base, token: input.token, command: command.command, fetchImpl: input.fetchImpl });
  if (!outcome.ok) {
    return { status: httpStatusFor(outcome.code), body: { ok: false, code: outcome.code, message: outcome.message } };
  }
  return {
    status: 200,
    body: { ok: true, taskId: outcome.taskId, action: outcome.action, toStatus: outcome.toStatus, idempotent: outcome.idempotent, message: outcome.message },
  };
}
