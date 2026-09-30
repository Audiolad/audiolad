/**
 * View model for /admin/ai-company.
 * Every visible fact comes from GET /v1/status. Missing facts stay «Нет данных».
 * qa_pass is not completion: CI and Human Gate are still ahead.
 * updated_at is never treated as the moment a task was received.
 */

export const NO_DATA = "Нет данных";

export const HEARTBEAT_STALE_MS = 60 * 60 * 1000;

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

const COMPLETED_STATUSES = new Set([
  "done",
  "completed",
  "accepted",
  "merged",
  "deployed",
  "production",
]);
const WORKING_STATUSES = new Set(["working", "in_progress", "started"]);
const WAITING_STATUSES = new Set(["waiting", "review", "human_gate"]);
const ATTENTION_STATUSES = new Set(["blocked", "failed", "error", "attention"]);
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
const START_EVENT_TYPES = new Set([
  "started",
  "task_started",
  "in_progress",
  "working",
]);
const COMPLETION_EVENT_TYPES = new Set([
  "done",
  "completed",
  "accepted",
  "merged",
  "deployed",
  "production",
]);
const SECRET_KEY = /token|secret|password|credential|api[_-]?key|authorization|prompt/i;
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
] as const;

export type AgentTone = "working" | "waiting" | "attention" | "idle";
export type HistoryPeriod = "all" | "today" | "week" | "month";

export type HistoryFilters = {
  period: HistoryPeriod;
  status: string;
  agent: string;
};

export type CompanyTask = {
  id: string | null;
  githubIssueNumber: number | null;
  title: string;
  status: string;
  priority: string | null;
  producerAgentSlug: string | null;
  resultConsumer: string | null;
  humanGate: string | null;
  blockedReason: string | null;
  updatedAt: string | null;
  createdAt: string | null;
  receivedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  brief: string | null;
  source: string | null;
};

export type CompanyEvent = {
  eventType: string;
  agentSlug: string | null;
  taskId: string | null;
  createdAt: string | null;
  payload: Record<string, unknown> | null;
};

export type CompanyAgent = {
  slug: string;
  role: string;
  status: string;
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

export type CompanyStatus = {
  generatedAt: string;
  tasks: CompanyTask[];
  agents: CompanyAgent[];
  heartbeats: CompanyHeartbeat[];
  events: CompanyEvent[];
  costs: {
    amountUsd: string | null;
    inputUnits: string | null;
    outputUnits: string | null;
  };
};

export type AgentCardModel = {
  slug: string;
  label: string;
  stateLabel: string;
  tone: AgentTone;
  currentTaskTitle: string;
  currentTaskTechnicalId: string;
  stage: string;
  startedAt: string;
  heartbeat: string;
  freshness: string;
  latestResult: string;
  waitReason: string;
  handoff: string;
  qaState: string;
};

export type TaskDetailModel = {
  key: string;
  title: string;
  statusLabel: string;
  brief: string;
  receivedAt: string;
  updatedAt: string;
  source: string;
  sourceHref: string | null;
  agent: string;
  stage: string;
  history: string;
  results: string;
  handoffs: string;
  qa: string;
  returns: string;
  pr: string;
  prHref: string | null;
  ci: string;
  humanGate: string;
  production: string;
  outcome: string;
  completedAt: string;
};

export type TodayRowModel = {
  key: string;
  timeLabel: string;
  title: string;
  statusLabel: string;
  agentLabel: string;
  detail: TaskDetailModel;
};

export type DashboardModel = {
  generatedAtLabel: string;
  attention: string[];
  pulse: { label: string; count: number }[];
  costsLabel: string;
  agents: AgentCardModel[];
  todayRows: TodayRowModel[];
  todayNote: string;
  history: TaskDetailModel[];
  historySummary: string;
};

type Receipt = { at: string; kind: "received" | "created" };

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function readString(record: Record<string, unknown> | null, keys: string[]): string | null {
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

function readNumber(record: Record<string, unknown> | null, keys: string[]): number | null {
  if (!record) return null;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isInteger(value)) return value;
    if (typeof value === "string" && /^\d+$/.test(value.trim())) return Number(value.trim());
  }
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

function taskStatusLabel(status: string): string {
  const value = normalizeToken(status);
  if (!value) return NO_DATA;
  if (COMPLETED_STATUSES.has(value)) return "Выполнено (Completed)";
  if (value === "qa_pass") return "Контроль качества пройден (QA PASS)";
  if (ATTENTION_STATUSES.has(value)) return "Требует внимания (Attention)";
  if (WAITING_STATUSES.has(value)) return "Ожидает (Waiting)";
  if (WORKING_STATUSES.has(value)) return "Работает (Working)";
  return `${status} (технический статус)`;
}

function isGate(value: string | null): boolean {
  if (!value) return false;
  return !["none", "no", "false", "null"].includes(value.trim().toLowerCase());
}

function humanGateLabel(value: string | null): string {
  if (!value || !value.trim()) return NO_DATA;
  if (!isGate(value)) return "Не требуется";
  return value.trim();
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
    if (!url.pathname.startsWith("/Audiolad/audiolad/")) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function issueHref(issueNumber: number | null): string | null {
  if (!issueNumber || issueNumber <= 0) return null;
  return `https://github.com/Audiolad/audiolad/issues/${issueNumber}`;
}

function clip(value: string, max = 500): string {
  const compact = value.replace(/\s+/g, " ").trim();
  return compact.length > max ? `${compact.slice(0, max)}…` : compact;
}

function payloadText(payload: Record<string, unknown> | null, keys: readonly string[]): string | null {
  const value = readString(payload, [...keys]);
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

function parseTask(value: unknown, index: number): CompanyTask | null {
  const record = asRecord(value);
  if (!record) return null;
  const title = readString(record, ["title"]) ?? `Задача без названия #${index + 1}`;
  const brief = readString(record, [
    "brief",
    "description",
    "body",
    "specification",
    "original_text",
    "original_brief",
  ]);
  return {
    id: readString(record, ["id", "task_id"]),
    githubIssueNumber: readNumber(record, ["github_issue_number", "issue_number"]),
    title,
    status: readString(record, ["status"]) ?? "",
    priority: readString(record, ["priority"]),
    producerAgentSlug: readString(record, ["producer_agent_slug", "agent_slug"]),
    resultConsumer: readString(record, ["result_consumer"]),
    humanGate: readString(record, ["human_gate"]),
    blockedReason: readString(record, ["blocked_reason"]),
    updatedAt: readString(record, ["updated_at"]),
    createdAt: readString(record, ["created_at"]),
    receivedAt: readString(record, ["received_at", "intake_at"]),
    startedAt: readString(record, ["started_at"]),
    completedAt: readString(record, ["completed_at", "finished_at"]),
    brief: brief ? clip(brief, 20000) : null,
    source: readString(record, ["source"]),
  };
}

function parseEvent(value: unknown): CompanyEvent | null {
  const record = asRecord(value);
  if (!record) return null;
  const eventType = readString(record, ["event_type"]);
  if (!eventType) return null;
  return {
    eventType,
    agentSlug: readString(record, ["agent_slug"]),
    taskId: readString(record, ["task_id"]),
    createdAt: readString(record, ["created_at"]),
    payload: asRecord(record.payload),
  };
}

function parseAgent(value: unknown): CompanyAgent | null {
  const record = asRecord(value);
  if (!record) return null;
  const slug = readString(record, ["slug"]);
  if (!slug) return null;
  return {
    slug,
    role: readString(record, ["role"]) ?? slug,
    status: readString(record, ["status"]) ?? "",
    autonomyLevel: readNumber(record, ["autonomy_level"]),
    currentTaskId: readString(record, ["current_task_id"]),
    lastHeartbeatAt: readString(record, ["last_heartbeat_at"]),
  };
}

function parseHeartbeat(value: unknown): CompanyHeartbeat | null {
  const record = asRecord(value);
  if (!record) return null;
  const serviceKey = readString(record, ["service_key"]);
  if (!serviceKey) return null;
  return {
    serviceKey,
    observedAt: readString(record, ["observed_at"]),
    state: readString(record, ["state"]),
    currentTaskId: readString(record, ["current_task_id"]),
  };
}

export function parseCompanyStatus(raw: unknown): CompanyStatus | null {
  const record = asRecord(raw);
  if (!record || typeof record.generated_at !== "string" || !record.generated_at.trim()) {
    return null;
  }
  if (!Array.isArray(record.agents) || !Array.isArray(record.tasks)) return null;
  const costs = asRecord(record.costs);
  return {
    generatedAt: record.generated_at,
    tasks: record.tasks
      .map((task, index) => parseTask(task, index))
      .filter((task): task is CompanyTask => task !== null),
    agents: record.agents
      .map((agent) => parseAgent(agent))
      .filter((agent): agent is CompanyAgent => agent !== null),
    heartbeats: Array.isArray(record.heartbeats)
      ? record.heartbeats
          .map((heartbeat) => parseHeartbeat(heartbeat))
          .filter((heartbeat): heartbeat is CompanyHeartbeat => heartbeat !== null)
      : [],
    events: Array.isArray(record.recent_events)
      ? record.recent_events
          .map((event) => parseEvent(event))
          .filter((event): event is CompanyEvent => event !== null)
      : [],
    costs: {
      amountUsd: readString(costs, ["amount_usd"]),
      inputUnits: readString(costs, ["input_units"]),
      outputUnits: readString(costs, ["output_units"]),
    },
  };
}

export function parseHistoryFilters(input: {
  period?: string | null;
  status?: string | null;
  agent?: string | null;
}): HistoryFilters {
  const period =
    input.period === "today" || input.period === "week" || input.period === "month"
      ? input.period
      : "all";
  return {
    period,
    status: (input.status ?? "").trim(),
    agent: (input.agent ?? "").trim(),
  };
}

function taskAliases(task: CompanyTask): string[] {
  const aliases: string[] = [];
  if (task.id) aliases.push(task.id);
  if (task.githubIssueNumber != null) aliases.push(String(task.githubIssueNumber));
  return aliases;
}

function eventMatchesTask(event: CompanyEvent, task: CompanyTask): boolean {
  const aliases = taskAliases(task);
  if (event.taskId && aliases.includes(event.taskId)) return true;
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
    tasks.find(
      (task) => task.githubIssueNumber != null && String(task.githubIssueNumber) === reference,
    ) ??
    null
  );
}

export function resolveCurrentTask(agent: CompanyAgent | null, tasks: CompanyTask[]): CompanyTask | null {
  if (!agent) return null;
  if (agent.currentTaskId) {
    return findTaskByReference(tasks, agent.currentTaskId);
  }
  const open = tasks.filter(
    (task) => task.producerAgentSlug === agent.slug && !isCompletedStatus(task.status),
  );
  return open.length === 1 ? open[0] : null;
}

function heartbeatInstant(agent: CompanyAgent, heartbeats: CompanyHeartbeat[]): string | null {
  const candidates = [agent.lastHeartbeatAt];
  for (const heartbeat of heartbeats) {
    const key = heartbeat.serviceKey;
    const matchesAgent =
      key === agent.slug ||
      key.startsWith(`${agent.slug}-`) ||
      key.startsWith(`${agent.slug}_`) ||
      key.startsWith(`${agent.slug}.`);
    const matchesTask =
      agent.currentTaskId != null && heartbeat.currentTaskId === agent.currentTaskId;
    if ((matchesAgent || matchesTask) && heartbeat.observedAt) candidates.push(heartbeat.observedAt);
  }
  let latest: string | null = null;
  let latestAt = Number.NEGATIVE_INFINITY;
  for (const candidate of candidates) {
    const parsed = parseInstant(candidate);
    if (parsed != null && parsed >= latestAt) {
      latest = candidate;
      latestAt = parsed;
    }
  }
  return latest;
}

function isStale(agent: CompanyAgent, heartbeatAt: string | null, now: number): boolean {
  if (!WORKING_STATUSES.has(normalizeToken(agent.status))) return false;
  const observed = parseInstant(heartbeatAt);
  if (observed == null) return true;
  return now - observed > HEARTBEAT_STALE_MS;
}

function agentState(
  agent: CompanyAgent | undefined,
  heartbeatAt: string | null,
  now: number,
): { label: string; tone: AgentTone } {
  if (!agent) {
    return {
      label: "⚪ Не подключён / простаивает (Not commissioned / Idle)",
      tone: "idle",
    };
  }
  const status = normalizeToken(agent.status);
  if (isStale(agent, heartbeatAt, now) || ATTENTION_STATUSES.has(status)) {
    return { label: "🔴 Требует внимания (Attention)", tone: "attention" };
  }
  if (WORKING_STATUSES.has(status)) {
    return { label: "🟢 Работает (Working)", tone: "working" };
  }
  if (WAITING_STATUSES.has(status)) {
    return { label: "🟡 Ожидает (Waiting)", tone: "waiting" };
  }
  return {
    label: "⚪ Не подключён / простаивает (Not commissioned / Idle)",
    tone: "idle",
  };
}

function freshnessLabel(heartbeatAt: string | null, now: number): string {
  const observed = parseInstant(heartbeatAt);
  if (observed == null) return NO_DATA;
  const when = formatDateTime(heartbeatAt);
  if (now - observed > HEARTBEAT_STALE_MS) return `сигнал старше 60 минут, ${when}`;
  return `сигнал свежий, ${when}`;
}

function taskReceipt(task: CompanyTask, events: CompanyEvent[]): Receipt | null {
  if (parseInstant(task.receivedAt) != null && task.receivedAt) {
    return { at: task.receivedAt, kind: "received" };
  }
  const linked = linkedEvents(task, events);
  const intake = linked.find(
    (event) =>
      RECEIPT_EVENT_TYPES.has(normalizeToken(event.eventType)) && parseInstant(event.createdAt) != null,
  );
  if (intake?.createdAt) return { at: intake.createdAt, kind: "received" };
  for (const event of linked) {
    const fromPayload = payloadText(event.payload, ["received_at", "intake_at"]);
    if (parseInstant(fromPayload) != null && fromPayload) return { at: fromPayload, kind: "received" };
  }
  if (parseInstant(task.createdAt) != null && task.createdAt) {
    return { at: task.createdAt, kind: "created" };
  }
  return null;
}

function startedAt(task: CompanyTask | null, events: CompanyEvent[]): string | null {
  if (!task) return null;
  if (parseInstant(task.startedAt) != null) return task.startedAt;
  const started = linkedEvents(task, events).find((event) =>
    START_EVENT_TYPES.has(normalizeToken(event.eventType)),
  );
  return started?.createdAt ?? null;
}

function completionInstant(task: CompanyTask, events: CompanyEvent[]): string | null {
  if (!isCompletedStatus(task.status)) return null;
  if (parseInstant(task.completedAt) != null) return task.completedAt;
  const completions = linkedEvents(task, events).filter((event) =>
    COMPLETION_EVENT_TYPES.has(normalizeToken(event.eventType)),
  );
  const latest = completions[completions.length - 1];
  return latest?.createdAt ?? null;
}

function joinFound(values: Array<string | null>): string {
  const unique = [...new Set(values.filter((value): value is string => Boolean(value)))];
  return unique.length ? unique.join("; ") : NO_DATA;
}

function eventLine(event: CompanyEvent): string {
  const extra = safePayloadSummary(event.payload);
  const base = `${formatDateTime(event.createdAt)} · ${event.eventType} · ${event.agentSlug ?? "система"}`;
  return extra ? `${base} · ${extra}` : base;
}

function isReturnEvent(event: CompanyEvent): boolean {
  const type = normalizeToken(event.eventType);
  if (type.includes("return") || type.includes("request_changes")) return true;
  const verdict = payloadText(event.payload, ["verdict", "qa_status", "status"]);
  if (!verdict) return false;
  const normalized = normalizeToken(verdict);
  return normalized === "return" || normalized === "request_changes" || normalized === "qa_fail";
}

function isResultEvent(event: CompanyEvent): boolean {
  if (RESULT_EVENT_TYPES.has(normalizeToken(event.eventType))) return true;
  return Boolean(payloadText(event.payload, ["result", "outcome", "summary", "pr_url", "pull_request_url", "draft_pr"]));
}

function sortEvents(events: CompanyEvent[]): CompanyEvent[] {
  return events
    .slice()
    .sort((left, right) => (parseInstant(left.createdAt) ?? 0) - (parseInstant(right.createdAt) ?? 0));
}

function cardEvents(
  agent: CompanyAgent | undefined,
  task: CompanyTask | null,
  events: CompanyEvent[],
): CompanyEvent[] {
  return sortEvents(
    events.filter((event) => {
      if (task && eventMatchesTask(event, task)) return true;
      if (event.agentSlug !== agent?.slug) return false;
      if (!event.taskId) return true;
      return false;
    }),
  );
}

function latestResult(events: CompanyEvent[]): string {
  const results = sortEvents(events.filter(isResultEvent));
  const latest = results[results.length - 1];
  if (!latest) return NO_DATA;
  const text = payloadText(latest.payload, ["result", "outcome", "summary", "message"]);
  const pr = payloadText(latest.payload, ["pr_url", "pull_request_url", "draft_pr"]);
  return joinFound([
    text ?? `${latest.eventType}`,
    formatDateTime(latest.createdAt) === NO_DATA ? null : formatDateTime(latest.createdAt),
    pr,
  ]);
}

function qaLabel(task: CompanyTask | null, events: CompanyEvent[]): string {
  const fromEvents = events
    .filter((event) => normalizeToken(event.eventType).includes("qa") || payloadText(event.payload, ["verdict", "qa_status"]))
    .map((event) => eventLine(event));
  if (fromEvents.length) return fromEvents.join("\n");
  if (task && normalizeToken(task.status) === "qa_pass") return "PASS";
  if (task && normalizeToken(task.status) === "qa_fail") return "FAIL";
  return NO_DATA;
}

function agentMatches(filter: string, slug: string | null): boolean {
  if (!filter) return true;
  if (!slug) return false;
  if (slug === filter) return true;
  return filter === "marketing" && slug.includes("marketing");
}

function findAgent(status: CompanyStatus, slug: string): CompanyAgent | undefined {
  return status.agents.find(
    (agent) => agent.slug === slug || (slug === "marketing" && agent.slug.includes("marketing")),
  );
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

function buildTaskDetail(
  task: CompanyTask,
  events: CompanyEvent[],
  index: number,
): TaskDetailModel {
  const linked = linkedEvents(task, events);
  const receipt = taskReceipt(task, events);
  const completed = completionInstant(task, events);
  const prValues = linked.map((event) =>
    payloadText(event.payload, ["pr_url", "pull_request_url", "draft_pr"]),
  );
  const pr = joinFound(prValues);
  const prHref = safeGithubUrl(prValues.find((value) => safeGithubUrl(value)) ?? null);
  const sourceHref = issueHref(task.githubIssueNumber);
  const briefFromEvent = linked
    .map((event) => payloadText(event.payload, ["brief", "description", "body", "specification", "original_text", "text"]))
    .find(Boolean);
  const handoffValues = [
    task.resultConsumer ? displayKnownRole(task.resultConsumer) : null,
    ...linked.map((event) => payloadText(event.payload, ["result_consumer", "handoff", "next_agent", "to"])),
  ];
  const returns = linked.filter(isReturnEvent).map(eventLine);
  const results = linked.filter(isResultEvent).map(eventLine);
  const outcome = isCompletedStatus(task.status)
    ? taskStatusLabel(task.status)
    : NO_DATA;

  return {
    key: task.id ?? (task.githubIssueNumber != null ? `issue-${task.githubIssueNumber}` : `task-${index}`),
    title: task.title,
    statusLabel: taskStatusLabel(task.status),
    brief: task.brief ?? briefFromEvent ?? NO_DATA,
    receivedAt: receipt
      ? receipt.kind === "received"
        ? formatDateTime(receipt.at)
        : `${formatDateTime(receipt.at)} (создание записи, не время обновления)`
      : NO_DATA,
    updatedAt: formatDateTime(task.updatedAt),
    source: sourceHref
      ? `GitHub Issue #${task.githubIssueNumber}`
      : task.source ?? NO_DATA,
    sourceHref,
    agent: roleLabel(task.producerAgentSlug),
    stage: taskStatusLabel(task.status),
    history: linked.length ? linked.map(eventLine).join("\n") : NO_DATA,
    results: results.length ? results.join("\n") : NO_DATA,
    handoffs: joinFound(handoffValues),
    qa: qaLabel(task, linked),
    returns: returns.length ? returns.join("\n") : NO_DATA,
    pr,
    prHref,
    ci: joinFound(
      linked.map((event) => payloadText(event.payload, ["ci_status", "ci", "checks_conclusion", "check_status"])),
    ),
    humanGate: humanGateLabel(task.humanGate),
    production: joinFound([
      ...linked.map((event) => payloadText(event.payload, ["production", "production_url", "deploy_url"])),
      COMPLETED_STATUSES.has(normalizeToken(task.status)) &&
      ["merged", "deployed", "production"].includes(normalizeToken(task.status))
        ? taskStatusLabel(task.status)
        : null,
    ]),
    outcome,
    completedAt: formatDateTime(completed),
  };
}

function costsLabel(status: CompanyStatus): string {
  if (!status.costs.amountUsd) return NO_DATA;
  const input = status.costs.inputUnits ?? NO_DATA;
  const output = status.costs.outputUnits ?? NO_DATA;
  return `$${status.costs.amountUsd} · вход ${input} · выход ${output}`;
}

export function buildAiCompanyDashboard(
  status: CompanyStatus,
  filters: HistoryFilters,
): DashboardModel {
  const now = parseInstant(status.generatedAt) ?? Date.now();
  const attention: string[] = [];
  const agents = AI_COMPANY_ROLES.map(([slug, label]) => {
    const agent = findAgent(status, slug);
    const heartbeatAt = agent ? heartbeatInstant(agent, status.heartbeats) : null;
    const state = agentState(agent, heartbeatAt, now);
    const task = resolveCurrentTask(agent ?? null, status.tasks);
    const events = cardEvents(agent, task, status.events);
    if (agent && isStale(agent, heartbeatAt, now)) {
      attention.push(`Устаревший сигнал жизнеспособности: ${label}`);
    } else if (agent && ATTENTION_STATUSES.has(normalizeToken(agent.status))) {
      attention.push(`Состояние агента требует внимания: ${label}`);
    }
    const waitReason = task?.blockedReason
      ? task.blockedReason
      : task && isGate(task.humanGate)
        ? `Ручное разрешение (Human Gate): ${task.humanGate}`
        : NO_DATA;
    return {
      slug,
      label,
      stateLabel: state.label,
      tone: state.tone,
      currentTaskTitle: task?.title ?? NO_DATA,
      currentTaskTechnicalId: agent?.currentTaskId ?? NO_DATA,
      stage: task ? taskStatusLabel(task.status) : NO_DATA,
      startedAt: formatDateTime(startedAt(task, status.events)),
      heartbeat: formatDateTime(heartbeatAt),
      freshness: freshnessLabel(heartbeatAt, now),
      latestResult: latestResult(events),
      waitReason,
      handoff: task?.resultConsumer ? displayKnownRole(task.resultConsumer) : NO_DATA,
      qaState: qaLabel(task, events),
    } satisfies AgentCardModel;
  });

  for (const task of status.tasks) {
    if (isGate(task.humanGate)) {
      attention.push(`Ручное разрешение (Human Gate): ${task.title}`);
    }
    if (task.blockedReason || ATTENTION_STATUSES.has(normalizeToken(task.status))) {
      attention.push(
        task.blockedReason
          ? `Блокировка: ${task.title} — ${task.blockedReason}`
          : `Блокировка: ${task.title}`,
      );
    }
  }
  for (const event of status.events) {
    if (normalizeToken(event.eventType) !== "andon") continue;
    attention.push(`AI ANDON: ${formatDateTime(event.createdAt)} · ${roleLabel(event.agentSlug)}`);
  }

  const receiptKnown = status.tasks.some((task) => taskReceipt(task, status.events));
  const todayRows = status.tasks
    .map((task, index) => ({ task, index, receipt: taskReceipt(task, status.events) }))
    .filter(
      (item): item is { task: CompanyTask; index: number; receipt: Receipt } =>
        item.receipt != null && moscowDay(item.receipt.at) === moscowDay(status.generatedAt),
    )
    .sort((left, right) => (parseInstant(left.receipt.at) ?? 0) - (parseInstant(right.receipt.at) ?? 0))
    .map((item) => ({
      key: item.task.id ?? `today-${item.index}`,
      timeLabel:
        item.receipt.kind === "received"
          ? formatDateTime(item.receipt.at)
          : `${formatDateTime(item.receipt.at)} · создание записи`,
      title: item.task.title,
      statusLabel: taskStatusLabel(item.task.status),
      agentLabel: roleLabel(item.task.producerAgentSlug),
      detail: buildTaskDetail(item.task, status.events, item.index),
    }));

  const todayNote = receiptKnown
    ? "В журнал входят только задачи с временем получения или создания записи за московские сутки снимка. Время обновления не считается поступлением."
    : "Нет данных о времени получения задач. Журнал не построен по времени обновления, чтобы старые задачи не выглядели полученными сегодня.";

  const completed = status.tasks
    .map((task, index) => ({ task, index, completedAt: completionInstant(task, status.events) }))
    .filter((item) => isCompletedStatus(item.task.status));
  const dated = completed.filter((item) => item.completedAt);
  const summaryToday = dated.filter((item) => withinPeriod(item.completedAt!, status.generatedAt, "today")).length;
  const summaryWeek = dated.filter((item) => withinPeriod(item.completedAt!, status.generatedAt, "week")).length;
  const summaryMonth = dated.filter((item) => withinPeriod(item.completedAt!, status.generatedAt, "month")).length;
  const undated = completed.length - dated.length;

  const history = completed
    .filter((item) => agentMatches(filters.agent, item.task.producerAgentSlug))
    .filter((item) => statusMatchesFilter(item.task, filters.status))
    .filter((item) =>
      filters.period === "all"
        ? true
        : item.completedAt != null && withinPeriod(item.completedAt, status.generatedAt, filters.period),
    )
    .sort((left, right) => (parseInstant(right.completedAt) ?? -1) - (parseInstant(left.completedAt) ?? -1))
    .map((item) => buildTaskDetail(item.task, status.events, item.index));

  const counts = agents.reduce(
    (accumulator, agent) => {
      accumulator[agent.tone] += 1;
      return accumulator;
    },
    { working: 0, waiting: 0, attention: 0, idle: 0 },
  );

  return {
    generatedAtLabel: formatDateTime(status.generatedAt),
    attention: [...new Set(attention)],
    pulse: [
      { label: "Работает", count: counts.working },
      { label: "Ожидает", count: counts.waiting },
      { label: "Требует внимания", count: counts.attention },
      { label: "Не подключён / простаивает", count: counts.idle },
    ],
    costsLabel: costsLabel(status),
    agents,
    todayRows,
    todayNote,
    history,
    historySummary: `Завершено всего: ${completed.length}. С известной датой завершения: сегодня ${summaryToday}, неделя ${summaryWeek}, месяц ${summaryMonth}. Без даты завершения: ${undated}. Итоги дня, недели и месяца не подменяют дату завершения временем обновления.`,
  };
}
