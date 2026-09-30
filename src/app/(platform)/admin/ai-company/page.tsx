import { requirePlatformOwnerAccess } from "@/lib/admin/require-platform-owner";

export const dynamic = "force-dynamic";

type Task = {
  github_issue_number: number | null;
  title: string;
  status: string;
  priority: string;
  producer_agent_slug: string | null;
  result_consumer: string | null;
  human_gate: string;
  blocked_reason: string | null;
  updated_at: string;
};
type Agent = {
  slug: string;
  role: string;
  status: string;
  autonomy_level: number;
  current_task_id: string | null;
  last_heartbeat_at: string | null;
};
type Event = {
  event_type: string;
  agent_slug: string | null;
  task_id: string | null;
  payload: object;
  created_at: string;
};
type Status = {
  generated_at: string;
  tasks: Task[];
  agents: Agent[];
  heartbeats: { service_key: string; service_type: string; observed_at: string; state: string; current_task_id: string | null; health_metadata: object }[];
  recent_events: Event[];
  costs: { amount_usd: string; input_units: number | string; output_units: number | string };
};

const roles = [
  ["orchestrator", "Оркестратор (Orchestrator)"],
  ["research", "Исследователь (Research)"],
  ["product", "Продуктовый агент (Product)"],
  ["ux", "UX-агент (UX)"],
  ["engineering", "Инженер (Engineering)"],
  ["qa", "Контроль качества (QA)"],
  ["analytics", "Аналитик (Analytics)"],
  ["marketing", "Маркетинг и продажи (Marketing & Sales)"],
] as const;
const terminal = new Set(["done", "completed", "accepted", "qa_pass", "merged", "deployed", "production"]);
const active = new Set(["working", "in_progress", "started"]);

function time(value: string | null) {
  if (!value) return "Нет данных";
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? value : parsed.toLocaleString("ru-RU");
}
function isGate(value: string) {
  return Boolean(value && !["none", "no", "false", "null"].includes(value.toLowerCase()));
}
function isStale(agent: Agent, now: number) {
  return active.has(agent.status.toLowerCase()) && (!agent.last_heartbeat_at || now - Date.parse(agent.last_heartbeat_at) > 60 * 60 * 1000);
}
function taskFor(data: Status, slug: string) {
  return data.tasks.find((task) => task.producer_agent_slug === slug && active.has(task.status.toLowerCase())) ?? null;
}
function issueLink(task: Task) {
  return task.github_issue_number ? `https://github.com/Audiolad/audiolad/issues/${task.github_issue_number}` : null;
}
function taskStatus(status: string) {
  const value = status.toLowerCase();
  if (terminal.has(value)) return "Выполнено (Completed)";
  if (value === "blocked" || value === "failed" || value === "error") return "Требует внимания (Attention)";
  if (value === "waiting" || value === "review" || value === "human_gate") return "Ожидает (Waiting)";
  if (active.has(value)) return "Работает (Working)";
  return `${status} (технический статус)`;
}
function agentState(agent: Agent | undefined, now: number) {
  if (!agent) return { label: "⚪ Не подключён / простаивает (Not commissioned / Idle)", tone: "border-slate-200 bg-slate-50" };
  if (isStale(agent, now) || ["blocked", "failed", "error", "attention"].includes(agent.status.toLowerCase())) return { label: "🔴 Требует внимания (Attention)", tone: "border-red-200 bg-red-50" };
  if (active.has(agent.status.toLowerCase())) return { label: "🟢 Работает (Working)", tone: "border-green-200 bg-green-50" };
  if (["waiting", "review", "human_gate"].includes(agent.status.toLowerCase())) return { label: "🟡 Ожидает (Waiting)", tone: "border-amber-200 bg-amber-50" };
  return { label: "⚪ Не подключён / простаивает (Not commissioned / Idle)", tone: "border-slate-200 bg-slate-50" };
}

async function loadStatus(): Promise<{ data: Status | null; error: string | null }> {
  const base = process.env.COMPANY_CORE_URL ?? process.env.COMPANY_API_URL;
  const token = process.env.COMPANY_API_TOKEN;
  if (!base || !token) return { data: null, error: "Company Core не настроен: отсутствует URL или серверный токен." };
  try {
    const response = await fetch(`${base.replace(/\/$/, "")}/v1/status`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal: AbortSignal.timeout(8000) });
    if (!response.ok) return { data: null, error: `Company Core вернул HTTP ${response.status}.` };
    const data = (await response.json()) as Status;
    if (!data.generated_at || !Array.isArray(data.agents) || !Array.isArray(data.tasks) || !Array.isArray(data.recent_events)) return { data: null, error: "Company Core вернул несовместимый набор данных." };
    return { data, error: null };
  } catch (error) {
    console.error("ai_company_status_load_error", error);
    return { data: null, error: "Company Core сейчас недоступен." };
  }
}

function TaskCard({ task }: { task: Task }) {
  const href = issueLink(task);
  return <details className="rounded-xl border border-[#eadff8] bg-white p-4 text-sm">
    <summary className="cursor-pointer font-semibold">{task.title} · {taskStatus(task.status)}</summary>
    <dl className="mt-4 grid gap-2 sm:grid-cols-2">
      <div><dt className="text-[#796ba0]">Полный исходный текст постановки</dt><dd>Нет данных</dd></div>
      <div><dt className="text-[#796ba0]">Дата и время</dt><dd>{time(task.updated_at)} (последнее обновление)</dd></div>
      <div><dt className="text-[#796ba0]">Источник</dt><dd>{href ? <a className="text-[#7042c5] underline" href={href}>GitHub Issue #{task.github_issue_number}</a> : "Нет данных"}</dd></div>
      <div><dt className="text-[#796ba0]">Ответственный агент</dt><dd>{task.producer_agent_slug ?? "Нет данных"}</dd></div>
      <div><dt className="text-[#796ba0]">Текущий этап</dt><dd>{taskStatus(task.status)}</dd></div>
      <div><dt className="text-[#796ba0]">Приоритет</dt><dd>{task.priority || "Нет данных"}</dd></div>
      <div><dt className="text-[#796ba0]">Передача результата (handoff)</dt><dd>{task.result_consumer ?? "Нет данных"}</dd></div>
      <div><dt className="text-[#796ba0]">Причина блокировки</dt><dd>{task.blocked_reason ?? "Нет данных"}</dd></div>
      <div><dt className="text-[#796ba0]">Контроль качества (QA)</dt><dd>{task.status.toLowerCase() === "qa_pass" ? "PASS" : "Нет данных"}</dd></div>
      <div><dt className="text-[#796ba0]">Ручное разрешение (Human Gate)</dt><dd>{isGate(task.human_gate) ? task.human_gate : "Не требуется / нет данных"}</dd></div>
      <div><dt className="text-[#796ba0]">История, результаты, возвраты, PR и CI</dt><dd>Нет данных</dd></div>
      <div><dt className="text-[#796ba0]">Production, итог и дата завершения</dt><dd>{terminal.has(task.status.toLowerCase()) ? `Выполнено; обновлено ${time(task.updated_at)}` : "Нет данных"}</dd></div>
    </dl>
  </details>;
}

export default async function AiCompanyPage({ searchParams }: { searchParams: Promise<{ period?: string; status?: string; agent?: string }> }) {
  await requirePlatformOwnerAccess("/admin/ai-company");
  const filters = await searchParams;
  const { data, error } = await loadStatus();
  if (!data) return <main><meta httpEquiv="refresh" content="45" /><h1 className="text-2xl font-semibold">ИИ-компания</h1><div className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-5 text-red-800"><strong>Требует внимания (Attention): нет достоверных данных</strong><p className="mt-2 text-sm">{error}</p><p className="mt-2 text-sm">Фиктивное состояние не подставлено. Повтор через 45 секунд.</p></div></main>;

  const now = Date.parse(data.generated_at);
  const stale = data.agents.filter((agent) => isStale(agent, now));
  const blocked = data.tasks.filter((task) => task.blocked_reason || ["blocked", "failed", "error"].includes(task.status.toLowerCase()));
  const gates = data.tasks.filter((task) => isGate(task.human_gate));
  const today = data.generated_at.slice(0, 10);
  const todayTasks = data.tasks.filter((task) => task.updated_at.slice(0, 10) === today);
  const history = data.tasks.filter((task) => terminal.has(task.status.toLowerCase())).filter((task) => !filters.agent || task.producer_agent_slug === filters.agent).filter((task) => !filters.status || task.status.toLowerCase() === filters.status.toLowerCase()).filter((task) => filters.period !== "today" || task.updated_at.slice(0, 10) === today);

  return <main className="space-y-7">
    <meta httpEquiv="refresh" content="45" />
    <header><h1 className="text-2xl font-semibold">ИИ-компания</h1><p className="mt-1 text-sm text-[#796ba0]">Операционное табло · автообновление каждые 45 секунд · обновлено {time(data.generated_at)}</p></header>

    {(gates.length || stale.length || blocked.length) ? <section className="rounded-2xl border border-red-300 bg-red-50 p-5"><h2 className="text-lg font-semibold text-red-900">Требует внимания (Attention)</h2><ul className="mt-3 space-y-1 text-sm text-red-800"><li>Ручные разрешения (Human Gates): {gates.length}</li><li>Устаревшие сигналы жизнеспособности: {stale.map((agent) => agent.slug).join(", ") || "0"}</li><li>Заблокированные задачи: {blocked.map((task) => task.title).join(", ") || "0"}</li></ul></section> : null}

    <section className="rounded-2xl border border-[#eadff8] bg-white p-5"><h2 className="text-lg font-semibold">Пульс компании (Company Pulse)</h2><div className="mt-3 flex flex-wrap gap-4 text-sm"><span>Задач сегодня: <strong>{todayTasks.length}</strong></span><span>Завершено: <strong>{todayTasks.filter((task) => terminal.has(task.status.toLowerCase())).length}</strong></span><span>Стоимость API: <strong>${data.costs.amount_usd}</strong></span></div></section>

    <section><h2 className="text-xl font-semibold">Агенты</h2><div className="mt-4 grid gap-4 lg:grid-cols-2">{roles.map(([slug, label]) => { const agent = data.agents.find((item) => item.slug === slug || (slug === "marketing" && item.slug.includes("marketing"))); const task = taskFor(data, agent?.slug ?? slug); const events = data.recent_events.filter((event) => event.agent_slug === agent?.slug).slice(0, 3); const state = agentState(agent, now); return <details key={slug} className={`rounded-2xl border p-5 ${state.tone}`}><summary className="cursor-pointer font-semibold">{label} — {state.label}</summary><dl className="mt-4 grid gap-2 text-sm"><div><dt className="text-[#796ba0]">Текущая задача</dt><dd>{task?.title ?? "Нет данных"}</dd></div><div><dt className="text-[#796ba0]">Текущий этап</dt><dd>{task ? taskStatus(task.status) : "Нет данных"}</dd></div><div><dt className="text-[#796ba0]">Время начала</dt><dd>Нет данных</dd></div><div><dt className="text-[#796ba0]">Последний heartbeat</dt><dd>{time(agent?.last_heartbeat_at ?? null)}</dd></div><div><dt className="text-[#796ba0]">Последний измеримый результат</dt><dd>{events[0]?.event_type ?? "Нет данных"}</dd></div><div><dt className="text-[#796ba0]">Причина ожидания / блокировки</dt><dd>{task?.blocked_reason ?? "Нет данных"}</dd></div><div><dt className="text-[#796ba0]">Кому передан результат</dt><dd>{task?.result_consumer ?? "Нет данных"}</dd></div><div><dt className="text-[#796ba0]">Состояние QA</dt><dd>{task?.status.toLowerCase() === "qa_pass" ? "PASS" : "Нет данных"}</dd></div></dl></details>; })}</div></section>

    <section><h2 className="text-xl font-semibold">Сегодня в компании</h2><p className="mt-1 text-xs text-[#796ba0]">Company Core не передаёт время получения; показано время последнего обновления.</p><div className="mt-3 space-y-2">{todayTasks.length ? todayTasks.map((task, index) => <TaskCard key={`${task.title}-${index}`} task={task} />) : <p className="rounded-xl border border-[#eadff8] bg-white p-4 text-sm text-[#796ba0]">Сегодня задач нет.</p>}</div></section>

    <section><h2 className="text-xl font-semibold">История работы</h2><form className="mt-3 flex flex-wrap gap-2" method="get"><select name="period" defaultValue={filters.period ?? "all"} className="rounded-lg border p-2 text-sm"><option value="all">Все периоды</option><option value="today">Сегодня</option></select><input name="status" defaultValue={filters.status ?? ""} placeholder="Технический статус" className="rounded-lg border p-2 text-sm" /><input name="agent" defaultValue={filters.agent ?? ""} placeholder="Идентификатор агента" className="rounded-lg border p-2 text-sm" /><button className="rounded-lg bg-[#7042c5] px-4 py-2 text-sm font-semibold text-white">Применить</button></form><div className="mt-3 space-y-2">{history.length ? history.map((task, index) => <TaskCard key={`${task.title}-${index}`} task={task} />) : <p className="rounded-xl border border-[#eadff8] bg-white p-4 text-sm text-[#796ba0]">Завершённых задач по фильтрам нет.</p>}</div></section>

    <section><h2 className="text-xl font-semibold">Журнал событий (Event Feed)</h2><ol className="mt-3 divide-y rounded-2xl border border-[#eadff8] bg-white px-5">{data.recent_events.length ? data.recent_events.map((event, index) => <li key={`${event.created_at}-${index}`} className="py-3 text-sm"><strong>{event.event_type}</strong> · {event.agent_slug ?? "система"} · {time(event.created_at)}</li>) : <li className="py-4 text-sm text-[#796ba0]">Событий пока нет.</li>}</ol></section>
  </main>;
}
