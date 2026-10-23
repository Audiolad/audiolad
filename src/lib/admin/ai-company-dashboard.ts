/**
 * View model for /admin/ai-company.
 * Facts come from GET /v1/status. Missing facts stay «Нет данных».
 * updated_at is never treated as received_at or completed_at.
 * qa_pass, merge, green CI and deploy alone are not DONE.
 *
 * CORE_FIELD_MAP is the only place that names Company Core JSON keys.
 * Primary names are STATUS_SUCCESS_SHAPE at 8418dbaae5d19c78e0b4506d33f03255928a9afb.
 * Later names in each list are fallbacks for the previous payload.
 */

import { safeResultVersion } from "@/lib/admin/ai-company-acceptance";
import { copySafeProse, formatAiCompanyTaskCopy } from "@/lib/admin/ai-company-task-copy";

export const NO_DATA = "Нет данных";

export const HEARTBEAT_STALE_MS = 60 * 60 * 1000;
/** Codex CLI probe runs every 10 minutes; older than 20 minutes is «Нет свежей проверки» (same TTL as Core). */
export const CODEX_PROBE_STALE_MS = 20 * 60 * 1000;

/** Caps observed on the pre-contract payload. Equal length is a boundary, not proof of completeness. */
export const LEGACY_TASK_CAP = 100;
export const LEGACY_EVENT_CAP = 50;
export const HISTORY_PAGE_SIZE = 20;

/**
 * Label dictionary for historical role values in task records (audit, history filter).
 * Not rendered as company positions: the board shows one Grok orchestrator and real executors.
 */
export const AI_COMPANY_ROLES = [
  ["orchestrator", "Оркестратор (Orchestrator)"],
  ["research", "Исследователь (Research)"],
  ["product", "Продуктовый агент (Product)"],
  ["ux", "UX-агент (UX)"],
  ["engineering", "Инженер (Engineering)"],
  ["qa", "Контроль качества (QA)"],
  ["analytics", "Аналитик (Analytics)"],
  ["marketing", "Маркетинг и продажи (Marketing & Sales)"],
] as const;

export const QUOTA_CHECK_PATHS = {
  codex:
    "Сверка Codex: included usage и дата сброса в кабинете OpenAI / Codex. Это не остаток лимита и не пул Cursor.",
  cursor:
    "Сверка Cursor: пул и расход в кабинете Cursor. Модель Grok внутри Cursor относится к пулу Cursor, не к отдельному запуску xAI.",
  grok:
    "Сверка оркестратора Grok: отдельный пул xAI только если источник его подтвердил. Модель Grok внутри Cursor сюда не входит.",
} as const;

/**
 * Single mapping layer for GET /v1/status.
 * The first key in each list is the name expected from the Core contract.
 */
export const CORE_FIELD_MAP = {
  root: {
    generatedAt: ["generated_at"],
    tasks: ["tasks"],
    tasksPage: ["tasks_page"],
    activeTasks: ["active_tasks"],
    taskHistory: ["task_history", "completed_tasks"],
    events: ["recent_events", "events"],
    eventsPage: ["events_page"],
    agents: ["agents"],
    executors: ["executors"],
    executiveRuns: ["executive_runs"],
    heartbeats: ["heartbeats"],
    currentGates: ["gates", "current_gates"],
    archivedBlockers: ["gates_history", "archived_blockers", "archived_gates"],
    gatesComplete: ["gates_complete"],
    costs: ["costs"],
    quotas: ["quotas"],
    codex: ["codex"],
    coverage: ["coverage", "completeness"],
  },
  query: {
    historyBefore: "history_before",
    historyLimit: "history_limit",
    historyOffset: "history_offset",
  },
  task: {
    id: ["id", "task_id"],
    title: ["title"],
    status: ["status"],
    stage: ["operating_stage", "stage"],
    executiveStatus: ["executive_status"],
    priority: ["priority"],
    functionalRole: ["role", "producer_agent_slug", "functional_role", "agent_slug"],
    active: ["active"],
    taskEvents: ["events"],
    eventsComplete: ["events_complete"],
    actualExecutor: ["executor", "actual_executor"],
    fallbackExecutor: ["fallback_executor"],
    nextStep: ["next_action", "next_step"],
    resultType: ["result_type", "result_kind", "dod_kind", "task_type"],
    githubIssue: ["github_issue_number", "issue_number"],
    humanGate: ["human_gate"],
    blockedReason: ["blocked_reason"],
    decisionOwner: ["decision_owner"],
    gateRequest: ["request"],
    gateNextAction: ["next_action"],
    dependencies: ["dependencies", "readiness_dependencies"],
    createdAt: ["created_at"],
    receivedAt: ["received_at", "intake_at"],
    startedAt: ["started_at"],
    completedAt: ["completed_at", "finished_at"],
    lastEventAt: ["last_event_at"],
    updatedAt: ["updated_at"],
    executiveRun: ["executive_run"],
    verifiedProgress: ["progress", "verified_progress"],
    lastEvent: ["last_event"],
    brief: ["brief", "description", "body", "specification", "original_text", "original_brief"],
    source: ["source"],
    resultConsumer: ["result_consumer"],
    archived: ["archived"],
    merged: ["merged"],
    releaseHold: ["release_hold", "hold_reason"],
    presentation: ["presentation"],
    userAcceptance: ["user_acceptance"],
    resultVersion: ["result_version"],
    acceptance: ["acceptance"],
    evidence: ["evidence"],
    boardTab: ["board_tab"],
    launch: ["launch"],
    allowedActions: ["allowed_actions"],
    requiredDecision: ["required_decision", "decision_needed"],
  },
  /** Core #28 `tasks[].acceptance`: details of the last decision. `user_acceptance` itself is a string. */
  acceptance: {
    decision: ["decision"],
    actor: ["actor"],
    decidedAt: ["decided_at"],
    comment: ["comment"],
    resultVersion: ["result_version"],
  },
  executiveRun: {
    provider: ["provider", "actual_provider"],
    channel: ["channel"],
    model: ["model"],
    runId: ["run_id", "id"],
    lastEvent: ["last_event"],
    lastEventAt: ["last_event_at"],
    prUrl: ["pr_url", "pull_request_url"],
    headSha: ["head_sha", "commit_sha", "sha"],
    ci: ["ci_status", "ci"],
    independentReview: ["review_status", "independent_review"],
    reviewSha: ["review_sha"],
    deploy: ["deploy_status", "deploy"],
    done: ["done"],
    merged: ["merged"],
    productionVerified: ["production_verified"],
    productionProof: ["production_proof"],
  },
  progress: {
    done: ["done"],
    total: ["total"],
    formula: ["formula"],
    evidenceAt: ["evidence_at"],
  },
  gate: {
    id: ["id", "gate_id"],
    taskId: ["task_id"],
    reason: ["reason", "blocked_reason", "summary"],
    decisionOwner: ["decision_owner", "owner"],
    request: ["request"],
    nextAction: ["next_action"],
    archived: ["archived"],
    kind: ["kind", "gate_kind"],
    target: ["target", "dependency"],
  },
  executor: {
    id: ["id", "provider", "slug", "service_key"],
    provider: ["provider"],
    channel: ["channel"],
    model: ["model"],
    connectionState: ["connection", "connection_state", "state"],
    lastHeartbeatAt: ["freshness_at", "connection_freshness_at", "last_heartbeat_at", "observed_at"],
    currentTaskId: ["current_task_id"],
    runId: ["run_id"],
  },
  heartbeat: {
    serviceKey: ["service_key"],
    observedAt: ["observed_at"],
    state: ["state"],
    currentTaskId: ["current_task_id"],
  },
  event: {
    type: ["event_type", "type", "name"],
    agent: ["agent_slug", "functional_role"],
    taskId: ["task_id"],
    createdAt: ["created_at", "occurred_at"],
    payload: ["payload"],
    source: ["source", "channel"],
    runId: ["run_id"],
  },
  quota: {
    source: ["source", "confirmed_source"],
    trustworthy: ["trustworthy"],
    confirmed: ["confirmed"],
    remaining: ["remaining"],
    includedUsed: ["included_used"],
    includedLimit: ["limit", "included_limit"],
    resetsAt: ["reset_at", "resets_at"],
    checkPath: ["check_path"],
    spendUsd: ["amount_usd", "spend_usd"],
    poolUsd: ["pool_usd", "pool"],
  },
  codex: {
    connection: ["connection"],
    authenticated: ["authenticated"],
    gate: ["gate"],
    pilotOk: ["pilot_ok"],
    readinessTaskId: ["readiness_task_id"],
  },
  quotaBucket: {
    codex: ["codex"],
    cursor: ["cursor"],
    grok: ["grok", "xai"],
  },
  completeness: {
    activeTasksComplete: ["active_tasks_complete"],
    activeTasksTruncated: ["active_tasks_truncated"],
    eventsComplete: ["events_complete"],
    eventsTruncated: ["events_truncated"],
    historyComplete: ["history_complete"],
    historyTruncated: ["history_truncated"],
    historyNextOffset: ["history_next_offset"],
    nextCursor: ["next_cursor", "history_next_cursor"],
    tasksLimit: ["tasks_limit"],
    eventsLimit: ["events_limit"],
  },
  page: {
    activeComplete: ["active_complete", "complete"],
    historyComplete: ["history_complete"],
    historyNextBefore: ["history_next_before"],
    historyLimit: ["history_limit", "limit"],
    complete: ["complete"],
    truncated: ["truncated"],
    nextCursor: ["next_cursor"],
    nextOffset: ["next_offset"],
    limit: ["limit"],
  },
  gatesHistory: {
    complete: ["gates_history_complete"],
    truncated: ["gates_history_truncated"],
    nextCursor: ["gates_history_next_cursor"],
    nextOffset: ["gates_history_next_offset"],
    limit: ["gates_history_limit"],
  },
  evidence: {
    status: ["status", "state", "verdict", "conclusion"],
    verified: ["verified"],
    sha: ["sha", "head_sha", "commit_sha", "review_sha"],
    url: ["url", "pr_url", "production_url", "deploy_url"],
    at: ["evidence_at", "at", "verified_at"],
    source: ["source"],
  },
} as const;

const COMPLETED_STATUSES = new Set(["done", "completed", "accepted"]);
const WORKING_STATUSES = new Set(["working", "in_progress", "started"]);
const WAITING_STATUSES = new Set(["waiting", "review", "human_gate"]);
const ATTENTION_STATUSES = new Set(["blocked", "failed", "error", "attention"]);
const BACKLOG_STATUSES = new Set(["todo", "backlog", "queued", "queue", "ready", "intake"]);
const NOT_CONNECTED_STATUSES = new Set([
  "not_connected",
  "disconnected",
  "offline",
  "not_commissioned",
]);
const ACTIVE_STATUSES = new Set([
  ...WORKING_STATUSES,
  ...WAITING_STATUSES,
  ...ATTENTION_STATUSES,
  "qa_pass",
  "qa_fail",
  "qa",
]);
const RECEIPT_EVENT_TYPES = new Set([
  "task_assigned",
  "assigned",
  "task_created",
  "task_received",
  "received",
  "intake",
  "task_intake",
  "auto_assignment",
  "auto_assigned",
]);
const RESULT_EVENT_TYPES = new Set([
  "result_ready",
  "result",
  "produced",
  "qa_pass",
  "qa_return",
  "qa_fail",
  "draft_pr",
  "pr_opened",
  "pull_request",
  "merged",
  "deployed",
  "deploy",
]);
const START_EVENT_TYPES = new Set(["started", "task_started", "in_progress", "working"]);
const COMPLETION_EVENT_TYPES = new Set(["done", "completed", "accepted"]);
const WORK_EVENT_TYPES = new Set([
  ...RECEIPT_EVENT_TYPES,
  ...RESULT_EVENT_TYPES,
  ...START_EVENT_TYPES,
  ...COMPLETION_EVENT_TYPES,
  "progress",
  "task_progress",
  "blocked",
  "human_gate",
  "independent_review",
  "review",
  "ci",
  "production_verified",
  "production_proof",
]);
const PASS_TOKENS = new Set([
  "pass",
  "passed",
  "success",
  "succeeded",
  "green",
  "approved",
  "verified",
  "confirmed",
  "ok",
]);
const SECRET_KEY = /token|secret|password|credential|api[_-]?key|authorization|prompt|memory|email|phone|cookie|pii/i;
const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const UNCONFIRMED_SOURCE = new Set(["unknown", "unconfirmed", "none", "null", "false", "missing"]);
const SAFE_PAYLOAD_KEYS = [
  "title",
  "summary",
  "result",
  "outcome",
  "message",
  "reason",
  "verdict",
  "status",
  "pr_url",
  "pull_request_url",
  "draft_pr",
  "ci_status",
  "ci",
  "checks_conclusion",
  "check_status",
  "human_gate",
  "handoff",
  "result_consumer",
  "next_agent",
  "to",
  "from",
  "production",
  "production_url",
  "deploy_url",
  "blocked_reason",
  "description",
  "body",
  "brief",
  "text",
  "specification",
  "original_text",
  "head_sha",
  "sha",
  "run_id",
  "task_id",
  "next_step",
  "provider",
  "channel",
  "model",
] as const;

/** Result of the last connection check, not occupancy (9a63f86e). Missing data is never «не подключён». */
export type ConnectionState = "verified" | "unavailable" | "check_failed" | "stale" | "no_data";
/** Real occupancy from active runs in Core, separate from connection. */
export type OccupancyState = "working" | "waiting" | "free" | "unknown";

export type ExecutorRunView = {
  taskId: string | null;
  title: string;
  taskHref: string | null;
  prHref: string | null;
  runId: string;
  stage: string;
  lastProgressAt: string | null;
  lastProgress: string;
  fresh: boolean;
};
/** One real Codex session on the Codex host (codex exec process or live tracked run). No command line, prompt or env. */
export type ExecutorSessionView = {
  key: string;
  /** «Задача ba344b7f («…»)» or «Задача не определена». */
  task: string;
  taskId: string | null;
  taskHref: string | null;
  /** «пишет (workspace-write)», «ревью read-only», … */
  mode: string;
  /** «12:36 МСК» or «Нет данных». */
  started: string;
  /** «идёт 7 мин». */
  elapsed: string;
  /** «запуск codex-…» or «без регистрации запуска (pid 123)». */
  registration: string;
};
export type ExecutorId = "codex" | "cursor" | "grok";
export type ResultKind = "engineering" | "document" | "unknown";
export type HistoryPeriod = "all" | "today" | "week" | "month";

export type HistoryFilters = {
  period: HistoryPeriod;
  status: string;
  agent: string;
  historyOffset: number;
  historyBefore: string;
};

export type ExecutiveRun = {
  provider: string | null;
  channel: string | null;
  model: string | null;
  runId: string | null;
  lastEvent: string | null;
  lastEventAt: string | null;
  prUrl: string | null;
  headSha: string | null;
  mergeSha: string | null;
  ci: unknown;
  independentReview: unknown;
  reviewSha: string | null;
  deploy: unknown;
  done: unknown;
  merged: boolean | null;
  productionVerified: unknown;
  productionProof: unknown;
};

export type VerifiedProgress = {
  done: number;
  total: number;
  formula: string | null;
  evidenceAt: string | null;
};

export type CompanyTask = {
  id: string | null;
  githubIssueNumber: number | null;
  title: string;
  status: string;
  stage: string | null;
  executiveStatus: string | null;
  priority: string | null;
  producerAgentSlug: string | null;
  active: boolean | null;
  eventsComplete: boolean | null;
  actualExecutor: string | null;
  fallbackExecutor: string | null;
  executorParts: Array<string | null>;
  nextStep: string | null;
  resultKind: ResultKind;
  resultConsumer: string | null;
  humanGate: string | null;
  blockedReason: string | null;
  decisionOwner: string | null;
  gateRequest: string | null;
  gateNextAction: string | null;
  gateArchived: boolean;
  dependencies: DependencyFact[];
  updatedAt: string | null;
  createdAt: string | null;
  receivedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  lastEventAt: string | null;
  lastEventText: string | null;
  brief: string | null;
  briefForCopy: string | null;
  source: string | null;
  merged: boolean | null;
  releaseHold: string | null;
  executiveRun: ExecutiveRun | null;
  verifiedProgress: VerifiedProgress | null;
  taskEvents: CompanyEvent[];
  acceptanceContract: boolean;
  ownerAcceptance: OwnerAcceptanceFact | null;
  boardTab: BoardTab | null;
  launch: LaunchFact | null;
  /** Core `tasks[].allowed_actions` (company-core #41). null = Core did not send the list: no lifecycle buttons. */
  allowedActions: string[] | null;
  /** Core `tasks[].required_decision`: what decision the task waits for, in Russian. */
  requiredDecision: string | null;
  /** Core `tasks[].owner_comments` (company-core #43): Sergey's lifecycle comments, newest first. */
  ownerComments?: OwnerCommentFact[];
};

export type OwnerCommentFact = { action: string; label: string; reason: string; at: string | null };
/** One line on the card: «Комментарий Сергея (Отложено в план, 13.10 07:56 МСК): …». */
export type OwnerCommentView = { action: string; label: string; reason: string; when: string | null };

const OWNER_COMMENT_LABELS: Record<string, string> = {
  defer: "Отложено в план",
  cancel: "Снято",
  return: "Возвращено на доработку",
  complete: "Завершено с доказательствами",
  stop: "Остановка",
};

function parseOwnerComments(value: unknown): OwnerCommentFact[] {
  if (!Array.isArray(value)) return [];
  const out: OwnerCommentFact[] = [];
  for (const raw of value) {
    const record = asRecord(raw);
    if (!record) continue;
    const action = typeof record.action === "string" ? record.action.trim() : "";
    const reason = typeof record.reason === "string" ? record.reason.replace(/\s+/g, " ").trim().slice(0, 1000) : "";
    if (!action || !reason) continue;
    const label = (typeof record.label === "string" && record.label.trim()) || OWNER_COMMENT_LABELS[action] || action;
    const at = typeof record.at === "string" && Number.isFinite(Date.parse(record.at)) ? record.at : null;
    out.push({ action, label, reason, at });
  }
  return out.slice(0, 5);
}

/** «13.10 07:56 МСК» in Moscow time. */
export function formatMoscowShort(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Europe/Moscow", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("day")}.${get("month")} ${get("hour")}:${get("minute")} МСК`;
}

export function ownerCommentViews(task: Pick<CompanyTask, "ownerComments"> | null | undefined): OwnerCommentView[] {
  return (task?.ownerComments ?? []).map((c) => ({ action: c.action, label: c.label, reason: c.reason, when: formatMoscowShort(c.at) }));
}

/** Core `tasks[].board_tab`: the four board tabs, decided by the server. */
export type BoardTab = "plan" | "working" | "review" | "archive";
const BOARD_TABS: readonly BoardTab[] = ["plan", "working", "review", "archive"];

/** Server-safe: used by the server page for ?tab=. Do not move into a "use client" module. */
export function parseBoardTabParam(value: string | null | undefined): BoardTab {
  return (BOARD_TABS as readonly string[]).includes(value ?? "") ? (value as BoardTab) : "working";
}

export type LaunchState = "none" | "planned" | "waiting" | "admitted" | "sent" | "acked" | "started" | "failed";
const LAUNCH_STATES: readonly LaunchState[] = ["none", "planned", "waiting", "admitted", "sent", "acked", "started", "failed"];

/** Core `tasks[].launch`: the real launch facts. Delivery, ACK and start are separate. */
export type LaunchFact = {
  state: LaunchState;
  label: string | null;
  canLaunch: boolean;
  retryAllowed: boolean;
  requestedBy: string | null;
  requestedAt: string | null;
  admittedAt: string | null;
  deliveredAt: string | null;
  ackAt: string | null;
  executionStartedAt: string | null;
  waitingLabel: string | null;
  failureLabel: string | null;
  audit: string[];
};

export type LaunchView = {
  state: LaunchState;
  label: string;
  /** The «В работу» button: planned, waiting (a repeat press is idempotent) or a failed delivery (safe retry). */
  canPress: boolean;
  buttonLabel: string;
  facts: Array<{ label: string; value: string }>;
  audit: string;
};

export type OwnerAcceptanceState = "pending" | "accepted" | "rejected";

/** Core #28 `tasks[].presentation`. Only `presented` is «На проверке». */
export type PresentationState = "in_progress" | "presented" | "rework" | "archived";

export type OwnerAcceptanceFact = {
  applicable: boolean;
  state: OwnerAcceptanceState;
  presentation: PresentationState;
  presented: boolean;
  resultVersion: string | null;
  decision: string | null;
  recordedAt: string | null;
  actor: string | null;
  comment: string | null;
  productionVerified: boolean | null;
};

export type DependencyFact = {
  text: string;
  target: string | null;
  blocked: boolean;
  codexReadiness: boolean;
};

export type CompanyEvent = {
  eventType: string;
  bareType: string;
  channelPrefix: "oriy" | "executive" | null;
  agentSlug: string | null;
  taskId: string | null;
  createdAt: string | null;
  payload: Record<string, unknown> | null;
  runId: string | null;
};

export type CompanyAgent = {
  slug: string;
  role: string;
  status: string;
  connection: string | null;
  autonomyLevel: number | null;
  currentTaskId: string | null;
  lastHeartbeatAt: string | null;
};

export type CompanyHeartbeat = {
  serviceKey: string;
  observedAt: string | null;
  state: string | null;
  currentTaskId: string | null;
};

export type ExecutorObservation = {
  provider: string | null;
  channel: string | null;
  model: string | null;
  connectionState: string | null;
  lastHeartbeatAt: string | null;
  currentTaskId: string | null;
  runId: string | null;
};

export type GateFact = {
  id: string | null;
  taskId: string | null;
  reason: string | null;
  decisionOwner: string | null;
  request: string | null;
  nextAction: string | null;
  archived: boolean;
  kind: string | null;
  target: string | null;
};

export type Completeness = {
  activeTasksComplete: boolean | null;
  activeTasksTruncated: boolean | null;
  eventsComplete: boolean | null;
  eventsTruncated: boolean | null;
  historyComplete: boolean | null;
  historyTruncated: boolean | null;
  historyNextOffset: number | null;
  nextCursor: string | null;
  tasksLimit: number | null;
  eventsLimit: number | null;
  gatesComplete: boolean | null;
};

export type QuotaBucket = {
  source: string | null;
  trustworthy: boolean | null;
  confirmed: boolean | null;
  remaining: string | null;
  includedUsed: string | null;
  includedLimit: string | null;
  resetsAt: string | null;
  checkPath: string | null;
  spendUsd: string | null;
  poolUsd: string | null;
};

export type CodexFacts = {
  connection: string | null;
  authenticated: boolean | null;
  gate: string | null;
  pilotOk: boolean | null;
  readinessTaskId: string | null;
  /** Real Codex CLI probe over SSH (Core codex.cli_probe, 9a63f86e rework). null when Core has none. */
  cliProbe: CodexCliProbe | null;
};

/** Core codex.cli_probe: `codex --version` + `codex login status` over SSH and tracked runs. */
export type CodexCliProbe = {
  status: "verified" | "failed" | "stale" | "absent";
  checkedAt: string | null;
  transport: string | null;
  cliAvailable: boolean | null;
  cliVersion: string | null;
  chatgptAuthorized: boolean | null;
  reason: string | null;
  busy: boolean;
  currentRun: { runId: string; taskId: string | null; startedAt: string | null; heartbeatAt: string | null } | null;
  untrackedExecCount: number | null;
  /** Real Codex sessions at the probe (Core codex.cli_probe.sessions). */
  sessions: CodexSession[];
  slots: { used: number; max: number } | null;
};

export type CodexSession = {
  pid: number | null;
  tracked: boolean;
  runId: string | null;
  taskId: string | null;
  mode: "write" | "read_only" | "bypass" | "other" | null;
  startedAt: string | null;
  elapsedS: number | null;
};

export type CompanyStatus = {
  generatedAt: string;
  tasks: CompanyTask[];
  agents: CompanyAgent[];
  heartbeats: CompanyHeartbeat[];
  events: CompanyEvent[];
  executorObservations: ExecutorObservation[];
  currentGates: GateFact[];
  archivedBlockers: GateFact[];
  codexFacts: CodexFacts | null;
  completeness: Completeness;
  quotas: {
    codex: QuotaBucket | null;
    cursor: QuotaBucket | null;
    grok: QuotaBucket | null;
    legacySpend: QuotaBucket | null;
  };
  acceptanceContract: boolean;
  acceptanceView: "current" | "archive" | "all" | null;
};

export type EngineeringPanel = {
  ci: string;
  independentReview: string;
  deploy: string;
  production: string;
  dodSatisfied: boolean;
  applies: boolean;
  deployPassed: boolean;
  productionPassed: boolean;
};

export type TaskDetailModel = {
  key: string;
  title: string;
  taskId: string;
  statusLabel: string;
  brief: string;
  createdAt: string;
  receivedAt: string;
  startedAt: string;
  updatedAt: string;
  lastEventAt: string;
  source: string;
  sourceHref: string | null;
  agent: string;
  executor: string;
  stage: string;
  progress: string;
  history: string;
  results: string;
  handoffs: string;
  qa: string;
  returns: string;
  pr: string;
  prHref: string | null;
  engineering: EngineeringPanel;
  humanGate: string;
  outcome: string;
  completedAt: string;
  stageBadge: StageBadge;
  copyText: string;
  acceptance: OwnerAcceptanceView | null;
  launch: LaunchView | null;
  /** Sergey's lifecycle comments, newest first; shown once on the card. */
  ownerComments?: OwnerCommentView[];
  lifecycle: LifecycleView | null;
};

/** Owner lifecycle buttons handled by POST /api/admin/ai-company/lifecycle. launch/accept/rework have their own controls. */
/** "return" = «Вернуть на доработку» from a manual-review gate (company-core POST /v1/tasks/{id}/return). */
export type LifecycleAction = "return" | "defer" | "cancel" | "complete" | "stop";
export const LIFECYCLE_ACTIONS: readonly LifecycleAction[] = ["return", "defer", "cancel", "complete", "stop"];

export type LifecycleView = {
  /** Raw Core status, sent back as expected_status. */
  expectedStatus: string;
  /** Exactly the lifecycle actions Core lists in allowed_actions, in a fixed order. */
  actions: LifecycleAction[];
  requiredDecision: string | null;
};

export type OwnerAcceptanceView = {
  applicable: boolean;
  state: OwnerAcceptanceState;
  resultVersion: string;
  recordedAt: string;
  actor: string;
  comment: string;
  nextAction: string;
  productionVerified: string;
};

export type StageTone =
  | "queue"
  | "working"
  | "review"
  | "release"
  | "site"
  | "done"
  | "decision"
  | "blocked"
  | "cancelled"
  | "stale"
  | "acceptance"
  | "accepted"
  | "rework";

export type StageBadge = {
  label: string;
  tone: StageTone;
  detail: string | null;
};

export type TodayRowModel = {
  key: string;
  timeLabel: string;
  title: string;
  taskId: string;
  statusLabel: string;
  agentLabel: string;
  detail: TaskDetailModel;
};

export type WorkEventModel = {
  key: string;
  timeLabel: string;
  text: string;
};

export type ActiveTaskCard = {
  key: string;
  title: string;
  taskId: string;
  priority: string;
  functionalRole: string;
  executorLabel: string;
  executorNote: string;
  stage: string;
  progress: string;
  lastEvent: string;
  nextStep: string;
  codexNote: string;
  engineering: EngineeringPanel;
  detail: TaskDetailModel;
};

export type GateCard = {
  key: string;
  taskTitle: string;
  reason: string;
  freshness: string;
  decisionOwner: string;
  request: string;
  nextAction: string;
  historical: boolean;
  copyText: string;
  /** Core task id of the gate's task; null when the gate is not matched to a task in the snapshot. */
  taskId: string | null;
  /** Same lifecycle buttons as the task card (Core allowed_actions + required_decision); null for history. */
  ownerComments?: OwnerCommentView[];
  lifecycle: LifecycleView | null;
};

export type ExecutorCard = {
  id: ExecutorId;
  label: string;
  /** orchestrator: the one Grok orchestrator; executor: a runner. Missing data never turns a runner into a dependency. */
  kind: "orchestrator" | "executor";
  roleNote: string;
  providerModel: string;
  connection: ConnectionState;
  connectionLabel: string;
  /** Where the connection fact comes from and what it actually checks. */
  connectionSource: string;
  occupancy: OccupancyState;
  occupancyLabel: string;
  /** Short row label: connection · occupancy. */
  summary: string;
  heartbeat: string;
  /** Source of «Последний сигнал». */
  signalSource: string;
  freshness: string;
  activeRuns: ExecutorRunView[];
  /** Codex only: real sessions on the Codex host («занят N из 2»). Empty otherwise. */
  sessions: ExecutorSessionView[];
  /** «Нет активных запусков» or a count. */
  activeRunsLabel: string;
  /** Kept for compatibility: first active run title or «Нет активных запусков». */
  currentTask: string;
  runId: string;
  detail: string;
};

export type QuotaLine = {
  id: string;
  label: string;
  value: string;
  checkPath: string;
};

export type DashboardModel = {
  generatedAtLabel: string;
  freshnessLabel: string;
  /** «Нужно решение»: owner decisions of work still in «В работе». A human_gate / needs_decision /
   * blocked task is listed here, not in activeTasks, and never mixed with «Приёмка». */
  decisions: GateCard[];
  activeTasks: ActiveTaskCard[];
  activeBoundary: string;
  executors: ExecutorCard[];
  /** Role values present in this snapshot, for the history filter. Audit only, not company positions. */
  roleFilterOptions: Array<{ value: string; label: string }>;
  todayReceived: TodayRowModel[];
  todayCreated: TodayRowModel[];
  todayWorkEvents: WorkEventModel[];
  todayCompleted: TodayRowModel[];
  todayNote: string;
  /** «План»: planned and waiting tasks. Not sent to Grok, no execution capacity held. */
  plan: TaskDetailModel[];
  queue: TaskDetailModel[];
  history: TaskDetailModel[];
  ownerReview: TaskDetailModel[];
  acceptedArchive: TaskDetailModel[];
  /** Set when the archive list could not be read. Never shown as "no accepted results". */
  acceptedArchiveError: string | null;
  /** Tasks closed by Core in this snapshot (completed history, not counting cancelled), for the «Архив» tab count. */
  closedCount: number;
  /** Cancelled tasks Core places in «Архив» (board_tab archive). Counted in the tab, listed as «Отменена». */
  cancelledArchive: TaskDetailModel[];
  historySummary: string;
  historyBoundary: string;
  historyNextOffset: number | null;
  historyNextCursor: string | null;
  archivedBlockers: GateCard[];
  quotas: QuotaLine[];
};

type Receipt = { at: string; kind: "received" | "created" };

const EMPTY_COMPLETENESS: Completeness = {
  activeTasksComplete: null,
  activeTasksTruncated: null,
  eventsComplete: null,
  eventsTruncated: null,
  historyComplete: null,
  historyTruncated: null,
  historyNextOffset: null,
  nextCursor: null,
  tasksLimit: null,
  eventsLimit: null,
  gatesComplete: null,
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function readString(record: Record<string, unknown> | null, keys: readonly string[]): string | null {
  if (!record) return null;
  for (const key of keys) {
    if (SECRET_KEY.test(key)) continue;
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
    if (typeof value === "boolean") return value ? "true" : "false";
  }
  return null;
}

function readRaw(record: Record<string, unknown> | null, keys: readonly string[]): unknown {
  if (!record) return null;
  for (const key of keys) {
    if (SECRET_KEY.test(key)) continue;
    if (key in record && record[key] != null) return record[key];
  }
  return null;
}

function readNumber(record: Record<string, unknown> | null, keys: readonly string[]): number | null {
  if (!record) return null;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isInteger(value)) return value;
    if (typeof value === "string" && /^\d+$/.test(value.trim())) return Number(value.trim());
  }
  return null;
}

function readBoolean(record: Record<string, unknown> | null, keys: readonly string[]): boolean | null {
  if (!record) return null;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "boolean") return value;
    if (typeof value === "string") {
      const token = normalizeToken(value);
      if (token === "true") return true;
      if (token === "false") return false;
    }
  }
  return null;
}

function readMergedFlag(record: Record<string, unknown> | null, keys: readonly string[]): boolean | null {
  const stored = readBoolean(record, keys);
  if (stored != null) return stored;
  const text = readString(record, keys);
  if (!text) return null;
  const token = normalizeToken(text);
  if (token === "merged" || token === "yes") return true;
  if (token === "no" || token === "unmerged") return false;
  return null;
}

export function normalizeToken(value: string): string {
  return value.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

export function isCompletedStatus(status: string): boolean {
  return COMPLETED_STATUSES.has(normalizeToken(status));
}

export function formatDateTime(value: string | null): string {
  if (!value) return NO_DATA;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) return NO_DATA;
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Europe/Moscow",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsed);
}

export function moscowDay(value: string): string | null {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) return null;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Moscow",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(parsed);
}

function clip(value: string, max = 500): string {
  const compact = value.replace(EMAIL, "[скрыто]").replace(/\s+/g, " ").trim();
  return compact.length > max ? `${compact.slice(0, max)}…` : compact;
}

function displayKnownRole(value: string): string {
  const known = AI_COMPANY_ROLES.find(([slug]) => slug === value);
  return known ? known[1] : value;
}

export function roleLabel(slug: string | null): string {
  if (!slug) return NO_DATA;
  const known = AI_COMPANY_ROLES.find(
    ([role]) => role === slug || (role === "marketing" && slug.includes("marketing")),
  );
  return known ? known[1] : `${slug} (технический идентификатор)`;
}

export function classifyExecutor(parts: Array<string | null | undefined>): ExecutorId | null {
  const blob = parts.filter((part): part is string => Boolean(part && part.trim())).join(" ").toLowerCase();
  if (!blob.trim()) return null;
  if (/\bcursor\b|cursor[_-]cloud|cursor[_-]agent/.test(blob)) return "cursor";
  if (/\bcodex\b|\bopenai\b/.test(blob)) return "codex";
  if (/\bexecutive\b/.test(blob)) return "grok";
  if (/\bgrok\b|\bxai\b/.test(blob)) return "grok";
  return null;
}

export function executorDisplayName(id: ExecutorId | null): string {
  if (id === "codex") return "Codex";
  if (id === "cursor") return "Cursor";
  if (id === "grok") return "Grok";
  return NO_DATA;
}

function taskStatusLabel(status: string): string {
  const value = normalizeToken(status);
  if (!value) return NO_DATA;
  if (value === "planned") return "В плане";
  if (value === "launch_pending") return "Ожидает мощности";
  if (COMPLETED_STATUSES.has(value)) return "Выполнено (Completed)";
  if (value === "qa_pass") return "Контроль качества пройден (QA PASS)";
  if (value === "merged") return "Слито в git (Merged) — это не DONE";
  if (value === "deployed") return "Выкладка (Deployed) — это не DONE";
  if (value === "production") return "Отметка production — это не DONE без проверки";
  if (ATTENTION_STATUSES.has(value)) return "Требует внимания (Attention)";
  if (WAITING_STATUSES.has(value)) return "Ожидает (Waiting)";
  if (WORKING_STATUSES.has(value)) return "Работает (Working)";
  if (BACKLOG_STATUSES.has(value)) return "В очереди";
  return `${status} (технический статус)`;
}

function isGate(value: string | null): boolean {
  if (!value) return false;
  return !["none", "no", "false", "null", "not_required"].includes(value.trim().toLowerCase());
}

function humanGateLabel(value: string | null): string {
  if (!value || !value.trim()) return NO_DATA;
  if (!isGate(value)) return "Не требуется";
  return value.trim();
}

function compareNewest(leftAt: string | null, rightAt: string | null, leftIndex: number, rightIndex: number): number {
  const left = leftAt ? parseInstant(leftAt) : null;
  const right = rightAt ? parseInstant(rightAt) : null;
  if (left != null && right != null && left !== right) return right - left;
  if (left != null && right == null) return -1;
  if (left == null && right != null) return 1;
  return leftIndex - rightIndex;
}

function parseInstant(value: string | null): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function safeGithubUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.hostname !== "github.com") return null;
    if (!url.pathname.startsWith("/Audiolad/")) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function safeProductionUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return null;
    if (url.hostname !== "audiolad.ru" && url.hostname !== "www.audiolad.ru") return null;
    if (url.username || url.password || url.search) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function issueHref(issueNumber: number | null): string | null {
  if (!issueNumber || issueNumber <= 0) return null;
  return `https://github.com/Audiolad/audiolad/issues/${issueNumber}`;
}

function payloadText(payload: Record<string, unknown> | null, keys: readonly string[]): string | null {
  const value = readString(payload, keys);
  return value ? clip(value) : null;
}

function safePayloadSummary(payload: Record<string, unknown> | null): string | null {
  if (!payload) return null;
  const parts: string[] = [];
  for (const key of SAFE_PAYLOAD_KEYS) {
    if (SECRET_KEY.test(key)) continue;
    const value = readString(payload, [key]);
    if (!value) continue;
    parts.push(`${key}: ${clip(value, 180)}`);
  }
  return parts.length ? parts.join("; ") : null;
}

function stripEventType(raw: string): { channelPrefix: "oriy" | "executive" | null; bareType: string } {
  const trimmed = raw.trim();
  const lower = trimmed.toLowerCase();
  if (lower.startsWith("oriy:")) {
    return { channelPrefix: "oriy", bareType: trimmed.slice(5).trim() };
  }
  if (lower.startsWith("executive:")) {
    return { channelPrefix: "executive", bareType: trimmed.slice(10).trim() };
  }
  if (lower.startsWith("executive.")) {
    return { channelPrefix: "executive", bareType: trimmed.slice(10).trim() };
  }
  return { channelPrefix: null, bareType: trimmed };
}

function resultKindFrom(value: string | null): ResultKind {
  if (!value) return "unknown";
  const token = normalizeToken(value);
  if (["engineering", "code", "implementation", "software", "incident"].includes(token)) return "engineering";
  if (["research", "document", "doc", "documentation", "decision", "product", "ux", "copy", "analysis"].includes(token)) {
    return "document";
  }
  return "unknown";
}

function parseProgress(value: unknown): VerifiedProgress | null {
  if (value == null || typeof value === "number" || typeof value === "string" || typeof value === "boolean") return null;
  const record = asRecord(value);
  if (!record) return null;
  const done = readNumber(record, CORE_FIELD_MAP.progress.done);
  const total = readNumber(record, CORE_FIELD_MAP.progress.total);
  if (done == null || total == null || total <= 0 || done < 0 || done > total) return null;
  return {
    done,
    total,
    formula: readString(record, CORE_FIELD_MAP.progress.formula),
    evidenceAt: readString(record, CORE_FIELD_MAP.progress.evidenceAt),
  };
}

function distinctMergeSha(record: Record<string, unknown>): string | null {
  const head = readString(record, ["head_sha"]);
  const commit = readString(record, ["commit_sha"]);
  if (!head || !commit) return null;
  return head.trim().toLowerCase() === commit.trim().toLowerCase() ? null : commit;
}

function parseExecutiveRun(value: unknown): ExecutiveRun | null {
  const record = asRecord(value);
  if (!record) return null;
  const reviewFromStatus = "review_status" in record
    ? { status: record.review_status, sha: readString(record, CORE_FIELD_MAP.executiveRun.reviewSha) }
    : readRaw(record, ["independent_review"]);
  const run: ExecutiveRun = {
    provider: readString(record, CORE_FIELD_MAP.executiveRun.provider),
    channel: readString(record, CORE_FIELD_MAP.executiveRun.channel),
    model: readString(record, CORE_FIELD_MAP.executiveRun.model),
    runId: readString(record, CORE_FIELD_MAP.executiveRun.runId),
    lastEvent: null,
    lastEventAt: readString(record, CORE_FIELD_MAP.executiveRun.lastEventAt),
    prUrl: readString(record, CORE_FIELD_MAP.executiveRun.prUrl),
    headSha: readString(record, CORE_FIELD_MAP.executiveRun.headSha),
    mergeSha: distinctMergeSha(record),
    ci: "ci_status" in record ? record.ci_status : readRaw(record, ["ci"]),
    independentReview: reviewFromStatus,
    reviewSha: readString(record, CORE_FIELD_MAP.executiveRun.reviewSha) ?? evidenceSha(reviewFromStatus),
    deploy: "deploy_status" in record ? record.deploy_status : readRaw(record, ["deploy"]),
    done: readStored(record, CORE_FIELD_MAP.executiveRun.done),
    merged: readMergedFlag(record, CORE_FIELD_MAP.executiveRun.merged),
    productionVerified: "production_verified" in record ? record.production_verified : null,
    productionProof: "production_proof" in record ? record.production_proof : null,
  };
  const last = readRaw(record, CORE_FIELD_MAP.executiveRun.lastEvent);
  if (typeof last === "string") run.lastEvent = clip(last);
  else {
    const lastRecord = asRecord(last);
    run.lastEvent = lastRecord
      ? readString(lastRecord, ["message", "summary", "event_type", "type", "name"])
      : null;
    run.lastEventAt = run.lastEventAt ?? (lastRecord ? readString(lastRecord, ["created_at", "at"]) : null);
  }
  const hasFact = Object.values(run).some((item) => item != null && item !== "");
  return hasFact ? run : null;
}

function parseDependencies(value: unknown): DependencyFact[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (typeof item === "string" && item.trim()) {
      const text = clip(item);
      return [dependencyFact(text, null, null)];
    }
    const record = asRecord(item);
    if (!record) return [];
    const text = clip(
      readString(record, ["reason", "title", "summary", "name", "id"]) ?? "зависимость без формулировки",
    );
    const target = readString(record, CORE_FIELD_MAP.gate.target);
    const status = readString(record, ["status", "state"]);
    return [dependencyFact(text, target, status)];
  });
}

function dependencyFact(text: string, target: string | null, status: string | null): DependencyFact {
  const blob = `${text} ${target ?? ""} ${status ?? ""}`.toLowerCase();
  const codexReadiness =
    blob.includes("codex") &&
    (blob.includes("readiness") ||
      blob.includes("готовност") ||
      blob.includes("не подключ") ||
      blob.includes("not_connected") ||
      blob.includes("not connected") ||
      blob.includes("blocked") ||
      blob.includes("блок"));
  const blocked =
    codexReadiness ||
    ["blocked", "not_connected", "failed", "pending"].includes(normalizeToken(status ?? "")) ||
    blob.includes("blocked") ||
    blob.includes("не подключ");
  return { text, target, blocked, codexReadiness };
}

function parseLastEventText(value: unknown): { text: string | null; at: string | null } {
  if (typeof value === "string" && value.trim()) return { text: clip(value), at: null };
  const record = asRecord(value);
  if (!record) return { text: null, at: null };
  const summary = readString(record, ["summary", "message"]);
  const eventType = readString(record, ["event_type", "type", "name"]);
  const text = summary && eventType && summary !== eventType ? `${eventType}: ${summary}` : summary ?? eventType;
  return {
    text,
    at: readString(record, ["at", "created_at", "last_event_at"]),
  };
}

function executorPartsFrom(value: unknown): { label: string | null; parts: Array<string | null> } {
  if (typeof value === "string") return { label: value, parts: [value] };
  const record = asRecord(value);
  if (!record) return { label: null, parts: [] };
  const provider = readString(record, CORE_FIELD_MAP.executiveRun.provider);
  const channel = readString(record, CORE_FIELD_MAP.executiveRun.channel);
  const model = readString(record, CORE_FIELD_MAP.executiveRun.model);
  const runId = readString(record, CORE_FIELD_MAP.executor.runId);
  return { label: provider ?? channel ?? model, parts: [provider, channel, model, runId] };
}

const PRESENTATION_STATES: readonly PresentationState[] = ["in_progress", "presented", "rework", "archived"];

/** Core #28: `user_acceptance` is the string accepted | rejected | none. Anything else is not the contract. */
function userAcceptanceValue(value: unknown): "accepted" | "rejected" | "none" | null {
  if (typeof value !== "string") return null;
  const token = normalizeToken(value);
  return token === "accepted" || token === "rejected" || token === "none" ? token : null;
}

/** Core #28: `presentation` is the string enum in_progress | presented | rework | archived. */
function presentationValue(value: unknown): PresentationState | null {
  if (typeof value !== "string") return null;
  const token = normalizeToken(value);
  return (PRESENTATION_STATES as readonly string[]).includes(token) ? (token as PresentationState) : null;
}

/** The task speaks the Core #28 acceptance contract only with both enums in their real string shape. */
function hasAcceptanceContract(record: Record<string, unknown>): boolean {
  return userAcceptanceValue(record.user_acceptance) != null && presentationValue(record.presentation) != null;
}

function parseOwnerAcceptance(record: Record<string, unknown>, runVerified: boolean | null): OwnerAcceptanceFact | null {
  const decision = userAcceptanceValue(record.user_acceptance);
  const presentation = presentationValue(record.presentation);
  if (decision == null || presentation == null) return null;
  const presented = presentation === "presented";
  const applicable = decision === "accepted" || decision === "rejected" || (decision === "none" && presented);
  const state: OwnerAcceptanceState = decision === "accepted" ? "accepted" : decision === "rejected" ? "rejected" : "pending";
  // Details of the decision live only in the separate `acceptance` object (null while user_acceptance=none).
  const details = decision === "none" ? null : asRecord(readRaw(record, CORE_FIELD_MAP.task.acceptance));
  const evidence = asRecord(readRaw(record, CORE_FIELD_MAP.task.evidence));
  const actor = details ? readString(details, CORE_FIELD_MAP.acceptance.actor) : null;
  const comment = details ? readString(details, CORE_FIELD_MAP.acceptance.comment) : null;
  const decidedAt =
    (details ? readString(details, CORE_FIELD_MAP.acceptance.decidedAt) : null) ??
    (decision !== "none" && evidence ? readString(evidence, CORE_FIELD_MAP.acceptance.decidedAt) : null);
  const evidenceVerified = evidence && typeof evidence.production_verified === "boolean" ? evidence.production_verified : null;
  const detailDecision = details ? readString(details, CORE_FIELD_MAP.acceptance.decision) : null;
  return {
    applicable,
    state,
    presentation,
    presented,
    resultVersion: safeResultVersion(record.result_version),
    decision: detailDecision ? normalizeToken(detailDecision) : decision === "none" ? null : decision,
    recordedAt: decidedAt && parseInstant(decidedAt) != null ? decidedAt : null,
    actor: actor ? copySafeProse(actor) : null,
    comment: comment ? copySafeProse(comment) : null,
    productionVerified: runVerified ?? evidenceVerified,
  };
}

function parseBoardTab(value: unknown): BoardTab | null {
  if (typeof value !== "string") return null;
  const token = normalizeToken(value);
  return (BOARD_TABS as readonly string[]).includes(token) ? (token as BoardTab) : null;
}

function parseAllowedActions(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  return value.filter((item): item is string => typeof item === "string").map((item) => normalizeToken(item));
}

function parseLaunch(value: unknown): LaunchFact | null {
  const record = asRecord(value);
  if (!record) return null;
  const stateRaw = readString(record, ["state"]);
  const state = stateRaw ? normalizeToken(stateRaw) : "";
  if (!(LAUNCH_STATES as readonly string[]).includes(state)) return null;
  const audit = Array.isArray(record.audit)
    ? record.audit
        .map((entry) => asRecord(entry))
        .filter((entry): entry is Record<string, unknown> => entry !== null)
        .map((entry) => {
          const at = readString(entry, ["at"]);
          const actor = readString(entry, ["actor"]);
          const action = readString(entry, ["action"]);
          return [at ? formatDateTime(at) : null, actor, action].filter(Boolean).join(" · ");
        })
        .filter(Boolean)
        .slice(-10)
    : [];
  return {
    state: state as LaunchState,
    label: readString(record, ["label"]),
    canLaunch: readBoolean(record, ["can_launch"]) === true,
    retryAllowed: readBoolean(record, ["retry_allowed"]) === true,
    requestedBy: readString(record, ["requested_by"]),
    requestedAt: readString(record, ["requested_at"]),
    admittedAt: readString(record, ["admitted_at"]),
    deliveredAt: readString(record, ["delivered_at"]),
    ackAt: readString(record, ["ack_at"]),
    executionStartedAt: readString(record, ["execution_started_at"]),
    waitingLabel: readString(record, ["waiting_label"]),
    failureLabel: readString(record, ["failure_label"]),
    audit,
  };
}

function parseTask(value: unknown, index: number): CompanyTask | null {
  const record = asRecord(value);
  if (!record) return null;
  const title = readString(record, CORE_FIELD_MAP.task.title) ?? `Задача без названия #${index + 1}`;
  const brief = readString(record, CORE_FIELD_MAP.task.brief);
  const executor = executorPartsFrom(readRaw(record, CORE_FIELD_MAP.task.actualExecutor));
  const run = parseExecutiveRun(readRaw(record, CORE_FIELD_MAP.task.executiveRun));
  const lastEvent = parseLastEventText(readRaw(record, CORE_FIELD_MAP.task.lastEvent));
  const humanGateRaw = readRaw(record, CORE_FIELD_MAP.task.humanGate);
  const humanGateRecord = asRecord(humanGateRaw);
  const resultKind = resultKindFrom(readString(record, CORE_FIELD_MAP.task.resultType));
  return {
    id: readString(record, CORE_FIELD_MAP.task.id),
    githubIssueNumber: readNumber(record, CORE_FIELD_MAP.task.githubIssue),
    title: clip(title, 300),
    status: readString(record, CORE_FIELD_MAP.task.status) ?? "",
    stage: readString(record, CORE_FIELD_MAP.task.stage),
    executiveStatus: readString(record, CORE_FIELD_MAP.task.executiveStatus),
    priority: readString(record, CORE_FIELD_MAP.task.priority),
    producerAgentSlug: readString(record, CORE_FIELD_MAP.task.functionalRole),
    active: readBoolean(record, CORE_FIELD_MAP.task.active),
    eventsComplete: readBoolean(record, CORE_FIELD_MAP.task.eventsComplete),
    actualExecutor: executor.label,
    fallbackExecutor: readString(record, CORE_FIELD_MAP.task.fallbackExecutor),
    executorParts: [...executor.parts, run?.provider ?? null, run?.channel ?? null, run?.model ?? null],
    nextStep: readString(record, CORE_FIELD_MAP.task.nextStep),
    resultKind,
    resultConsumer: readString(record, CORE_FIELD_MAP.task.resultConsumer),
    humanGate: humanGateRecord
      ? readString(humanGateRecord, CORE_FIELD_MAP.gate.reason)
      : readString(record, CORE_FIELD_MAP.task.humanGate),
    blockedReason: readString(record, CORE_FIELD_MAP.task.blockedReason),
    decisionOwner:
      readString(record, CORE_FIELD_MAP.task.decisionOwner) ??
      (humanGateRecord ? readString(humanGateRecord, CORE_FIELD_MAP.gate.decisionOwner) : null),
    gateRequest:
      readString(record, CORE_FIELD_MAP.task.gateRequest) ??
      (humanGateRecord ? readString(humanGateRecord, CORE_FIELD_MAP.gate.request) : null),
    gateNextAction:
      readString(record, CORE_FIELD_MAP.task.gateNextAction) ??
      (humanGateRecord ? readString(humanGateRecord, CORE_FIELD_MAP.gate.nextAction) : null),
    gateArchived:
      readBoolean(record, CORE_FIELD_MAP.task.archived) === true ||
      (humanGateRecord ? readBoolean(humanGateRecord, CORE_FIELD_MAP.gate.archived) === true : false),
    dependencies: parseDependencies(readRaw(record, CORE_FIELD_MAP.task.dependencies)),
    updatedAt: readString(record, CORE_FIELD_MAP.task.updatedAt),
    createdAt: readString(record, CORE_FIELD_MAP.task.createdAt),
    receivedAt: readString(record, CORE_FIELD_MAP.task.receivedAt),
    startedAt: readString(record, CORE_FIELD_MAP.task.startedAt),
    completedAt: readString(record, CORE_FIELD_MAP.task.completedAt),
    lastEventAt: readString(record, CORE_FIELD_MAP.task.lastEventAt) ?? lastEvent.at ?? run?.lastEventAt ?? null,
    lastEventText: lastEvent.text ?? run?.lastEvent ?? null,
    brief: brief ? clip(brief, 20000) : null,
    briefForCopy: brief ? copySafeProse(brief) : null,
    source: readString(record, CORE_FIELD_MAP.task.source),
    merged: readMergedFlag(record, CORE_FIELD_MAP.task.merged),
    releaseHold: readString(record, CORE_FIELD_MAP.task.releaseHold),
    executiveRun: run,
    verifiedProgress: parseProgress(readStored(record, CORE_FIELD_MAP.task.verifiedProgress)),
    taskEvents: listFrom(record, CORE_FIELD_MAP.task.taskEvents)
      .map((event) => parseEvent(event))
      .filter((event): event is CompanyEvent => event !== null)
      .map((event) => ({ ...event, taskId: event.taskId ?? readString(record, CORE_FIELD_MAP.task.id) })),
    boardTab: parseBoardTab(readRaw(record, CORE_FIELD_MAP.task.boardTab)),
    launch: parseLaunch(readRaw(record, CORE_FIELD_MAP.task.launch)),
    allowedActions: parseAllowedActions(readRaw(record, CORE_FIELD_MAP.task.allowedActions)),
    requiredDecision: readString(record, CORE_FIELD_MAP.task.requiredDecision),
    ownerComments: parseOwnerComments(readRaw(record, ["owner_comments"])),
    acceptanceContract: hasAcceptanceContract(record),
    ownerAcceptance: parseOwnerAcceptance(record, typeof run?.productionVerified === "boolean" ? run.productionVerified : null),
  };
}

function parseEvent(value: unknown): CompanyEvent | null {
  const record = asRecord(value);
  if (!record) return null;
  const eventType = readString(record, CORE_FIELD_MAP.event.type);
  if (!eventType) return null;
  const stripped = stripEventType(eventType);
  const payload = asRecord(readRaw(record, CORE_FIELD_MAP.event.payload));
  const source = readString(record, CORE_FIELD_MAP.event.source);
  let channelPrefix = stripped.channelPrefix;
  if (!channelPrefix && source) {
    const sourceToken = normalizeToken(source);
    if (sourceToken === "oriy" || sourceToken.startsWith("oriy_")) channelPrefix = "oriy";
    if (sourceToken === "executive" || sourceToken.startsWith("executive_")) channelPrefix = "executive";
  }
  return {
    eventType,
    bareType: stripped.bareType || eventType,
    channelPrefix,
    agentSlug: readString(record, CORE_FIELD_MAP.event.agent),
    taskId: readString(record, CORE_FIELD_MAP.event.taskId),
    createdAt: readString(record, CORE_FIELD_MAP.event.createdAt),
    payload,
    runId: readString(record, CORE_FIELD_MAP.event.runId) ?? payloadText(payload, ["run_id", "executive_run_id"]),
  };
}

function parseAgent(value: unknown): CompanyAgent | null {
  const record = asRecord(value);
  if (!record) return null;
  const slug = readString(record, ["slug", "functional_role", "role"]);
  if (!slug) return null;
  return {
    slug,
    role: readString(record, ["role", "functional_role"]) ?? slug,
    status: readString(record, ["status"]) ?? "",
    connection: readString(record, ["connection", "connection_state"]),
    autonomyLevel: readNumber(record, ["autonomy_level"]),
    currentTaskId: readString(record, ["current_task_id", "task_id"]),
    lastHeartbeatAt: readString(record, ["connection_freshness_at", "last_heartbeat_at"]),
  };
}

function parseHeartbeat(value: unknown): CompanyHeartbeat | null {
  const record = asRecord(value);
  if (!record) return null;
  const serviceKey = readString(record, CORE_FIELD_MAP.heartbeat.serviceKey);
  if (!serviceKey) return null;
  return {
    serviceKey,
    observedAt: readString(record, CORE_FIELD_MAP.heartbeat.observedAt),
    state: readString(record, CORE_FIELD_MAP.heartbeat.state),
    currentTaskId: readString(record, CORE_FIELD_MAP.heartbeat.currentTaskId),
  };
}

function parseExecutorObservation(value: unknown): ExecutorObservation | null {
  const record = asRecord(value);
  if (!record) return null;
  return {
    provider: readString(record, CORE_FIELD_MAP.executor.provider) ?? readString(record, CORE_FIELD_MAP.executor.id),
    channel: readString(record, CORE_FIELD_MAP.executor.channel),
    model: readString(record, CORE_FIELD_MAP.executor.model),
    connectionState: readString(record, CORE_FIELD_MAP.executor.connectionState),
    lastHeartbeatAt: readString(record, CORE_FIELD_MAP.executor.lastHeartbeatAt),
    currentTaskId: readString(record, CORE_FIELD_MAP.executor.currentTaskId),
    runId: readString(record, CORE_FIELD_MAP.executor.runId),
  };
}

function parseGate(value: unknown): GateFact | null {
  if (typeof value === "string" && value.trim() && isGate(value)) {
    return {
      id: null,
      taskId: null,
      reason: clip(value),
      decisionOwner: null,
      request: null,
      nextAction: null,
      archived: false,
      kind: null,
      target: null,
    };
  }
  const record = asRecord(value);
  if (!record) return null;
  return {
    id: readString(record, CORE_FIELD_MAP.gate.id),
    taskId: readString(record, CORE_FIELD_MAP.gate.taskId),
    reason: readString(record, CORE_FIELD_MAP.gate.reason),
    decisionOwner: readString(record, CORE_FIELD_MAP.gate.decisionOwner),
    request: readString(record, CORE_FIELD_MAP.gate.request),
    nextAction: readString(record, CORE_FIELD_MAP.gate.nextAction),
    archived: readBoolean(record, CORE_FIELD_MAP.gate.archived) === true,
    kind: readString(record, CORE_FIELD_MAP.gate.kind),
    target: readString(record, CORE_FIELD_MAP.gate.target),
  };
}

function firstBoolean(...values: Array<boolean | null>): boolean | null {
  for (const value of values) {
    if (value != null) return value;
  }
  return null;
}

function firstNumber(...values: Array<number | null>): number | null {
  for (const value of values) {
    if (value != null) return value;
  }
  return null;
}

function firstString(...values: Array<string | null>): string | null {
  for (const value of values) {
    if (value != null) return value;
  }
  return null;
}

function namedRecord(root: Record<string, unknown>, key: string): Record<string, unknown> | null {
  if (!(key in root)) return null;
  return asRecord(root[key]);
}

function parseCompleteness(root: Record<string, unknown>): Completeness {
  const coverageKey = CORE_FIELD_MAP.root.coverage.find((key) => key in root);
  const coverage = coverageKey ? asRecord(root[coverageKey]) : null;
  const tasksPage = namedRecord(root, CORE_FIELD_MAP.root.tasksPage[0]);
  const eventsPage = namedRecord(root, CORE_FIELD_MAP.root.eventsPage[0]);
  return {
    ...EMPTY_COMPLETENESS,
    activeTasksComplete: firstBoolean(
      readBoolean(tasksPage, CORE_FIELD_MAP.page.activeComplete),
      readBoolean(coverage, CORE_FIELD_MAP.completeness.activeTasksComplete),
    ),
    activeTasksTruncated: firstBoolean(
      readBoolean(tasksPage, CORE_FIELD_MAP.page.truncated),
      readBoolean(coverage, CORE_FIELD_MAP.completeness.activeTasksTruncated),
    ),
    eventsComplete: firstBoolean(
      readBoolean(eventsPage, CORE_FIELD_MAP.page.complete),
      readBoolean(coverage, CORE_FIELD_MAP.completeness.eventsComplete),
    ),
    eventsTruncated: firstBoolean(
      readBoolean(eventsPage, CORE_FIELD_MAP.page.truncated),
      readBoolean(coverage, CORE_FIELD_MAP.completeness.eventsTruncated),
    ),
    historyComplete: firstBoolean(
      readBoolean(tasksPage, CORE_FIELD_MAP.page.historyComplete),
      readBoolean(root, CORE_FIELD_MAP.gatesHistory.complete),
      readBoolean(coverage, CORE_FIELD_MAP.completeness.historyComplete),
    ),
    historyTruncated: firstBoolean(
      readBoolean(root, CORE_FIELD_MAP.gatesHistory.truncated),
      readBoolean(coverage, CORE_FIELD_MAP.completeness.historyTruncated),
    ),
    historyNextOffset: firstNumber(
      readNumber(root, CORE_FIELD_MAP.gatesHistory.nextOffset),
      readNumber(coverage, CORE_FIELD_MAP.completeness.historyNextOffset),
    ),
    nextCursor: firstString(
      readString(tasksPage, CORE_FIELD_MAP.page.historyNextBefore),
      readString(root, CORE_FIELD_MAP.gatesHistory.nextCursor),
      readString(tasksPage, CORE_FIELD_MAP.page.nextCursor),
      readString(eventsPage, CORE_FIELD_MAP.page.nextCursor),
      readString(coverage, CORE_FIELD_MAP.completeness.nextCursor),
    ),
    tasksLimit: firstNumber(
      readNumber(tasksPage, CORE_FIELD_MAP.page.historyLimit),
      readNumber(root, CORE_FIELD_MAP.gatesHistory.limit),
      readNumber(coverage, CORE_FIELD_MAP.completeness.tasksLimit),
    ),
    eventsLimit: firstNumber(
      readNumber(eventsPage, CORE_FIELD_MAP.page.limit),
      readNumber(coverage, CORE_FIELD_MAP.completeness.eventsLimit),
    ),
    gatesComplete: firstBoolean(
      readBoolean(root, CORE_FIELD_MAP.root.gatesComplete),
      readBoolean(coverage, CORE_FIELD_MAP.root.gatesComplete),
    ),
  };
}

function parseQuotaBucket(value: unknown): QuotaBucket | null {
  const record = asRecord(value);
  if (!record) return null;
  const bucket: QuotaBucket = {
    source: confirmedSource(readString(record, CORE_FIELD_MAP.quota.source)),
    trustworthy: readBoolean(record, CORE_FIELD_MAP.quota.trustworthy),
    confirmed: readBoolean(record, CORE_FIELD_MAP.quota.confirmed),
    remaining: readString(record, CORE_FIELD_MAP.quota.remaining),
    includedUsed: readString(record, CORE_FIELD_MAP.quota.includedUsed),
    includedLimit: readString(record, CORE_FIELD_MAP.quota.includedLimit),
    resetsAt: readString(record, CORE_FIELD_MAP.quota.resetsAt),
    checkPath: readString(record, CORE_FIELD_MAP.quota.checkPath),
    spendUsd: readString(record, CORE_FIELD_MAP.quota.spendUsd),
    poolUsd: readString(record, CORE_FIELD_MAP.quota.poolUsd),
  };
  const hasFact = Object.values(bucket).some((item) => item != null);
  return hasFact ? bucket : null;
}

function confirmedSource(value: string | null): string | null {
  if (!value) return null;
  if (UNCONFIRMED_SOURCE.has(normalizeToken(value))) return null;
  return clip(value, 120);
}

function readStored(record: Record<string, unknown> | null, keys: readonly string[]): unknown {
  if (!record) return null;
  for (const key of keys) {
    if (SECRET_KEY.test(key)) continue;
    if (key in record) return record[key];
  }
  return null;
}

function listFrom(record: Record<string, unknown>, keys: readonly string[]): unknown[] {
  for (const key of keys) {
    if (!(key in record)) continue;
    const value = record[key];
    return Array.isArray(value) ? value : [];
  }
  return [];
}

function mergeTasks(lists: unknown[][]): CompanyTask[] {
  const merged = new Map<string, CompanyTask>();
  const anonymous: CompanyTask[] = [];
  let index = 0;
  for (const list of lists) {
    for (const item of list) {
      const task = parseTask(item, index);
      index += 1;
      if (!task) continue;
      if (!task.id) {
        anonymous.push(task);
        continue;
      }
      const previous = merged.get(task.id);
      merged.set(task.id, previous ? mergeTaskPair(previous, task) : task);
    }
  }
  return [...merged.values(), ...anonymous];
}

function prefer<T>(next: T | null, previous: T | null): T | null {
  return next ?? previous;
}

function mergeTaskPair(previous: CompanyTask, next: CompanyTask): CompanyTask {
  return {
    ...previous,
    ...next,
    title: next.title.startsWith("Задача без названия") ? previous.title : next.title,
    status: next.status || previous.status,
    stage: prefer(next.stage, previous.stage),
    executiveStatus: prefer(next.executiveStatus, previous.executiveStatus),
    priority: prefer(next.priority, previous.priority),
    producerAgentSlug: prefer(next.producerAgentSlug, previous.producerAgentSlug),
    actualExecutor: prefer(next.actualExecutor, previous.actualExecutor),
    fallbackExecutor: prefer(next.fallbackExecutor, previous.fallbackExecutor),
    executorParts: [...previous.executorParts, ...next.executorParts],
    nextStep: prefer(next.nextStep, previous.nextStep),
    resultKind: next.resultKind !== "unknown" ? next.resultKind : previous.resultKind,
    receivedAt: prefer(next.receivedAt, previous.receivedAt),
    startedAt: prefer(next.startedAt, previous.startedAt),
    completedAt: prefer(next.completedAt, previous.completedAt),
    createdAt: prefer(next.createdAt, previous.createdAt),
    lastEventAt: prefer(next.lastEventAt, previous.lastEventAt),
    lastEventText: prefer(next.lastEventText, previous.lastEventText),
    active: next.active ?? previous.active,
    eventsComplete: next.eventsComplete ?? previous.eventsComplete,
    taskEvents: [...previous.taskEvents, ...next.taskEvents],
    executiveRun: next.executiveRun ?? previous.executiveRun,
    verifiedProgress: next.verifiedProgress ?? previous.verifiedProgress,
    dependencies: next.dependencies.length ? next.dependencies : previous.dependencies,
    githubIssueNumber: next.githubIssueNumber ?? previous.githubIssueNumber,
    merged: next.merged ?? previous.merged,
    releaseHold: prefer(next.releaseHold, previous.releaseHold),
    acceptanceContract: next.acceptanceContract || previous.acceptanceContract,
    ownerAcceptance: next.ownerAcceptance ?? previous.ownerAcceptance,
    allowedActions: next.allowedActions ?? previous.allowedActions,
    requiredDecision: prefer(next.requiredDecision, previous.requiredDecision),
    ownerComments: next.ownerComments?.length ? next.ownerComments : previous.ownerComments,
  };
}

function attachRuns(tasks: CompanyTask[], runs: unknown[]): CompanyTask[] {
  if (!runs.length) return tasks;
  return tasks.map((task) => {
    if (task.executiveRun) return task;
    const match = runs
      .map((item) => ({ record: asRecord(item), run: parseExecutiveRun(item) }))
      .find(({ record, run }) => {
        if (!record || !run) return false;
        const taskId = readString(record, ["task_id"]);
        return (task.id != null && taskId === task.id) || (run.runId != null && taskAliases(task).includes(`run:${run.runId}`));
      });
    if (!match?.run) return task;
    return {
      ...task,
      executiveRun: match.run,
      executorParts: [...task.executorParts, match.run.provider, match.run.channel, match.run.model],
    };
  });
}

function dedupeEvents(events: CompanyEvent[]): CompanyEvent[] {
  const seen = new Set<string>();
  const result: CompanyEvent[] = [];
  for (const event of events) {
    const key = [event.eventType, event.taskId ?? "", event.createdAt ?? "", event.agentSlug ?? "", event.runId ?? ""].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(event);
  }
  return result;
}

function parseCodexFacts(value: unknown): CodexFacts | null {
  const record = asRecord(value);
  if (!record) return null;
  const facts: CodexFacts = {
    connection: readString(record, CORE_FIELD_MAP.codex.connection),
    authenticated: readBoolean(record, CORE_FIELD_MAP.codex.authenticated),
    gate: readString(record, CORE_FIELD_MAP.codex.gate),
    pilotOk: readBoolean(record, CORE_FIELD_MAP.codex.pilotOk),
    readinessTaskId: readString(record, CORE_FIELD_MAP.codex.readinessTaskId),
    cliProbe: parseCodexCliProbe(record.cli_probe),
  };
  return Object.values(facts).some((item) => item != null) ? facts : null;
}

const CLI_PROBE_STATUSES = new Set(["verified", "failed", "stale", "absent"]);

function parseCodexCliProbe(value: unknown): CodexCliProbe | null {
  const record = asRecord(value);
  if (!record) return null;
  const status = readString(record, ["status"]);
  if (!status || !CLI_PROBE_STATUSES.has(status)) return null;
  const run = asRecord(record.current_run);
  const runId = run ? readString(run, ["run_id"]) : null;
  const sessions = parseCodexSessions(record.sessions);
  // Older Core sends only a count of unregistered codex exec processes: still real occupancy.
  const legacyUntracked = readNumber(record, ["untracked_exec_count"]) ?? 0;
  if (!Array.isArray(record.sessions)) {
    if (readBoolean(record, ["busy"]) === true && runId && run) {
      const pid = readNumber(run, ["pid"]);
      const startedAt = readString(run, ["started_at"]);
      const taskId = readString(run, ["task_id"]);
      sessions.push({
        pid: pid != null && pid > 0 ? Math.round(pid) : null,
        tracked: true,
        runId: SESSION_TOKEN.test(runId) ? runId : null,
        taskId: taskId && SESSION_TOKEN.test(taskId) ? taskId : null,
        mode: null,
        startedAt,
        elapsedS: null,
      });
    }
    for (let i = 0; i < Math.min(legacyUntracked, 20); i += 1) {
      sessions.push({ pid: null, tracked: false, runId: null, taskId: null, mode: null, startedAt: null, elapsedS: null });
    }
  }
  const slotsRecord = asRecord(record.slots);
  const slotsMax = slotsRecord ? readNumber(slotsRecord, ["max"]) : null;
  return {
    status: status as CodexCliProbe["status"],
    checkedAt: readString(record, ["checked_at"]),
    transport: readString(record, ["transport"]),
    cliAvailable: readBoolean(record, ["cli_available"]),
    cliVersion: readString(record, ["cli_version"]),
    chatgptAuthorized: readBoolean(record, ["chatgpt_authorized"]),
    reason: readString(record, ["reason"]),
    busy: (readBoolean(record, ["busy"]) === true && Boolean(runId)) || sessions.length > 0,
    currentRun: run && runId
      ? {
          runId,
          taskId: readString(run, ["task_id"]),
          startedAt: readString(run, ["started_at"]),
          heartbeatAt: readString(run, ["heartbeat_at"]),
        }
      : null,
    untrackedExecCount: readNumber(record, ["untracked_exec_count"]),
    sessions,
    slots: slotsMax != null && slotsMax >= 1 ? { used: sessions.length, max: Math.round(slotsMax) } : null,
  };
}

const SESSION_MODES = new Set(["write", "read_only", "bypass", "other"]);
const SESSION_TOKEN = /^[A-Za-z0-9._:-]{1,120}$/;

function parseCodexSessions(value: unknown): CodexSession[] {
  if (!Array.isArray(value)) return [];
  const out: CodexSession[] = [];
  for (const item of value.slice(0, 20)) {
    const record = asRecord(item);
    if (!record) continue;
    const token = (key: string) => {
      const text = readString(record, [key]);
      return text && SESSION_TOKEN.test(text) ? text : null;
    };
    const mode = readString(record, ["mode"]);
    const pid = readNumber(record, ["pid"]);
    const elapsed = readNumber(record, ["elapsed_s"]);
    out.push({
      pid: pid != null && pid > 0 ? Math.round(pid) : null,
      tracked: readBoolean(record, ["tracked"]) === true,
      runId: token("run_id"),
      taskId: token("task_id"),
      mode: mode && SESSION_MODES.has(mode) ? (mode as CodexSession["mode"]) : null,
      startedAt: readString(record, ["started_at"]),
      elapsedS: elapsed != null && elapsed >= 0 ? elapsed : null,
    });
  }
  return out;
}

const SESSION_MODE_LABEL: Record<string, string> = {
  write: "пишет (workspace-write)",
  read_only: "ревью read-only",
  bypass: "без песочницы – нарушение правила",
  other: "режим не определён",
};

function elapsedLabel(seconds: number | null): string {
  if (seconds == null || !Number.isFinite(seconds)) return NO_DATA;
  const minutes = Math.max(0, Math.floor(seconds / 60));
  if (minutes < 1) return "идёт меньше минуты";
  if (minutes < 60) return `идёт ${minutes} мин`;
  const hours = Math.floor(minutes / 60);
  return `идёт ${hours} ч ${String(minutes % 60).padStart(2, "0")} мин`;
}

function codexSessionViews(sessions: CodexSession[], tasks: CompanyTask[], now: number): ExecutorSessionView[] {
  return sessions.map((session, index) => {
    const task = session.taskId
      ? tasks.find((item) => item.id === session.taskId || (item.id ?? "").startsWith(session.taskId ?? "\u0000")) ?? null
      : null;
    const startedMs = parseInstant(session.startedAt);
    const elapsedS = startedMs != null ? Math.max(session.elapsedS ?? 0, (now - startedMs) / 1000) : session.elapsedS;
    const shortId = session.taskId ? (/^[0-9a-f]{8}-/.test(session.taskId) ? session.taskId.slice(0, 8) : session.taskId) : null;
    return {
      key: `${session.pid ?? "p"}:${session.runId ?? index}`,
      task: shortId
        ? `Задача ${shortId}${task ? ` («${clip(task.title, 80)}»)` : ""}`
        : "Задача не определена",
      taskId: session.taskId,
      taskHref: task ? issueHref(task.githubIssueNumber) : null,
      mode: session.mode ? SESSION_MODE_LABEL[session.mode] : "режим не определён",
      started: session.startedAt ? `${formatDateTime(session.startedAt)} МСК` : NO_DATA,
      elapsed: elapsedLabel(elapsedS),
      registration: session.runId
        ? `запуск ${session.runId}`
        : `без регистрации запуска${session.pid ? ` (pid ${session.pid})` : ""}`,
    };
  });
}

/**
 * Codex card from the real CLI probe (9a63f86e rework). Connection only from a fresh probe; occupancy only
 * from real sessions (codex exec processes or a live tracked run). Core tasks/runs that name Codex are assignments, not occupancy.
 */
function codexFromCliProbe(probe: CodexCliProbe, now: number): {
  connection: ConnectionState;
  occupancy: OccupancyState;
  connectionSource: string;
} | null {
  if (probe.status === "absent") return null;
  const at = probe.checkedAt ? `${formatDateTime(probe.checkedAt)} МСК` : NO_DATA;
  const checkedMs = parseInstant(probe.checkedAt);
  const fresh = probe.status !== "stale" && checkedMs != null && now - checkedMs <= CODEX_PROBE_STALE_MS;
  if (probe.status === "verified" && fresh) {
    const parts = [
      probe.chatgptAuthorized === true ? "Авторизован в ChatGPT" : null,
      probe.cliAvailable === true ? `CLI доступен${probe.cliVersion ? ` (${probe.cliVersion})` : ""}` : null,
      `Проверено в ${at}`,
    ].filter(Boolean);
    return {
      connection: "verified",
      occupancy: probe.busy ? "working" : "free",
      connectionSource: `${parts.join(" · ")}. Проба Codex CLI${probe.transport === "ssh" ? " по SSH" : ""} в Company Core.`,
    };
  }
  if (probe.status === "failed" && fresh) {
    return {
      connection: "unavailable",
      // A failed login check does not hide codex exec processes the fresh probe saw running.
      occupancy: probe.sessions.length > 0 ? "working" : "unknown",
      connectionSource: `Недоступен. ${probe.reason ?? "Проба Codex CLI завершилась ошибкой."} Проверено в ${at}.`,
    };
  }
  return {
    connection: "stale",
    occupancy: "unknown",
    connectionSource: `Нет свежей проверки. Последняя проба Codex CLI: ${at}.`,
  };
}

export function parseCompanyStatus(raw: unknown): CompanyStatus | null {
  const record = asRecord(raw);
  if (!record) return null;
  const generatedAt = readString(record, CORE_FIELD_MAP.root.generatedAt);
  if (!generatedAt) return null;
  const hasTaskArray = CORE_FIELD_MAP.root.tasks.some((key) => Array.isArray(record[key]))
    || CORE_FIELD_MAP.root.activeTasks.some((key) => Array.isArray(record[key]))
    || CORE_FIELD_MAP.root.taskHistory.some((key) => Array.isArray(record[key]));
  if (!hasTaskArray) return null;
  if ("agents" in record && !Array.isArray(record.agents)) return null;
  const taskLists = [
    listFrom(record, CORE_FIELD_MAP.root.tasks),
    listFrom(record, CORE_FIELD_MAP.root.activeTasks),
    listFrom(record, CORE_FIELD_MAP.root.taskHistory),
  ];
  const quotas = namedRecord(record, CORE_FIELD_MAP.root.quotas[0]);
  const costs = parseQuotaBucket(readStored(record, CORE_FIELD_MAP.root.costs));
  const tasks = attachRuns(mergeTasks(taskLists), listFrom(record, CORE_FIELD_MAP.root.executiveRuns));
  const events = dedupeEvents([
    ...listFrom(record, CORE_FIELD_MAP.root.events)
      .map((event) => parseEvent(event))
      .filter((event): event is CompanyEvent => event !== null),
    ...tasks.flatMap((task) => task.taskEvents),
  ]);
  let completeness = parseCompleteness(record);
  if (tasks.some((task) => task.eventsComplete === false) && completeness.eventsComplete == null) {
    completeness = { ...completeness, eventsComplete: false };
  }
  const tasksPage = asRecord(readStored(record, CORE_FIELD_MAP.root.tasksPage));
  const acceptanceViewToken = normalizeToken(tasksPage ? readString(tasksPage, ["acceptance_view"]) ?? "" : "");
  const acceptanceView =
    acceptanceViewToken === "current" || acceptanceViewToken === "archive" || acceptanceViewToken === "all"
      ? acceptanceViewToken
      : null;
  return {
    generatedAt,
    tasks,
    agents: listFrom(record, CORE_FIELD_MAP.root.agents)
      .map((agent) => parseAgent(agent))
      .filter((agent): agent is CompanyAgent => agent !== null),
    heartbeats: listFrom(record, CORE_FIELD_MAP.root.heartbeats)
      .map((heartbeat) => parseHeartbeat(heartbeat))
      .filter((heartbeat): heartbeat is CompanyHeartbeat => heartbeat !== null),
    events,
    executorObservations: listFrom(record, CORE_FIELD_MAP.root.executors)
      .map((item) => parseExecutorObservation(item))
      .filter((item): item is ExecutorObservation => item !== null),
    currentGates: listFrom(record, CORE_FIELD_MAP.root.currentGates)
      .map((item) => parseGate(item))
      .filter((item): item is GateFact => item !== null),
    archivedBlockers: listFrom(record, CORE_FIELD_MAP.root.archivedBlockers)
      .map((item) => parseGate(item))
      .filter((item): item is GateFact => item !== null),
    completeness,
    codexFacts: parseCodexFacts("codex" in record ? record.codex : null),
    quotas: {
      codex: quotas ? parseQuotaBucket(readRaw(quotas, CORE_FIELD_MAP.quotaBucket.codex)) : null,
      cursor: quotas ? parseQuotaBucket(readRaw(quotas, CORE_FIELD_MAP.quotaBucket.cursor)) : null,
      grok: quotas ? parseQuotaBucket(readRaw(quotas, CORE_FIELD_MAP.quotaBucket.grok)) : null,
      legacySpend: costs,
    },
    acceptanceContract: tasks.some((task) => task.acceptanceContract) || acceptanceView != null,
    acceptanceView,
  };
}

function parseOffset(value: string | null | undefined): number {
  if (!value || !/^\d+$/.test(value.trim())) return 0;
  const parsed = Number(value.trim());
  if (!Number.isSafeInteger(parsed) || parsed < 0) return 0;
  return Math.min(parsed, 100_000);
}

export function parseHistoryFilters(input: {
  period?: string | null;
  status?: string | null;
  agent?: string | null;
  history_offset?: string | null;
  history_before?: string | null;
}): HistoryFilters {
  const period =
    input.period === "today" || input.period === "week" || input.period === "month"
      ? input.period
      : "all";
  const cursor = (input.history_before ?? "").trim();
  const historyBefore = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(cursor) && parseInstant(cursor) != null
    ? cursor
    : "";
  return {
    period,
    status: (input.status ?? "").trim(),
    agent: (input.agent ?? "").trim(),
    historyOffset: parseOffset(input.history_offset),
    historyBefore,
  };
}

export function companyStatusRequestPath(
  filters: HistoryFilters,
  acceptance: "current" | "archive" | "all" = "all",
): string {
  const params = new URLSearchParams();
  if (filters.historyBefore) params.set(CORE_FIELD_MAP.query.historyBefore, filters.historyBefore);
  if (acceptance === "current" || acceptance === "archive") params.set("acceptance", acceptance);
  const query = params.toString();
  return query ? `/v1/status?${query}` : "/v1/status";
}

export function historyHref(filters: HistoryFilters, patch: { historyOffset?: number; historyBefore?: string }): string {
  const params = new URLSearchParams();
  if (filters.period !== "all") params.set("period", filters.period);
  if (filters.status) params.set("status", filters.status);
  if (filters.agent) params.set("agent", filters.agent);
  const offset = patch.historyOffset ?? 0;
  if (offset > 0) params.set("history_offset", String(offset));
  if (patch.historyBefore) params.set("history_before", patch.historyBefore);
  const query = params.toString();
  return query ? `/admin/ai-company?${query}` : "/admin/ai-company";
}

function taskAliases(task: CompanyTask): string[] {
  const aliases: string[] = [];
  if (task.id) aliases.push(task.id);
  if (task.githubIssueNumber != null) aliases.push(String(task.githubIssueNumber));
  if (task.executiveRun?.runId) aliases.push(`run:${task.executiveRun.runId}`);
  return aliases;
}

function eventTaskRefs(event: CompanyEvent): string[] {
  const refs: string[] = [];
  if (event.taskId) refs.push(event.taskId);
  if (event.runId) refs.push(`run:${event.runId}`);
  const payloadTask = payloadText(event.payload, ["task_id", "company_task_id"]);
  if (payloadTask) refs.push(payloadTask);
  const payloadRun = payloadText(event.payload, ["run_id", "executive_run_id"]);
  if (payloadRun) refs.push(`run:${payloadRun}`);
  return refs;
}

function eventMatchesTask(event: CompanyEvent, task: CompanyTask): boolean {
  const aliases = taskAliases(task);
  if (eventTaskRefs(event).some((ref) => aliases.includes(ref))) return true;
  if (task.githubIssueNumber == null || !event.payload) return false;
  return readNumber(event.payload, ["github_issue_number", "issue_number"]) === task.githubIssueNumber;
}

function linkedEvents(task: CompanyTask, events: CompanyEvent[]): CompanyEvent[] {
  return events
    .filter((event) => eventMatchesTask(event, task))
    .slice()
    .sort((left, right) => (parseInstant(left.createdAt) ?? 0) - (parseInstant(right.createdAt) ?? 0));
}

function findTaskByReference(tasks: CompanyTask[], reference: string): CompanyTask | null {
  return (
    tasks.find((task) => task.id === reference) ??
    tasks.find((task) => task.githubIssueNumber != null && String(task.githubIssueNumber) === reference) ??
    null
  );
}

export function resolveCurrentTask(agent: CompanyAgent | null, tasks: CompanyTask[]): CompanyTask | null {
  if (!agent) return null;
  if (agent.currentTaskId) return findTaskByReference(tasks, agent.currentTaskId);
  const open = tasks.filter(
    (task) => task.producerAgentSlug === agent.slug && !isCompletedStatus(task.status) && !taskIsClosed(task, []),
  );
  return open.length === 1 ? open[0] : null;
}

function latestInstant(values: Array<string | null>): string | null {
  let latest: string | null = null;
  let latestAt = Number.NEGATIVE_INFINITY;
  for (const candidate of values) {
    const parsed = parseInstant(candidate);
    if (parsed != null && parsed >= latestAt) {
      latest = candidate;
      latestAt = parsed;
    }
  }
  return latest;
}

function isFresh(at: string | null, now: number): boolean {
  const observed = parseInstant(at);
  if (observed == null) return false;
  return now - observed <= HEARTBEAT_STALE_MS;
}

function freshnessLabel(heartbeatAt: string | null, now: number): string {
  const observed = parseInstant(heartbeatAt);
  if (observed == null) return NO_DATA;
  const when = formatDateTime(heartbeatAt);
  if (now - observed > HEARTBEAT_STALE_MS) return `данные устарели: сигнал старше 60 минут (${when} МСК)`;
  return `свежие: сигнал моложе 60 минут (${when} МСК)`;
}

function taskReceipt(task: CompanyTask, events: CompanyEvent[]): Receipt | null {
  if (parseInstant(task.receivedAt) != null && task.receivedAt) return { at: task.receivedAt, kind: "received" };
  const linked = linkedEvents(task, events);
  const intake = linked.find(
    (event) => RECEIPT_EVENT_TYPES.has(normalizeToken(event.bareType)) && parseInstant(event.createdAt) != null,
  );
  if (intake?.createdAt) return { at: intake.createdAt, kind: "received" };
  for (const event of linked) {
    const fromPayload = payloadText(event.payload, ["received_at", "intake_at"]);
    if (parseInstant(fromPayload) != null && fromPayload) return { at: fromPayload, kind: "received" };
  }
  if (parseInstant(task.createdAt) != null && task.createdAt) return { at: task.createdAt, kind: "created" };
  return null;
}

function startedAt(task: CompanyTask | null, events: CompanyEvent[]): string | null {
  if (!task) return null;
  if (parseInstant(task.startedAt) != null) return task.startedAt;
  const started = linkedEvents(task, events).find((event) => START_EVENT_TYPES.has(normalizeToken(event.bareType)));
  return started?.createdAt ?? null;
}

function completionInstant(task: CompanyTask, events: CompanyEvent[]): string | null {
  if (parseInstant(task.completedAt) != null && task.completedAt) return task.completedAt;
  const completions = linkedEvents(task, events).filter(
    (event) => COMPLETION_EVENT_TYPES.has(normalizeToken(event.bareType)) && parseInstant(event.createdAt) != null,
  );
  return completions[completions.length - 1]?.createdAt ?? null;
}

function joinFound(values: Array<string | null | undefined>): string {
  const unique = [...new Set(values.filter((value): value is string => Boolean(value)))];
  return unique.length ? unique.join("; ") : NO_DATA;
}

function eventLine(event: CompanyEvent): string {
  const extra = safePayloadSummary(event.payload);
  const prefix = event.channelPrefix ? `${event.channelPrefix}:` : "";
  const base = `${formatDateTime(event.createdAt)} · ${prefix}${event.bareType} · ${event.agentSlug ?? "система"}`;
  return extra ? `${base} · ${extra}` : base;
}

function isReturnEvent(event: CompanyEvent): boolean {
  const type = normalizeToken(event.bareType);
  if (type.includes("return") || type.includes("request_changes")) return true;
  const verdict = payloadText(event.payload, ["verdict", "qa_status", "status"]);
  if (!verdict) return false;
  const normalized = normalizeToken(verdict);
  return normalized === "return" || normalized === "request_changes" || normalized === "qa_fail";
}

function isResultEvent(event: CompanyEvent): boolean {
  if (RESULT_EVENT_TYPES.has(normalizeToken(event.bareType))) return true;
  return Boolean(payloadText(event.payload, ["result", "outcome", "summary", "pr_url", "pull_request_url", "draft_pr"]));
}

function isWorkEvent(event: CompanyEvent): boolean {
  if (event.channelPrefix) {
    const bare = normalizeToken(event.bareType);
    if (bare === "heartbeat" || bare === "ping") return false;
    return true;
  }
  return WORK_EVENT_TYPES.has(normalizeToken(event.bareType));
}

function qaLabel(task: CompanyTask | null, events: CompanyEvent[]): string {
  const fromEvents = events
    .filter((event) => normalizeToken(event.bareType).includes("qa") || payloadText(event.payload, ["verdict", "qa_status"]))
    .map((event) => eventLine(event));
  if (fromEvents.length) return fromEvents.join("\n");
  if (task && normalizeToken(task.status) === "qa_pass") return "PASS";
  if (task && normalizeToken(task.status) === "qa_fail") return "FAIL";
  return NO_DATA;
}

function evidenceRecord(value: unknown): Record<string, unknown> | null {
  return asRecord(value);
}

function evidenceStatus(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  return readString(evidenceRecord(value), CORE_FIELD_MAP.evidence.status);
}

function evidenceSha(value: unknown): string | null {
  return readString(evidenceRecord(value), CORE_FIELD_MAP.evidence.sha);
}

function isPass(value: unknown): boolean {
  const status = evidenceStatus(value);
  if (status == null) return false;
  const token = normalizeToken(status);
  return PASS_TOKENS.has(token) || token === "independent_pass";
}

function shaEqual(left: string | null, right: string | null): boolean {
  if (!left || !right) return false;
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

function engineeringPanel(task: CompanyTask, events: CompanyEvent[]): EngineeringPanel {
  const run = task.executiveRun;
  const headSha = run?.headSha ?? null;
  const ciValue = run?.ci ?? events.map((event) => event.payload?.ci_status ?? event.payload?.ci).find((value) => value != null);
  const reviewValue = run?.independentReview ?? null;
  const deployValue = run?.deploy ?? null;
  const productionValue = run?.productionProof ?? null;
  const verifiedFlag = typeof run?.productionVerified === "boolean" ? run.productionVerified : null;
  const applies = task.resultKind === "engineering";
  const reviewSha = run?.reviewSha ?? evidenceSha(reviewValue);
  const reviewPass = isPass(reviewValue) && shaEqual(reviewSha, headSha);
  const ciPass = isPass(ciValue) || ["success", "green", "pass"].includes(normalizeToken(evidenceStatus(ciValue) ?? ""));
  const deployPass = isPass(deployValue) || ["deployed", "success"].includes(normalizeToken(evidenceStatus(deployValue) ?? ""));
  const proof = evidenceRecord(productionValue);
  const proofHasContractShape = proof != null && ("verified" in proof || "sha" in proof);
  const proofVerified = proof ? readBoolean(proof, CORE_FIELD_MAP.evidence.verified) : null;
  const proofSha = proof ? readString(proof, CORE_FIELD_MAP.evidence.sha) : null;
  const proofMatchesHead = Boolean(proofSha) && shaEqual(proofSha, headSha);
  const productionPass = verifiedFlag === false
    ? false
    : proofHasContractShape
      ? proofVerified === true && proofMatchesHead
      : verifiedFlag === true
        ? false
        : isPass(productionValue);
  const productionUrl = safeProductionUrl(readString(proof, CORE_FIELD_MAP.evidence.url));

  let reviewLabel = NO_DATA;
  if (reviewValue != null) {
    if (!headSha) reviewLabel = "SHA головы нет в источнике, точное совпадение не подтверждено";
    else if (!reviewSha) reviewLabel = `вердикт ${evidenceStatus(reviewValue) ?? NO_DATA}, SHA проверки нет`;
    else if (!shaEqual(reviewSha, headSha)) reviewLabel = `проверка другого SHA ${reviewSha}, голова ${headSha}`;
    else if (run?.mergeSha) {
      reviewLabel = `SHA проверки ${headSha}. SHA выпуска ${run.mergeSha} сохранён отдельно, связь проверки с выпуском не подтверждена`;
    } else reviewLabel = `SHA ${headSha}: ${evidenceStatus(reviewValue) ?? NO_DATA}`;
  }

  const ciLabel = ciValue == null ? NO_DATA : `${evidenceStatus(ciValue) ?? "есть запись"}`;
  const deployLabel = deployValue == null ? NO_DATA : `${evidenceStatus(deployValue) ?? "есть запись"}`;
  const productionFact = productionValue == null && verifiedFlag == null
    ? null
    : verifiedFlag === false
      ? "сохранено: production_verified = false"
      : proofHasContractShape
        ? joinFound([
            proofVerified === true ? "proof подтверждён" : "proof не подтверждён",
            proofSha && headSha && !proofMatchesHead ? `SHA proof ${proofSha} не совпадает с головой ${headSha}` : proofSha,
            formatDateTime(readString(proof, CORE_FIELD_MAP.evidence.at)),
            readString(proof, CORE_FIELD_MAP.evidence.source),
          ])
        : verifiedFlag === true
          ? "production_verified без сохранённого proof"
          : joinFound([
              evidenceStatus(productionValue),
              productionUrl,
              formatDateTime(readString(proof, CORE_FIELD_MAP.evidence.at)),
            ]);
  let productionLabel = NO_DATA;
  if (task.resultKind === "document") productionLabel = "не требуется для этого типа результата";
  else if (task.resultKind === "unknown") {
    productionLabel = productionFact ?? "тип результата не указан, production-проверка не подставлена";
  } else productionLabel = productionFact ?? NO_DATA;

  return {
    ci: ciLabel,
    independentReview: reviewLabel,
    deploy: deployLabel,
    production: productionLabel,
    dodSatisfied: applies && ciPass && reviewPass && deployPass && productionPass,
    applies,
    deployPassed: deployPass,
    productionPassed: productionPass,
  };
}

function formatProgress(progress: VerifiedProgress | null, dodSatisfied: boolean): string {
  if (!progress) return "прогресс пока не измерен";
  const fraction = `${progress.done} из ${progress.total}`;
  const percent =
    progress.done === progress.total
      ? dodSatisfied
        ? " (100%)."
        : " Критерий готовности этого типа результата не подтверждён, 100% не ставится."
      : "";
  const formula = progress.formula ? `Формула: ${clip(progress.formula, 240)}.` : "Формула: нет данных.";
  const evidence = `Свидетельство: ${formatDateTime(progress.evidenceAt)}.`;
  return `${fraction}.${percent} ${formula} ${evidence}`.replace(/\s+/g, " ").trim();
}

/** Core terminal task statuses (company-core TERMINAL_TASK_STATUSES). */
const TERMINAL_TASK_STATUSES = new Set(["done", "accepted", "completed", "cancelled", "canceled", "failed"]);
/** Waiting for an owner decision that is not result acceptance: «Нужно решение», not «Выполняется». */
const DECISION_TASK_STATUSES = new Set(["human_gate", "needs_decision", "blocked"]);

function isDecisionTask(task: CompanyTask): boolean {
  return DECISION_TASK_STATUSES.has(normalizeToken(task.status));
}

function ownerPlacement(task: CompanyTask): "plan" | "review" | "archive" | "closed" | "cycle" {
  // The server decides the plan tab: a planned or waiting task is not work and holds no capacity.
  if (task.boardTab === "plan") return "plan";
  const acceptance = task.ownerAcceptance;
  if (acceptance?.applicable && acceptance.state === "accepted") return "archive";
  // Core 7a6fc09c: a Core that sends board_tab is the source of truth for «Архив». A terminal task
  // (done / accepted / cancelled ...) is closed even when an older Core still tags it working or review:
  // it is never shown as executing work or as an open acceptance request.
  if (task.boardTab === "archive" || (task.boardTab != null && TERMINAL_TASK_STATUSES.has(normalizeToken(task.status)))) {
    return "closed";
  }
  if (!acceptance?.applicable) return "cycle";
  if (acceptance.state === "pending" && acceptance.presented) {
    // «Приёмка» only with real evidence. A Core that sends board_tab says when evidence is missing
    // (a bare pull request): the task stays in work. An older Core without board_tab keeps the old rule.
    return task.boardTab != null && task.boardTab !== "review" ? "cycle" : "review";
  }
  return "cycle";
}

function taskIsClosed(task: CompanyTask, events: CompanyEvent[]): boolean {
  if (task.ownerAcceptance?.applicable && task.ownerAcceptance.state === "rejected") return false;
  if (isPilotTask(task) && codexReadinessBlocked(task)) return false;
  if (CANCELLED_STATUSES.has(normalizeToken(task.status))) return false;
  const panel = engineeringPanel(task, events);
  if (task.resultKind === "engineering") return panel.dodSatisfied;
  if (isCompletedStatus(task.status)) return true;
  return completionInstant(task, events) != null;
}

function isPilotTask(task: CompanyTask): boolean {
  const blob = `${task.title} ${task.status} ${task.source ?? ""}`.toLowerCase();
  return blob.includes("pilot") || blob.includes("пилот");
}

function codexReadinessBlocked(task: CompanyTask): boolean {
  return task.dependencies.some((item) => item.codexReadiness && item.blocked);
}

function outcomeLabel(task: CompanyTask, events: CompanyEvent[], codexDisconnected: boolean): string {
  if (isPilotTask(task) && (codexDisconnected || codexReadinessBlocked(task))) {
    return "Пилот не отмечен успешным: Codex не подключён";
  }
  const panel = engineeringPanel(task, events);
  if (task.resultKind === "engineering") {
    return panel.dodSatisfied
      ? "Критерий готовности инженерной задачи подтверждён"
      : "Критерий готовности инженерной задачи не подтверждён";
  }
  if (isCompletedStatus(task.status)) {
    return task.resultKind === "document"
      ? "Выполнено по критерию документа или исследования"
      : "Выполнено. Тип результата не указан, production-проверка не подставлена";
  }
  return NO_DATA;
}

function stageLabel(task: CompanyTask): string {
  if (isPilotTask(task) && codexReadinessBlocked(task)) {
    return "Пилот не отмечен успешным: Codex не подключён";
  }
  if (task.stage) return clip(task.stage, 180);
  return taskStatusLabel(task.status);
}

function ownerLabel(value: string | null): "Oriy" | "Сергей" | null {
  if (!value) return null;
  const token = normalizeToken(value);
  if (["sergey", "сергей", "founder", "сергея"].includes(token)) return "Сергей";
  if (["oriy", "орий", "orchestrator", "оркестратор"].includes(token)) return "Oriy";
  return null;
}

function isReroute(text: string): boolean {
  return /переназнач|reroute|reassign|смен(ить|а)\s+исполнител/i.test(text);
}

function isCodexReadinessText(text: string): boolean {
  const blob = text.toLowerCase();
  return blob.includes("codex") && (blob.includes("readiness") || blob.includes("готовност") || blob.includes("не подключ") || blob.includes("not connected"));
}

function gateFromTask(task: CompanyTask): GateFact | null {
  if (task.gateArchived) return null;
  const legacyOwner = ownerLabel(task.humanGate);
  const reason = task.blockedReason
    || (isGate(task.humanGate)
      ? legacyOwner
        ? `Ручное разрешение (Human Gate): ${legacyOwner}`
        : task.humanGate
      : null);
  const dependency = task.dependencies.find((item) => item.blocked);
  // A human_gate / needs_decision / blocked task is never silently dropped from «Нужно решение».
  const statusReason = isDecisionTask(task) ? `Нужно решение: ${taskStatusLabel(task.status)}` : null;
  if (!reason && !dependency && !statusReason) return null;
  return {
    id: task.id,
    taskId: task.id,
    reason: reason ?? dependency?.text ?? statusReason,
    decisionOwner: task.decisionOwner ?? (legacyOwner ? task.humanGate : null),
    request: task.gateRequest,
    nextAction: task.gateNextAction,
    archived: false,
    kind: dependency?.codexReadiness ? "readiness" : null,
    target: dependency?.target ?? (dependency?.codexReadiness ? "codex" : null),
  };
}

function explainGateReason(reason: string): string {
  const token = reason.trim().toLowerCase();
  if (token.includes("missing execution context")) {
    return "Нет сохранённого контекста исполнения: не записано, кто вёл задачу и на каком шаге она остановилась.";
  }
  if (token.includes("production proof pending")) {
    return "Production-проверка ещё не сохранена. По этой фразе задача не считается закрытой.";
  }
  return clip(reason);
}

function isCredentialGate(gate: GateFact, text: string): boolean {
  const blob = `${text} ${gate.id ?? ""} ${gate.kind ?? ""} ${gate.target ?? ""}`.toLowerCase();
  return (
    blob.includes("codex_access_token") ||
    blob.includes("access_token") ||
    blob.includes("новый доступ") ||
    blob.includes("new access") ||
    normalizeToken(gate.kind ?? "") === "credential"
  );
}

function presentGate(gate: GateFact, tasks: CompanyTask[], codexFallback: string | null): GateCard | null {
  const task = gate.taskId ? findTaskByReference(tasks, gate.taskId) : null;
  const reasonSource = gate.reason ?? task?.blockedReason ?? task?.humanGate;
  if (!reasonSource || !isGate(reasonSource)) return null;
  const reason = explainGateReason(reasonSource);
  const request = gate.request ? clip(gate.request) : NO_DATA;
  const combined = `${reasonSource} ${request} ${gate.nextAction ?? ""} ${gate.kind ?? ""} ${gate.target ?? ""}`;
  const credential = isCredentialGate(gate, combined);
  const asksReroute = isReroute(combined);
  const decisionOwner = ownerLabel(gate.decisionOwner) ?? NO_DATA;
  let nextAction = gate.nextAction ? clip(gate.nextAction) : NO_DATA;
  let shownRequest = request;
  if (!credential && asksReroute) {
    nextAction = codexFallback
      ? `Запасного исполнителя выбирает Oriy: ${codexFallback}. Переназначение от Сергея не требуется.`
      : "Запасного исполнителя выбирает Oriy. Переназначение от Сергея не требуется.";
    shownRequest = "Просьба Сергею переназначить задачи не показывается.";
  }
  const freshnessAt = task?.lastEventAt ?? task?.receivedAt ?? null;
  const freshness = freshnessAt ? `Свежесть: ${formatDateTime(freshnessAt)} МСК` : "Свежесть: нет данных";
  return {
    key: gate.id ?? `${gate.taskId ?? "gate"}-${reason.slice(0, 40)}`,
    taskTitle: task?.title ?? gate.taskId ?? "Задача не сопоставлена",
    reason,
    freshness,
    decisionOwner,
    request: shownRequest,
    nextAction,
    historical: gate.archived,
    copyText: "",
    taskId: task?.id ?? null,
    lifecycle: task && !gate.archived ? lifecycleView(task) : null,
    ownerComments: ownerCommentViews(task),
  };
}

function codexDisconnectedFrom(status: CompanyStatus): boolean {
  const facts = status.codexFacts;
  if (facts) {
    if (facts.authenticated === false) return true;
    const connection = normalizeToken(facts.connection ?? "");
    if (NOT_CONNECTED_STATUSES.has(connection)) return true;
    if (facts.connection) return false;
  }
  if (status.tasks.some((task) => task.dependencies.some((item) => item.codexReadiness && item.blocked))) return true;
  return status.currentGates.some((gate) => {
    const blob = `${gate.reason ?? ""} ${gate.kind ?? ""} ${gate.target ?? ""} ${gate.id ?? ""}`;
    if (isCredentialGate(gate, blob)) return false;
    return isCodexReadinessText(blob) || (normalizeToken(gate.kind ?? "") === "readiness" && (gate.target ?? "").toLowerCase().includes("codex"));
  });
}

function connectionCopy(state: ConnectionState): string {
  if (state === "verified") return "проверено";
  if (state === "unavailable") return "недоступно";
  if (state === "check_failed") return "не удалось проверить";
  if (state === "stale") return "данные устарели";
  return "нет данных";
}

function occupancyCopy(state: OccupancyState): string {
  if (state === "working") return "выполняет задачу";
  if (state === "waiting") return "ожидает";
  if (state === "free") return "свободен";
  return "занятость неизвестна";
}

const ONLINE_STATUSES = new Set(["online", "ok", "working", "busy", "free", "idle", "available", "waiting", "connected", "verified"]);

/**
 * Connection = result of a real check with a timestamp. A provider record, an empty heartbeat or a
 * missing timestamp is «нет данных», never «не подключён» (9a63f86e).
 */
export function deriveConnection(input: {
  explicit: string | null;
  checkedAt: string | null;
  now: number;
  /** The explicit «not connected» comes from a check of a different access path (e.g. API token for a CLI runner). */
  checkPathMismatch?: boolean;
}): ConnectionState {
  const explicit = input.explicit ? normalizeToken(input.explicit) : "";
  const checked = parseInstant(input.checkedAt) != null;
  if (NOT_CONNECTED_STATUSES.has(explicit) || ["error", "failed", "unavailable"].includes(explicit)) {
    if (input.checkPathMismatch) return "check_failed";
    return checked ? "unavailable" : "no_data";
  }
  if (["check_failed", "unverified"].includes(explicit)) return "check_failed";
  if (!checked) return "no_data";
  if (!isFresh(input.checkedAt, input.now)) return "stale";
  if (!explicit || ONLINE_STATUSES.has(explicit)) return "verified";
  if (["stale", "no_fresh_data"].includes(explicit)) return "stale";
  return "no_data";
}

function quotaTrustworthy(bucket: QuotaBucket | null): boolean {
  return Boolean(bucket?.source) && bucket?.trustworthy === true;
}

function formatQuotaValue(bucket: QuotaBucket | null): string {
  if (!quotaTrustworthy(bucket) || !bucket) return NO_DATA;
  if (bucket.remaining == null && bucket.includedLimit == null && bucket.includedUsed == null) return NO_DATA;
  const limit = bucket.includedLimit ?? NO_DATA;
  const reset = formatDateTime(bucket.resetsAt);
  if (bucket.remaining != null) {
    return `Остаток: ${bucket.remaining} из ${limit}. Сброс: ${reset}. Источник: ${bucket.source}. Это remaining, не расход и не included used.`;
  }
  return `Подтверждённый расход included: ${bucket.includedUsed ?? NO_DATA} из ${limit}. Сброс: ${reset}. Источник: ${bucket.source}. Поле remaining в ответе нет.`;
}

function legacySpendLabel(bucket: QuotaBucket | null): string {
  if (!bucket?.source || bucket.confirmed !== true || bucket.spendUsd == null) return NO_DATA;
  return `Зафиксированный расход $${bucket.spendUsd}. Источник: ${bucket.source}. Это не остаток лимита и не признак бесплатной работы.`;
}

function boundaryText(status: CompanyStatus): { active: string; history: string } {
  const completeness = status.completeness;
  const activeNotes: string[] = [];
  const historyNotes: string[] = [];
  if (completeness.activeTasksTruncated === true || completeness.activeTasksComplete === false) {
    activeNotes.push("Источник сообщил, что список активных задач обрезан.");
  } else if (completeness.activeTasksComplete == null && status.tasks.length === (completeness.tasksLimit ?? LEGACY_TASK_CAP)) {
    activeNotes.push(
      `В ответе ${status.tasks.length} задач — это совпадает с известным пределом среза. Полнота активных задач не подтверждена.`,
    );
  } else if (completeness.activeTasksComplete === true) {
    activeNotes.push("Источник подтвердил полноту активных задач.");
  }
  if (completeness.gatesComplete === false) {
    activeNotes.push("Источник сообщил, что список текущих решений обрезан.");
  }
  if (completeness.eventsTruncated === true || completeness.eventsComplete === false) {
    activeNotes.push("Источник сообщил, что лента событий обрезана.");
  } else if (completeness.eventsComplete == null && status.events.length === (completeness.eventsLimit ?? LEGACY_EVENT_CAP)) {
    activeNotes.push(
      `В ответе ${status.events.length} событий — это совпадает с известным пределом среза. Полнота ленты не подтверждена.`,
    );
  }
  if (completeness.historyTruncated === true || completeness.historyComplete === false) {
    historyNotes.push("Источник сообщил, что история обрезана. Ниже только полученный срез и страницы этого среза.");
  } else if (completeness.historyComplete === true) {
    historyNotes.push("Источник подтвердил полноту истории в этом ответе.");
  } else if (status.tasks.length === (completeness.tasksLimit ?? LEGACY_TASK_CAP)) {
    historyNotes.push("Полнота истории не подтверждена: срез задач выглядит ограниченным.");
  } else {
    historyNotes.push("Источник не прислал границу полноты истории.");
  }
  return {
    active: activeNotes.join(" ") || "Граница полноты активных задач не прислана.",
    history: historyNotes.join(" "),
  };
}

function withinPeriod(iso: string, nowIso: string, period: HistoryPeriod): boolean {
  if (period === "all") return true;
  const at = parseInstant(iso);
  const now = parseInstant(nowIso);
  if (at == null || now == null) return false;
  if (period === "today") return moscowDay(iso) === moscowDay(nowIso);
  const windowMs = period === "week" ? 7 * 24 * 60 * 60 * 1000 : 30 * 24 * 60 * 60 * 1000;
  return at <= now && now - at <= windowMs;
}

function statusMatchesFilter(task: CompanyTask, filter: string): boolean {
  if (!filter) return true;
  const query = normalizeToken(filter);
  if (normalizeToken(task.status) === query) return true;
  return normalizeToken(taskStatusLabel(task.status)).includes(query);
}

function agentMatches(filter: string, slug: string | null): boolean {
  if (!filter) return true;
  if (!slug) return false;
  if (slug === filter) return true;
  return filter === "marketing" && slug.includes("marketing");
}

function buildRoleFilterOptions(tasks: CompanyTask[], selected: string): Array<{ value: string; label: string }> {
  const seen = new Set<string>();
  for (const task of tasks) {
    const slug = task.producerAgentSlug?.trim();
    if (slug) seen.add(slug);
  }
  if (selected) seen.add(selected);
  return [...seen].sort().map((value) => ({ value, label: roleLabel(value) }));
}

function sameMoscowDay(value: string | null, snapshot: string): boolean {
  if (!value) return false;
  return moscowDay(value) === moscowDay(snapshot);
}

function taskExecutor(task: CompanyTask): { id: ExecutorId | null; note: string } {
  const id = classifyExecutor(task.executorParts);
  const model = task.executiveRun?.model ?? task.executorParts.find((part) => part != null && /grok|xai/i.test(part)) ?? null;
  const executive = task.executorParts.some((part) => part != null && /\bexecutive\b/i.test(part));
  const note =
    id === "cursor" && model && /grok|xai/i.test(model)
      ? "Модель Grok внутри Cursor – это исполнитель Cursor, не отдельный запуск xAI."
      : executive && id === "grok"
        ? "Поле executive – оркестрация, не фактический исполнитель."
        : "";
  return { id, note };
}

function fallbackName(tasks: CompanyTask[]): string | null {
  for (const task of tasks) {
    const id = classifyExecutor([task.fallbackExecutor]);
    if (id) return executorDisplayName(id);
    if (task.fallbackExecutor) return clip(task.fallbackExecutor, 80);
  }
  return null;
}

function hasActivity(task: CompanyTask, events: CompanyEvent[]): boolean {
  if (ACTIVE_STATUSES.has(normalizeToken(task.status))) return true;
  if (task.startedAt || task.executiveRun || task.lastEventText) return true;
  return linkedEvents(task, events).some(isWorkEvent);
}

const REVIEW_STATUSES = new Set(["review", "in_review", "code_review", "qa", "qa_pass", "qa_fail"]);
const CANCELLED_STATUSES = new Set(["cancelled", "canceled", "abandoned", "отменена"]);
const DISPATCH_TOKENS = new Set(["executive_dispatched", "dispatched"]);

function isDeployAsk(text: string): boolean {
  return /деплоим|деплой|\bdeploy\b/i.test(text);
}

function taskIsMerged(task: CompanyTask): boolean {
  if (normalizeToken(task.status) === "merged") return true;
  if (task.merged === true || task.executiveRun?.merged === true) return true;
  return false;
}

function isDispatchSignal(task: CompanyTask, events: CompanyEvent[]): boolean {
  if (DISPATCH_TOKENS.has(normalizeToken(task.status))) return true;
  const latest = linkedEvents(task, events).at(-1);
  if (latest && DISPATCH_TOKENS.has(normalizeToken(latest.bareType))) return true;
  const text = normalizeToken(task.lastEventText ?? "");
  return DISPATCH_TOKENS.has(text) || text.startsWith("executive_dispatched");
}

function gatesForTask(task: CompanyTask, gates: GateFact[]): GateFact[] {
  const aliases = new Set(taskAliases(task));
  return gates.filter((gate) => !gate.archived && gate.taskId != null && aliases.has(gate.taskId));
}

function isTechnicalHoldGate(gate: GateFact): boolean {
  const reason = gate.reason ?? "";
  if (/production proof pending/i.test(reason)) return true;
  return isDeployAsk(reason) && !isCredentialGate(gate, reason);
}

function decisionStage(task: CompanyTask, gates: GateFact[]): StageBadge | null {
  const own = gateFromTask(task);
  const gate = [...gatesForTask(task, gates), ...(own ? [own] : [])].find(
    (item) => item.reason && !isTechnicalHoldGate(item),
  );
  if (!gate?.reason) return null;
  const owner = ownerLabel(gate.decisionOwner);
  const reason = clip(explainGateReason(gate.reason), 180);
  if (owner) return { label: "Нужно решение", tone: "decision", detail: `${owner}: ${reason}` };
  return { label: "Заблокирована", tone: "blocked", detail: `Нет данных: ${reason}` };
}

function releaseDetail(task: CompanyTask): string {
  const hold = task.releaseHold?.trim() ?? "";
  if (hold && !isDeployAsk(hold) && !/not_deployed|merged_not_deployed/i.test(hold)) return clip(hold, 180);
  return "Слито в main. Выпуск на сайт не подтверждён.";
}

function deployStatusToken(task: CompanyTask): string {
  return normalizeToken(evidenceStatus(task.executiveRun?.deploy) ?? "");
}

function awaitsRelease(task: CompanyTask, panel: EngineeringPanel): boolean {
  const token = deployStatusToken(task);
  if (token.startsWith("merged_not_deployed") || token.includes("not_deployed")) return true;
  return taskIsMerged(task) && !panel.deployPassed;
}

function newestInstant(values: Array<string | null | undefined>): string | null {
  let best: string | null = null;
  let bestAt = Number.NEGATIVE_INFINITY;
  for (const value of values) {
    const at = parseInstant(value ?? null);
    if (at == null || value == null) continue;
    if (at >= bestAt) {
      best = value;
      bestAt = at;
    }
  }
  return best;
}

function isFreshInstant(value: string | null, snapshotIso: string): boolean {
  const observed = parseInstant(value);
  const now = parseInstant(snapshotIso);
  if (observed == null || now == null) return false;
  return now - observed <= HEARTBEAT_STALE_MS;
}

function executionInstant(task: CompanyTask, events: CompanyEvent[]): string | null {
  return newestInstant([
    task.startedAt,
    task.lastEventAt,
    task.executiveRun?.lastEventAt,
    ...linkedEvents(task, events).map((event) => event.createdAt),
  ]);
}

function hasFreshExecution(task: CompanyTask, events: CompanyEvent[], snapshotIso: string): boolean {
  const progressTokens = new Set(["progress", "task_progress", "started", "working", "in_progress"]);
  const runText = normalizeToken(task.executiveRun?.lastEvent ?? "");
  if (progressTokens.has(runText) && isFreshInstant(task.executiveRun?.lastEventAt ?? null, snapshotIso)) return true;
  if (progressTokens.has(normalizeToken(task.executiveStatus ?? "")) && isFreshInstant(executionInstant(task, events), snapshotIso)) {
    return true;
  }
  return linkedEvents(task, events).some(
    (event) => progressTokens.has(normalizeToken(event.bareType)) && isFreshInstant(event.createdAt, snapshotIso),
  );
}

function staleStage(lastLabel: string, at: string | null): StageBadge {
  const when = formatDateTime(at);
  const time = when === NO_DATA ? "время не сохранено" : when;
  return {
    label: "Нет свежих данных",
    tone: "stale",
    detail: `Последняя подтверждённая стадия: ${lastLabel} · ${time}`,
  };
}

function resolveStageBadge(task: CompanyTask, events: CompanyEvent[], snapshotIso: string, gates: GateFact[]): StageBadge {
  const status = normalizeToken(task.status);
  const stageToken = normalizeToken(task.stage ?? "");
  if (CANCELLED_STATUSES.has(status)) return { label: "Отменена", tone: "cancelled", detail: null };
  const acceptance = task.ownerAcceptance;
  const launchBadge = launchStageBadge(task);
  if (launchBadge && !(acceptance?.applicable && acceptance.state !== "pending")) return launchBadge;
  if (acceptance?.applicable && acceptance.state === "accepted") {
    const when = formatDateTime(acceptance.recordedAt);
    return {
      label: "Принято",
      tone: "accepted",
      detail: when === NO_DATA ? "Приёмка владельцем сохранена. Время приёмки не передано." : `Принято ${when} МСК.`,
    };
  }
  if (acceptance?.applicable && acceptance.state === "rejected") {
    // Core #28 writes the remark into acceptance.comment and also into next_action of the same task.
    const note = acceptance.comment?.trim() || task.nextStep?.trim() || NO_DATA;
    return {
      label: "На доработке",
      tone: "rework",
      detail: `Замечание: ${note}`,
    };
  }
  if (acceptance?.applicable && acceptance.state === "pending" && acceptance.presented) {
    return {
      label: "На проверке",
      tone: "acceptance",
      detail: "Результат предъявлен. Приёмка владельцем не сохранена. Проверка в рабочей системе — отдельный факт, не приёмка.",
    };
  }
  if (isPilotTask(task) && codexReadinessBlocked(task)) {
    return {
      label: "Заблокирована",
      tone: "blocked",
      detail: "Пилот не отмечен успешным: Codex не подключён",
    };
  }
  const panel = engineeringPanel(task, events);
  const decision = decisionStage(task, gates);
  if (awaitsRelease(task, panel)) {
    const extra = decision?.detail ? ` Дополнительно: ${decision.detail}` : "";
    return { label: "Ожидает выпуска", tone: "release", detail: `Oriy: ${releaseDetail(task)}${extra}` };
  }
  if (decision) return decision;
  if (taskIsClosed(task, events)) {
    const completed = completionInstant(task, events);
    return {
      label: "Завершена",
      tone: "done",
      detail: completed ? null : "Время завершения не сохранено",
    };
  }
  if (task.resultKind !== "document" && panel.deployPassed && !panel.productionPassed) {
    return {
      label: "Проверяется на сайте",
      tone: "site",
      detail: "Выпуск записан. Проверка на сайте ещё не сохранена.",
    };
  }
  if (REVIEW_STATUSES.has(status) || REVIEW_STATUSES.has(stageToken)) {
    return { label: "На проверке", tone: "review", detail: null };
  }
  const started = parseInstant(task.startedAt) != null;
  const executedAt = executionInstant(task, events);
  const freshExecution = isFreshInstant(executedAt, snapshotIso) && (started || hasFreshExecution(task, events, snapshotIso));
  if (freshExecution) return { label: "В работе", tone: "working", detail: null };
  if (started || hasFreshExecution(task, events, snapshotIso)) {
    return staleStage("В работе", executedAt ?? task.startedAt);
  }
  if (isDispatchSignal(task, events)) {
    return isFreshInstant(executedAt, snapshotIso)
      ? { label: "В очереди", tone: "queue", detail: null }
      : staleStage("В очереди", executedAt);
  }
  if (BACKLOG_STATUSES.has(status)) return { label: "В очереди", tone: "queue", detail: null };
  if (ATTENTION_STATUSES.has(status)) {
    const owner = ownerLabel(task.decisionOwner);
    const raw = task.blockedReason?.trim() ?? "";
    const reason = raw && !isDeployAsk(raw) ? clip(raw, 180) : "Нет данных";
    if (owner && reason !== "Нет данных") return { label: "Нужно решение", tone: "decision", detail: `${owner}: ${reason}` };
    return { label: "Заблокирована", tone: "blocked", detail: `Нет данных: ${reason}` };
  }
  return staleStage("Нет данных", executedAt);
}

function snapshotCopyLabel(snapshotIso: string): string {
  const at = formatDateTime(snapshotIso);
  return at === NO_DATA ? at : `${at} МСК`;
}

function evidenceHref(task: CompanyTask): string | null {
  const proof = evidenceRecord(task.executiveRun?.productionProof);
  return safeProductionUrl(proof ? readString(proof, CORE_FIELD_MAP.evidence.url) : null);
}

function launchStageBadge(task: CompanyTask): StageBadge | null {
  const launch = task.launch;
  if (!launch) return null;
  switch (launch.state) {
    case "planned":
      return { label: "В плане", tone: "queue", detail: "Грогу не отправлена. Мощность не занята." };
    case "waiting":
      return { label: "Ожидает мощности", tone: "queue", detail: launch.waitingLabel ?? "Ждёт свободного места по лимитам работы." };
    case "admitted":
      return { label: "Допущена, не отправлена", tone: "stale", detail: "Допуск есть, передача в мост Грога ещё не подтверждена." };
    case "failed":
      return { label: "Не отправлена", tone: "blocked", detail: launch.failureLabel ?? "Причина не передана." };
    case "sent":
      return { label: "Ожидает подтверждения", tone: "stale", detail: "Передана в мост Грога. Подтверждения от исполнителя пока нет." };
    case "acked":
      return { label: "Принята Грогом, не начата", tone: "queue", detail: "Подтверждение получено. Начало исполнения ещё не зафиксировано." };
    default:
      return null;
  }
}

/** Lifecycle buttons come only from Core's allowed_actions; the board adds no rules of its own. */
export function lifecycleView(task: Pick<CompanyTask, "id" | "status" | "allowedActions" | "requiredDecision">): LifecycleView | null {
  if (!task.id || !task.status || task.allowedActions == null) return null;
  const allowed = new Set(task.allowedActions);
  const actions = LIFECYCLE_ACTIONS.filter((action) => allowed.has(action));
  const requiredDecision = task.requiredDecision?.trim() || null;
  if (!actions.length && !requiredDecision) return null;
  return { expectedStatus: task.status, actions, requiredDecision };
}

function launchView(task: CompanyTask): LaunchView | null {
  const launch = task.launch;
  if (!launch || launch.state === "none") return null;
  const canPress = launch.canLaunch || launch.retryAllowed;
  const buttonLabel = launch.retryAllowed ? "Повторить отправку" : launch.state === "waiting" ? "Ожидает места (нажать повторно)" : "В работу";
  const at = (value: string | null) => (value ? `${formatDateTime(value)} МСК` : NO_DATA);
  return {
    state: launch.state,
    label: launch.label ?? NO_DATA,
    canPress,
    buttonLabel,
    facts: [
      { label: "Запрошено", value: launch.requestedAt ? `${at(launch.requestedAt)}${launch.requestedBy ? ` · ${launch.requestedBy}` : ""}` : NO_DATA },
      { label: "Допущена к исполнению", value: at(launch.admittedAt) },
      { label: "Передана в мост Грога", value: at(launch.deliveredAt) },
      { label: "Подтверждение Грога (ACK)", value: at(launch.ackAt) },
      { label: "Начало исполнения", value: at(launch.executionStartedAt) },
      ...(launch.waitingLabel ? [{ label: "Почему ждёт", value: launch.waitingLabel }] : []),
      ...(launch.failureLabel ? [{ label: "Причина сбоя", value: launch.failureLabel }] : []),
    ],
    audit: launch.audit.length ? launch.audit.join("\n") : NO_DATA,
  };
}

function acceptanceView(task: CompanyTask): OwnerAcceptanceView | null {
  const fact = task.ownerAcceptance;
  if (!fact) return null;
  return {
    applicable: fact.applicable,
    state: fact.state,
    resultVersion: fact.resultVersion ?? NO_DATA,
    recordedAt: formatDateTime(fact.recordedAt),
    actor: fact.actor ?? NO_DATA,
    comment: fact.comment ?? NO_DATA,
    nextAction: task.nextStep ?? NO_DATA,
    productionVerified: fact.productionVerified == null ? NO_DATA : fact.productionVerified ? "да" : "нет",
  };
}

function decisionKindFor(label: string): "decision" | "blocked" | "none" {
  if (label === "Нужно решение") return "decision";
  if (label === "Заблокирована") return "blocked";
  return "none";
}

function buildTaskDetail(
  task: CompanyTask,
  events: CompanyEvent[],
  index: number,
  codexDisconnected: boolean,
  snapshotIso: string,
  gates: GateFact[],
  codexFallback: string | null,
): TaskDetailModel {
  const linked = linkedEvents(task, events);
  const receipt = taskReceipt(task, events);
  const completed = taskIsClosed(task, events) ? completionInstant(task, events) : null;
  const prValues = [
    task.executiveRun?.prUrl ?? null,
    ...linked.map((event) => payloadText(event.payload, ["pr_url", "pull_request_url", "draft_pr"])),
  ];
  const pr = joinFound(prValues);
  const prHref = safeGithubUrl(prValues.find((value) => safeGithubUrl(value)) ?? null);
  const sourceHref = issueHref(task.githubIssueNumber);
  const briefFromEvent = linked
    .map((event) => payloadText(event.payload, ["brief", "description", "body", "specification", "original_text", "text"]))
    .find(Boolean);
  const panel = engineeringPanel(task, events);
  const executor = taskExecutor(task);
  const stageBadge = resolveStageBadge(task, events, snapshotIso, gates);
  const relatedGate = gates.find(
    (gate) =>
      !gate.archived &&
      gate.taskId != null &&
      (gate.taskId === task.id || (task.githubIssueNumber != null && gate.taskId === String(task.githubIssueNumber))),
  );
  const gateFact = relatedGate ?? gateFromTask(task);
  const presented = gateFact ? presentGate(gateFact, [task], codexFallback) : null;
  const decisionKind = decisionKindFor(stageBadge.label);
  const links = [
    prHref ? { label: "PR", href: prHref } : null,
    sourceHref ? { label: "Источник", href: sourceHref } : null,
    evidenceHref(task) ? { label: "Evidence", href: evidenceHref(task) as string } : null,
  ].filter((link): link is { label: string; href: string } => link != null);
  const copyText = formatAiCompanyTaskCopy({
    title: task.title,
    taskId: task.id ?? NO_DATA,
    runId: task.executiveRun?.runId ?? null,
    brief: task.briefForCopy,
    stageLabel: stageBadge.label,
    stageDetail: stageBadge.detail,
    executor: executor.id ? executorDisplayName(executor.id) : NO_DATA,
    decisionKind: presented?.historical ? "none" : decisionKind,
    decisionOwner: presented && presented.decisionOwner !== NO_DATA ? presented.decisionOwner : null,
    reason: presented?.reason ?? stageBadge.detail,
    requiredDecision: presented?.request ?? null,
    requiredAction: presented?.nextAction ?? task.nextStep,
    createdAt: formatDateTime(task.createdAt),
    receivedAt: receipt
      ? receipt.kind === "received"
        ? formatDateTime(receipt.at)
        : `${formatDateTime(receipt.at)} (создание записи, не получение и не обновление)`
      : NO_DATA,
    startedAt: formatDateTime(startedAt(task, events)),
    lastEventAt: formatDateTime(task.lastEventAt),
    completedAt: taskIsClosed(task, events)
      ? completed
        ? formatDateTime(completed)
        : "Время завершения не сохранено"
      : formatDateTime(null),
    snapshotAt: snapshotCopyLabel(snapshotIso),
    result: outcomeLabel(task, events, codexDisconnected),
    nextStep: task.nextStep,
    links,
    note: presented?.historical ? "Историческая блокировка остаётся в истории и не требует нового решения." : null,
  });
  return {
    key: task.id ?? (task.githubIssueNumber != null ? `issue-${task.githubIssueNumber}` : `task-${index}`),
    title: task.title,
    taskId: task.id ?? NO_DATA,
    statusLabel: taskStatusLabel(task.status),
    brief: task.brief ?? briefFromEvent ?? NO_DATA,
    createdAt: formatDateTime(task.createdAt),
    receivedAt: receipt
      ? receipt.kind === "received"
        ? formatDateTime(receipt.at)
        : `${formatDateTime(receipt.at)} (создание записи, не получение и не обновление)`
      : NO_DATA,
    startedAt: formatDateTime(startedAt(task, events)),
    updatedAt: formatDateTime(task.updatedAt),
    lastEventAt: formatDateTime(task.lastEventAt),
    source: sourceHref ? `GitHub Issue #${task.githubIssueNumber}` : task.source ?? NO_DATA,
    sourceHref,
    agent: roleLabel(task.producerAgentSlug),
    executor: executor.id ? executorDisplayName(executor.id) : NO_DATA,
    stage: stageLabel(task),
    progress: formatProgress(task.verifiedProgress, panel.dodSatisfied || (task.resultKind !== "engineering" && isCompletedStatus(task.status))),
    history: linked.length ? linked.map(eventLine).join("\n") : NO_DATA,
    results: linked.filter(isResultEvent).map(eventLine).join("\n") || NO_DATA,
    handoffs: joinFound([
      task.resultConsumer ? displayKnownRole(task.resultConsumer) : null,
      ...linked.map((event) => payloadText(event.payload, ["result_consumer", "handoff", "next_agent", "to"])),
    ]),
    qa: qaLabel(task, linked),
    returns: linked.filter(isReturnEvent).map(eventLine).join("\n") || NO_DATA,
    pr,
    prHref,
    engineering: panel,
    humanGate: humanGateLabel(task.humanGate),
    outcome: outcomeLabel(task, events, codexDisconnected),
    completedAt: taskIsClosed(task, events)
      ? completed
        ? formatDateTime(completed)
        : "Время завершения не сохранено"
        : formatDateTime(null),
    stageBadge,
    copyText,
    acceptance: acceptanceView(task),
    launch: launchView(task),
    lifecycle: lifecycleView(task),
    ownerComments: ownerCommentViews(task),
  };
}

function toTodayRow(
  task: CompanyTask,
  events: CompanyEvent[],
  index: number,
  at: string,
  codexDisconnected: boolean,
  snapshotIso: string,
  gates: GateFact[],
  codexFallback: string | null,
): TodayRowModel {
  return {
    key: task.id ?? `today-${index}`,
    timeLabel: formatDateTime(at),
    title: task.title,
    taskId: task.id ?? NO_DATA,
    statusLabel: taskStatusLabel(task.status),
    agentLabel: roleLabel(task.producerAgentSlug),
    detail: buildTaskDetail(task, events, index, codexDisconnected, snapshotIso, gates, codexFallback),
  };
}

export function snapshotFreshness(generatedAt: string, now = Date.now()): string {
  const at = parseInstant(generatedAt);
  if (at == null) return "Свежесть: нет данных";
  const ageMin = Math.max(0, Math.round((now - at) / 60000));
  return `Снимок ${formatDateTime(generatedAt)} МСК · возраст ${ageMin} мин`;
}

export type BoardBuildOptions = {
  /** Task ids Core files under board_tab=archive in the separate `?acceptance=archive` snapshot. */
  archivedTaskIds?: ReadonlySet<string>;
};

export function buildAiCompanyDashboard(
  status: CompanyStatus,
  filters: HistoryFilters,
  options: BoardBuildOptions = {},
): DashboardModel {
  const now = parseInstant(status.generatedAt) ?? Date.now();
  const boundaries = boundaryText(status);
  const indexed = status.tasks.map((task, index) => ({ task, index }));
  const codexDisconnected = codexDisconnectedFrom(status);
  const codexFallback = fallbackName(status.tasks);


  const currentIds = new Set(
    status.agents.map((agent) => agent.currentTaskId).filter((id): id is string => Boolean(id)),
  );

  const activeTasks = indexed
    .filter(({ task }) => ownerPlacement(task) === "cycle")
    .filter(({ task }) => task.active !== false && !taskIsClosed(task, status.events))
    .filter(({ task }) => !isDecisionTask(task))
    .filter(({ task }) => task.active === true || hasActivity(task, status.events) || (task.id != null && currentIds.has(task.id)))
    .map(({ task, index }) => {
      const executor = taskExecutor(task);
      const panel = engineeringPanel(task, status.events);
      const linked = linkedEvents(task, status.events);
      const last = [...linked].reverse().find((event) => event.createdAt || event.bareType);
      const lastEvent = task.lastEventText
        ? `${task.lastEventText}${task.lastEventAt ? ` · ${formatDateTime(task.lastEventAt)}` : ""}`
        : last
          ? eventLine(last)
          : NO_DATA;
      const codexDependency = task.dependencies.find((item) => item.codexReadiness);
      const codexNote = codexDependency
        ? `Codex не подключён. Зависимость: ${codexDependency.text}. Запасной исполнитель: ${
            classifyExecutor([task.fallbackExecutor])
              ? executorDisplayName(classifyExecutor([task.fallbackExecutor]))
              : task.fallbackExecutor ?? NO_DATA
          }.`
        : "";
      return {
        key: task.id ?? `active-${index}`,
        title: task.title,
        taskId: task.id ?? NO_DATA,
        priority: task.priority ?? NO_DATA,
        functionalRole: roleLabel(task.producerAgentSlug),
        executorLabel: executor.id ? executorDisplayName(executor.id) : NO_DATA,
        executorNote: executor.note,
        stage: stageLabel(task),
        progress: formatProgress(
          task.verifiedProgress,
          panel.dodSatisfied || (task.resultKind !== "engineering" && isCompletedStatus(task.status)),
        ),
        lastEvent,
        nextStep: task.nextStep ? clip(task.nextStep, 400) : NO_DATA,
        codexNote,
        engineering: panel,
        detail: buildTaskDetail(task, status.events, index, codexDisconnected, status.generatedAt, status.currentGates, codexFallback),
      } satisfies ActiveTaskCard;
    });

  const plan = indexed
    .filter(({ task }) => ownerPlacement(task) === "plan")
    .map(({ task, index }) =>
      buildTaskDetail(task, status.events, index, codexDisconnected, status.generatedAt, status.currentGates, codexFallback),
    );

  const queue = indexed
    .filter(({ task }) => ownerPlacement(task) === "cycle")
    .filter(({ task }) => !taskIsClosed(task, status.events))
    .filter(({ task }) => !hasActivity(task, status.events) && !(task.id != null && currentIds.has(task.id)))
    .filter(({ task }) => !isDecisionTask(task))
    .map(({ task, index }) =>
      buildTaskDetail(task, status.events, index, codexDisconnected, status.generatedAt, status.currentGates, codexFallback),
    );

  const receiptKnown = status.tasks.some((task) => taskReceipt(task, status.events)?.kind === "received");
  const todayReceived = indexed
    .map((item) => ({ ...item, receipt: taskReceipt(item.task, status.events) }))
    .filter((item) => item.receipt?.kind === "received" && sameMoscowDay(item.receipt.at, status.generatedAt))
    .sort((left, right) => compareNewest(left.receipt!.at, right.receipt!.at, left.index, right.index))
    .map((item) =>
      toTodayRow(item.task, status.events, item.index, item.receipt!.at, codexDisconnected, status.generatedAt, status.currentGates, codexFallback),
    );

  const todayCreated = indexed
    .filter(({ task }) => taskReceipt(task, status.events)?.kind !== "received")
    .filter(({ task }) => sameMoscowDay(task.createdAt, status.generatedAt))
    .sort((left, right) => compareNewest(left.task.createdAt, right.task.createdAt, left.index, right.index))
    .map(({ task, index }) =>
      toTodayRow(task, status.events, index, task.createdAt!, codexDisconnected, status.generatedAt, status.currentGates, codexFallback),
    );

  const todayWorkEvents = status.events
    .filter(isWorkEvent)
    .slice()
    .sort((left, right) => compareNewest(left.createdAt, right.createdAt, 0, 0))
    .filter((event) => sameMoscowDay(event.createdAt, status.generatedAt))
    .map((event, index) => {
      const task = status.tasks.find((item) => eventMatchesTask(event, item));
      return {
        key: `${event.eventType}-${event.createdAt ?? index}-${event.taskId ?? event.runId ?? index}`,
        timeLabel: formatDateTime(event.createdAt),
        text: `${event.channelPrefix ? `${event.channelPrefix}:` : ""}${event.bareType} · ${
          task?.title ?? event.taskId ?? event.runId ?? "задача не сопоставлена"
        } · ${event.agentSlug ? roleLabel(event.agentSlug) : "система"}`,
      } satisfies WorkEventModel;
    });

  const ownerReview = indexed
    .filter(({ task }) => ownerPlacement(task) === "review")
    .map(({ task, index }) =>
      buildTaskDetail(task, status.events, index, codexDisconnected, status.generatedAt, status.currentGates, codexFallback),
    );
  const acceptedArchive = indexed
    .filter(({ task }) => ownerPlacement(task) === "archive")
    .map(({ task, index }) =>
      buildTaskDetail(task, status.events, index, codexDisconnected, status.generatedAt, status.currentGates, codexFallback),
    );

  // Cancelled tasks Core files under «Архив»: counted in the tab and listed there labelled «Отменена».
  // They stay out of «Завершённые результаты», whose criterion is completion.
  const cancelledArchive = indexed
    .filter(({ task }) => ownerPlacement(task) === "closed" && CANCELLED_STATUSES.has(normalizeToken(task.status)))
    .map(({ task, index }) =>
      buildTaskDetail(task, status.events, index, codexDisconnected, status.generatedAt, status.currentGates, codexFallback),
    );

  const closed = indexed
    .filter(({ task }) => ownerPlacement(task) === "cycle" || ownerPlacement(task) === "closed")
    .map((item) => ({
      ...item,
      // A Core-closed task with a completed status is history. Cancelled / failed stay out of
      // «Завершённые результаты» exactly as before.
      closed: ownerPlacement(item.task) === "closed"
        ? isCompletedStatus(item.task.status)
        : taskIsClosed(item.task, status.events),
      completedAt: completionInstant(item.task, status.events),
    }))
    .filter((item) => item.closed);
  const todayCompleted = closed
    .filter((item) => sameMoscowDay(item.completedAt, status.generatedAt))
    .sort((left, right) => compareNewest(left.completedAt, right.completedAt, left.index, right.index))
    .map((item) =>
      toTodayRow(item.task, status.events, item.index, item.completedAt!, codexDisconnected, status.generatedAt, status.currentGates, codexFallback),
    );

  const dated = closed.filter((item) => item.completedAt);
  const summaryToday = dated.filter((item) => withinPeriod(item.completedAt!, status.generatedAt, "today")).length;
  const summaryWeek = dated.filter((item) => withinPeriod(item.completedAt!, status.generatedAt, "week")).length;
  const summaryMonth = dated.filter((item) => withinPeriod(item.completedAt!, status.generatedAt, "month")).length;

  const historyAll = closed
    .filter((item) => agentMatches(filters.agent, item.task.producerAgentSlug))
    .filter((item) => statusMatchesFilter(item.task, filters.status))
    .filter((item) =>
      filters.period === "all"
        ? true
        : item.completedAt != null && withinPeriod(item.completedAt, status.generatedAt, filters.period),
    )
    .sort((left, right) => (parseInstant(right.completedAt) ?? -1) - (parseInstant(left.completedAt) ?? -1))
    .map((item) =>
      buildTaskDetail(item.task, status.events, item.index, codexDisconnected, status.generatedAt, status.currentGates, codexFallback),
    );

  const history = filters.historyBefore
    ? historyAll
    : historyAll.slice(filters.historyOffset, filters.historyOffset + HISTORY_PAGE_SIZE);
  const historyNextOffset =
    filters.historyBefore || filters.historyOffset + HISTORY_PAGE_SIZE >= historyAll.length
      ? null
      : filters.historyOffset + HISTORY_PAGE_SIZE;

  // «Нужно решение» lists only decisions of work that is still in «В работе»: a gate of a task that
  // waits for acceptance («Приёмка») or is closed («Архив») is not a separate decision (Core 7a6fc09c).
  // A gate of a task absent from this snapshot is hidden only when that absence is proven: the active
  // task list is complete and not truncated, and the archive snapshot has the task with board_tab=archive.
  // Otherwise it may be an open decision of an active task outside the page, so it stays visible.
  const activeListComplete =
    status.completeness.activeTasksComplete === true && status.completeness.activeTasksTruncated !== true;
  const archivedTaskIds = options.archivedTaskIds ?? new Set<string>();
  const gateInWorking = (gate: GateFact): boolean => {
    if (!gate.taskId) return true;
    const task = findTaskByReference(status.tasks, gate.taskId);
    if (task) return ownerPlacement(task) === "cycle";
    return !(activeListComplete && archivedTaskIds.has(gate.taskId));
  };
  const decisionSources = [
    ...status.currentGates.filter((gate) => !gate.archived),
    ...indexed.flatMap(({ task }) => {
      const gate = gateFromTask(task);
      return gate ? [gate] : [];
    }),
  ].filter(gateInWorking);
  const copyTextForGate = (gate: GateFact, card: GateCard): string => {
    if (card.historical) {
      return formatAiCompanyTaskCopy({
        title: card.taskTitle,
        taskId: gate.taskId ?? NO_DATA,
        runId: null,
        brief: null,
        stageLabel: "Историческая блокировка",
        stageDetail: card.reason,
        executor: NO_DATA,
        decisionKind: "none",
        decisionOwner: card.decisionOwner === NO_DATA ? null : card.decisionOwner,
        reason: card.reason,
        requiredDecision: null,
        requiredAction: null,
        createdAt: NO_DATA,
        receivedAt: NO_DATA,
        startedAt: NO_DATA,
        lastEventAt: NO_DATA,
        completedAt: NO_DATA,
        snapshotAt: snapshotCopyLabel(status.generatedAt),
        result: NO_DATA,
        nextStep: null,
        links: [],
        note: `Историческая блокировка. Причина: ${card.reason}. Кто был записан владельцем: ${card.decisionOwner}.`,
      });
    }
    const task = gate.taskId ? findTaskByReference(status.tasks, gate.taskId) : null;
    if (task) {
      return buildTaskDetail(
        task,
        status.events,
        0,
        codexDisconnected,
        status.generatedAt,
        status.currentGates,
        codexFallback,
      ).copyText;
    }
    return formatAiCompanyTaskCopy({
      title: card.taskTitle,
      taskId: gate.taskId ?? NO_DATA,
      runId: null,
      brief: null,
      stageLabel: "Нужно решение",
      stageDetail: card.reason,
      executor: NO_DATA,
      decisionKind: "decision",
      decisionOwner: card.decisionOwner === NO_DATA ? null : card.decisionOwner,
      reason: card.reason,
      requiredDecision: card.request,
      requiredAction: card.nextAction,
      createdAt: NO_DATA,
      receivedAt: NO_DATA,
      startedAt: NO_DATA,
      lastEventAt: NO_DATA,
      completedAt: NO_DATA,
      snapshotAt: snapshotCopyLabel(status.generatedAt),
      result: NO_DATA,
      nextStep: null,
      links: [],
      note: null,
    });
  };
  // One decision card per task (Core counts tasks, not gates): further gates of the same task add
  // their reason to the existing card instead of a second card.
  const decisions: GateCard[] = [];
  const decisionByTask = new Map<string, { index: number; reasons: string[] }>();
  for (const gate of decisionSources) {
    const card = presentGate(gate, status.tasks, codexFallback);
    if (!card) continue;
    const task = gate.taskId ? findTaskByReference(status.tasks, gate.taskId) : null;
    const taskKey = task ? `task:${task.id}` : gate.taskId ? `task:${gate.taskId}` : `gate:${card.key}`;
    const seen = decisionByTask.get(taskKey);
    if (seen) {
      if (!seen.reasons.includes(card.reason)) {
        seen.reasons.push(card.reason);
        const merged = decisions[seen.index];
        const extraCopy = copyTextForGate(gate, card);
        decisions[seen.index] = {
          ...merged,
          reason: seen.reasons.join(" · "),
          copyText: merged.copyText.includes(extraCopy) ? merged.copyText : `${merged.copyText}\n\n${extraCopy}`,
        };
      }
      continue;
    }
    decisionByTask.set(taskKey, { index: decisions.length, reasons: [card.reason] });
    decisions.push({ ...card, copyText: copyTextForGate(gate, card) });
  }

  const archivedBlockers = [
    ...status.archivedBlockers,
    ...status.currentGates.filter((gate) => gate.archived),
    ...indexed.flatMap(({ task }) => {
      if (!task.gateArchived) return [];
      const gate = {
        id: task.id,
        taskId: task.id,
        reason: task.blockedReason ?? task.humanGate,
        decisionOwner: task.decisionOwner,
        request: task.gateRequest,
        nextAction: task.gateNextAction,
        archived: true,
        kind: null,
        target: null,
      } satisfies GateFact;
      return [gate];
    }),
  ].flatMap((gate) => {
    const archivedGate = { ...gate, archived: true };
    const card = presentGate(archivedGate, status.tasks, codexFallback);
    return card ? [{ ...card, copyText: copyTextForGate(archivedGate, card) }] : [];
  });

  const executorCards = buildExecutors(status, now);

  const roleFilterOptions = buildRoleFilterOptions(status.tasks, filters.agent);

  const todayNote = receiptKnown
    ? "Списки за сегодня: новые сверху. Полученные — по received_at. Созданные — по created_at, это отдельно обозначенный запасной порядок, не подмена получения. Завершённые — по completed_at. updated_at возраст задачи не задаёт. Неизвестная дата не подставляется."
    : "Нет данных о времени получения задач. Журнал получения не построен по времени обновления, чтобы старые задачи не выглядели полученными сегодня.";

  return {
    generatedAtLabel: formatDateTime(status.generatedAt),
    freshnessLabel: snapshotFreshness(status.generatedAt, now),
    decisions,
    activeTasks,
    activeBoundary: boundaries.active,
    executors: executorCards,
    roleFilterOptions,
    todayReceived,
    todayCreated,
    todayWorkEvents,
    todayCompleted,
    todayNote,
    plan,
    queue,
    ownerReview,
    acceptedArchive,
    acceptedArchiveError: null,
    closedCount: closed.length,
    cancelledArchive,
    history,
    historySummary: `Завершено по критерию готовности: ${closed.length}. С известной датой завершения: сегодня ${summaryToday}, неделя ${summaryWeek}, месяц ${summaryMonth}. Без даты завершения: ${closed.length - dated.length}. Страница истории: ${history.length} из ${historyAll.length}.`,
    historyBoundary: boundaries.history,
    historyNextOffset,
    historyNextCursor: status.completeness.nextCursor,
    archivedBlockers,
    quotas: [
      {
        id: "codex",
        label: "Codex",
        value: formatQuotaValue(status.quotas.codex),
        checkPath: status.quotas.codex?.checkPath ?? QUOTA_CHECK_PATHS.codex,
      },
      {
        id: "cursor",
        label: "Cursor",
        value: formatQuotaValue(status.quotas.cursor),
        checkPath: status.quotas.cursor?.checkPath ?? QUOTA_CHECK_PATHS.cursor,
      },
      {
        id: "grok",
        label: "Grok",
        value: formatQuotaValue(status.quotas.grok),
        checkPath: status.quotas.grok?.checkPath ?? QUOTA_CHECK_PATHS.grok,
      },
      {
        id: "legacy",
        label: "Общий расход источника",
        value: legacySpendLabel(status.quotas.legacySpend),
        checkPath: "Показывается только вместе с подтверждённым источником. amount_usd = 0 без источника не считается лимитом.",
      },
    ],
  };
}

const WAITING_TASK_TOKENS = ["human_gate", "needs_decision", "blocked", "waiting", "review"];

function executorRunView(task: CompanyTask, now: number): ExecutorRunView {
  const run = task.executiveRun;
  const lastProgressAt = latestInstant([run?.lastEventAt ?? null, task.lastEventAt]);
  return {
    taskId: task.id,
    title: task.title,
    taskHref: issueHref(task.githubIssueNumber),
    prHref: safeGithubUrl(run?.prUrl ?? null),
    runId: run?.runId ?? task.executorParts.find((part) => part != null && /run/i.test(part)) ?? NO_DATA,
    stage: run?.lastEvent ?? task.status ?? NO_DATA,
    lastProgressAt,
    lastProgress: lastProgressAt ? `${formatDateTime(lastProgressAt)} МСК` : NO_DATA,
    fresh: isFresh(lastProgressAt, now),
  };
}

function buildExecutors(status: CompanyStatus, now: number): ExecutorCard[] {
  const specs: Array<{ id: ExecutorId; label: string; roleNote: string }> = [
    { id: "grok", label: "Grok", roleNote: "Единственный оркестратор. Не исполнитель кода." },
    { id: "codex", label: "Codex", roleNote: "Исполнитель: Codex на сервере компании, запуск по SSH." },
    { id: "cursor", label: "Cursor", roleNote: "Исполнитель. Модель Grok внутри Cursor остаётся Cursor." },
  ];
  const threshold = `${Math.round(HEARTBEAT_STALE_MS / 60000)} минут`;
  return specs.map((spec) => {
    const observations = status.executorObservations.filter(
      (item) => classifyExecutor([item.provider, item.channel, item.model]) === spec.id,
    );
    const beats = status.heartbeats.filter((beat) => classifyExecutor([beat.serviceKey, beat.state]) === spec.id);
    const checkedAt = latestInstant([
      ...observations.map((item) => item.lastHeartbeatAt),
      ...beats.map((beat) => beat.observedAt),
    ]);
    const facts = spec.id === "codex" ? status.codexFacts : null;
    const explicit = facts?.connection
      ?? observations.map((item) => item.connectionState).find(Boolean)
      ?? beats.map((beat) => beat.state).find(Boolean)
      ?? null;
    // Core checks Codex only through CODEX_ACCESS_TOKEN in its own process; the real runner is the CLI on the server (ChatGPT login).
    const cli = spec.id === "codex" && facts?.cliProbe ? codexFromCliProbe(facts.cliProbe, now) : null;
    const tokenOnlyCheck = !cli && spec.id === "codex" && /codex_access_token/i.test(`${facts?.gate ?? ""}`);
    const connection = cli ? cli.connection : deriveConnection({ explicit, checkedAt, now, checkPathMismatch: tokenOnlyCheck });
    const tasks = status.tasks.filter(
      (task) => taskExecutor(task).id === spec.id && task.active !== false && !taskIsClosed(task, status.events),
    );
    const runs = tasks
      .map((task) => ({ task, view: executorRunView(task, now) }))
      .sort((left, right) => (parseInstant(right.view.lastProgressAt) ?? 0) - (parseInstant(left.view.lastProgressAt) ?? 0));
    const freshRuns = runs.filter((item) => item.view.fresh);
    let occupancy: OccupancyState;
    if (cli) {
      occupancy = cli.occupancy;
    } else if (freshRuns.length > 0) {
      const allWaiting = freshRuns.every((item) => {
        const blob = `${item.task.status} ${item.task.humanGate ?? ""}`.toLowerCase();
        return WAITING_TASK_TOKENS.some((token) => blob.includes(token));
      });
      occupancy = allWaiting ? "waiting" : "working";
    } else if (runs.length === 0 && connection === "verified") {
      occupancy = "free";
    } else {
      occupancy = "unknown";
    }
    const lastRunSignal = latestInstant(runs.map((item) => item.view.lastProgressAt));
    const heartbeatAt = latestInstant([checkedAt, lastRunSignal]);
    const probeAt = cli && facts?.cliProbe ? facts.cliProbe.checkedAt : null;
    const signalSource = cli
      ? (probeAt ? "проба Codex CLI (version, login status, процессы codex exec и отслеживаемые запуски)" : "нет сигналов в Company Core")
      : checkedAt && checkedAt === heartbeatAt
      ? "проверка подключения в Company Core"
      : lastRunSignal
        ? "событие запуска в Company Core (start/progress)"
        : "нет сигналов в Company Core";
    const connectionSource = cli
      ? cli.connectionSource
      : tokenOnlyCheck
      ? "Company Core проверяет только ключ API Codex в своём процессе. Реальный канал – Codex на сервере компании по SSH со входом ChatGPT; его Company Core не проверяет и сигналов «жив» не получает. Поэтому подключение не подтверждено и не опровергнуто."
      : checkedAt
        ? `Проверка в Company Core, ${formatDateTime(checkedAt)} МСК. Срок свежести – ${threshold}.`
        : "Company Core не прислал время проверки. Запись о провайдере не доказывает доступность.";
    const evidenceRun = observations.find((item) => item.provider || item.model) ?? null;
    const current = runs[0]?.task ?? null;
    const providerModel = joinFound([
      evidenceRun?.provider ?? current?.executiveRun?.provider ?? null,
      evidenceRun?.channel ?? current?.executiveRun?.channel ?? null,
      evidenceRun?.model ?? current?.executiveRun?.model ?? null,
    ]);
    const staleRuns = runs.length - freshRuns.length;
    // Older Core fills current_run for an unregistered process too (codex-exec-<pid>); that is not a tracked run.
    const probeRun = cli ? facts?.cliProbe?.currentRun ?? null : null;
    const probeSessions = cli ? facts?.cliProbe?.sessions ?? [] : [];
    const tracked = probeRun && (probeSessions.length === 0 || probeSessions.some((item) => item.tracked && item.runId === probeRun.runId))
      ? probeRun
      : null;
    const trackedTask = tracked?.taskId
      ? status.tasks.find((task) => task.id === tracked.taskId || (task.id ?? "").startsWith(tracked.taskId ?? "\u0000")) ?? null
      : null;
    const untracked = cli ? facts?.cliProbe?.untrackedExecCount ?? null : null;
    const cliSessions = cli && occupancy === "working" ? facts?.cliProbe?.sessions ?? [] : [];
    const sessionViews = codexSessionViews(cliSessions, status.tasks, now);
    const slots = cli ? facts?.cliProbe?.slots ?? null : null;
    const slotsText = slots ? `${cliSessions.length} из ${slots.max}` : `${cliSessions.length}`;
    const detailParts = [
      tracked
        ? `Выполняет: отслеживаемый запуск ${tracked.runId}${trackedTask ? ` («${clip(trackedTask.title, 80)}»)` : ""}, начат ${formatDateTime(tracked.startedAt)} МСК, пульс ${formatDateTime(tracked.heartbeatAt)} МСК.`
        : null,
      cli && runs.length > 0
        ? `Назначено Codex в Company Core: ${runs.length}. Это назначение, а не подтверждённая занятость Codex.`
        : null,
      cli && untracked != null && untracked > 0
        ? `Процессов codex exec без регистрации запуска: ${untracked}. Они считаются занятостью: процесс идёт на сервере Codex.`
        : null,
      cli && slots && cliSessions.length > slots.max
        ? `Сессий больше лимита: ${cliSessions.length} при лимите ${slots.max}.`
        : null,
      spec.id === "codex" ? "Работа Грога на своём боксе не приписывается Codex." : null,
      spec.id === "codex" && runs.length > 0 && !current?.executiveRun?.provider
        ? "Исполнитель запуска определён по идентификатору запуска: Company Core не хранит провайдера."
        : null,
      staleRuns > 0
        ? `Без подтверждённого прогресса дольше ${threshold}: ${staleRuns}. Такие запуски не считаются текущей работой.`
        : null,
      observations.some((item) => item.model && /grok|xai/i.test(item.model) && spec.id === "cursor")
        ? "В наблюдении есть модель Grok на канале Cursor. Отдельный исполнитель xAI из этого не создаётся."
        : null,
    ];
    const connectionLabel = connectionCopy(connection);
    const occupancyLabel = cli && occupancy === "working" && cliSessions.length > 0
      ? `занят ${slotsText}`
      : occupancyCopy(occupancy);
    return {
      id: spec.id,
      label: spec.label,
      kind: spec.id === "grok" ? "orchestrator" : "executor",
      roleNote: spec.roleNote,
      providerModel,
      connection,
      connectionLabel,
      connectionSource,
      occupancy,
      occupancyLabel,
      summary: `${connectionLabel} · ${occupancyLabel}`,
      heartbeat: cli ? (probeAt ? `${formatDateTime(probeAt)} МСК` : NO_DATA) : heartbeatAt ? `${formatDateTime(heartbeatAt)} МСК` : NO_DATA,
      signalSource,
      freshness: freshnessLabel(cli ? probeAt : heartbeatAt, now),
      activeRuns: runs.map((item) => item.view),
      sessions: sessionViews,
      activeRunsLabel: cli
        ? (sessionViews.length > 0
          ? `Сессий Codex: ${slotsText}`
          : tracked ? "Отслеживаемый запуск Codex: 1" : runs.length === 0 ? "Нет активных запусков" : `Назначено Codex: ${runs.length} · не подтверждает занятость`)
        : runs.length === 0 ? "Нет активных запусков" : `Активных запусков: ${runs.length}`,
      currentTask: cli
        ? (tracked && cliSessions.every((item) => item.tracked) ? (trackedTask?.title ?? tracked.runId) : sessionViews[0]?.task ?? "Нет отслеживаемого запуска Codex")
        : runs[0]?.view.title ?? "Нет активных запусков",
      runId: cli ? (tracked?.runId ?? NO_DATA) : (runs[0] && runs[0].view.runId !== NO_DATA ? runs[0].view.runId : null) ?? observations.map((item) => item.runId).find(Boolean) ?? NO_DATA,
      detail: joinFound(detailParts),
    };
  });
}

export type CompanyStatusLoad = { data: CompanyStatus | null; error: string | null };

export const ACCEPTED_ARCHIVE_UNAVAILABLE = "Архив принятых сейчас недоступен.";

/**
 * Page composition: `?acceptance=current` drives the board, `?acceptance=archive` only
 * fills «Архив / Принятые». A failed or non-archive answer is shown as unavailable,
 * never as an empty archive.
 */
export function composeAiCompanyBoard(
  current: CompanyStatusLoad,
  archive: CompanyStatusLoad,
  filters: HistoryFilters,
): { model: DashboardModel | null; acceptanceAvailable: boolean; sourceError: string | null } {
  const acceptanceAvailable = Boolean(current.data?.acceptanceContract || archive.data?.acceptanceContract);
  const archivedTaskIds = new Set<string>(
    archive.data?.acceptanceView === "archive"
      ? archive.data.tasks.filter((task) => task.boardTab === "archive").flatMap((task) => (task.id ? [task.id] : []))
      : [],
  );
  const currentModel = current.data ? buildAiCompanyDashboard(current.data, filters, { archivedTaskIds }) : null;
  if (!currentModel) return { model: null, acceptanceAvailable, sourceError: current.error };
  if (!acceptanceAvailable) {
    return { model: { ...currentModel, acceptedArchive: [], acceptedArchiveError: null }, acceptanceAvailable, sourceError: null };
  }
  let acceptedArchive: TaskDetailModel[] = [];
  let acceptedArchiveError: string | null = null;
  if (!archive.data) {
    acceptedArchiveError = `${ACCEPTED_ARCHIVE_UNAVAILABLE} ${archive.error ?? "Company Core не ответил."}`.trim();
  } else if (archive.data.acceptanceView !== "archive") {
    acceptedArchiveError = `${ACCEPTED_ARCHIVE_UNAVAILABLE} Company Core не подтвердил выборку acceptance=archive.`;
  } else {
    acceptedArchive = buildAiCompanyDashboard(archive.data, filters).acceptedArchive;
  }
  return {
    model: { ...currentModel, acceptedArchive, acceptedArchiveError },
    acceptanceAvailable,
    sourceError: null,
  };
}
