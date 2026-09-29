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
type Heartbeat = {
  service_key: string;
  service_type: string;
  observed_at: string;
  state: string;
  current_task_id: string | null;
};
type Event = {
  event_type: string;
  agent_slug: string | null;
  task_id: string | null;
  created_at: string;
};
type Status = {
  generated_at: string;
  tasks: Task[];
  agents: Agent[];
  heartbeats: Heartbeat[];
  recent_events: Event[];
  costs: { amount_usd: string; input_units: number | string; output_units: number | string };
};

const roles = [
  ["orchestrator", "Orchestrator / AI COO"],
  ["research", "Research"],
  ["product", "Product"],
  ["ux", "UX"],
  ["engineering", "Engineering"],
  ["qa", "QA"],
  ["analytics", "Analytics"],
  ["marketing", "Marketing & Sales"],
] as const;
const terminal = new Set(["done", "accepted", "qa_pass", "merged", "deployed", "production"]);
const active = new Set(["working", "in_progress", "started"]);
const unavailable = "Недоступно в текущем контракте Company Core";

function time(value: string | null) {
  if (!value) return "Нет данных";
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? value : parsed.toLocaleString("ru-RU");
}
function isGate(value: string) {
  return Boolean(value && !["none", "no", "false", "null"].includes(value.toLowerCase()));
}
function isStale(agent: Agent, now: number) {
  return agent.status.toUpperCase() === "WORKING" &&
    (!agent.last_heartbeat_at || now - new Date(agent.last_heartbeat_at).valueOf() > 60 * 60 * 1000);
}
function taskFor(data: Status, slug: string) {
  return data.tasks.find((task) => task.producer_agent_slug === slug && active.has(task.status.toLowerCase())) ?? null;
}
function issueLink(task: Task) {
  return task.github_issue_number
    ? `https://github.com/Audiolad/audiolad/issues/${task.github_issue_number}`
    : null;
}

async function loadStatus(): Promise<{ data: Status | null; error: string | null }> {
  const base = process.env.COMPANY_CORE_URL ?? process.env.COMPANY_API_URL;
  const token = process.env.COMPANY_API_TOKEN;
  if (!base || !token) return { data: null, error: "Company Core не настроен: отсутствует URL или server token." };
  try {
    const response = await fetch(`${base.replace(/\/$/, "")}/v1/status`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return { data: null, error: `Company Core вернул HTTP ${response.status}.` };
    const data = (await response.json()) as Status;
    if (!data.generated_at || !Array.isArray(data.agents) || !Array.isArray(data.tasks)) {
      return { data: null, error: "Company Core вернул несовместимый payload." };
    }
    return { data, error: null };
  } catch (error) {
    console.error("ai_company_status_load_error", error);
    return { data: null, error: "Company Core сейчас недоступен." };
  }
}

export default async function AiCompanyPage() {
  await requirePlatformOwnerAccess("/admin/ai-company");
  const { data, error } = await loadStatus();
  if (!data) return <main><meta httpEquiv="refresh" content="45" /><h1 className="text-2xl font-semibold">ИИ-компания</h1><div className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-5 text-red-800"><strong>ANDON: нет достоверных live-данных</strong><p className="mt-2 text-sm">{error}</p><p className="mt-2 text-sm">Fake-состояние не подставлено. Повтор через 45 секунд.</p></div></main>;

  const now = new Date(data.generated_at).valueOf();
  const stale = data.agents.filter((agent) => isStale(agent, now));
  const blocked = data.tasks.filter((task) => task.blocked_reason || task.status.toUpperCase() === "BLOCKED");
  const gates = data.tasks.filter((task) => isGate(task.human_gate));
  const andon = data.recent_events.filter((event) => event.event_type.toUpperCase() === "ANDON");
  const pulse = andon.length || gates.length ? "ANDON" : stale.length || blocked.length ? "DEGRADED" : "NORMAL";
  const today = new Date(data.generated_at).toISOString().slice(0, 10);
  const produced = data.tasks.filter((task) => task.updated_at.slice(0, 10) === today && terminal.has(task.status.toLowerCase()));
  const day = Math.floor((now - Date.parse("2026-09-29T00:00:00Z")) / 86400000) + 1;
  const counts = ["WORKING", "WAITING", "AVAILABLE", "BLOCKED"].map((status) => [status, data.agents.filter((agent) => agent.status.toUpperCase() === status).length] as const);

  return <main className="space-y-7">
    <meta httpEquiv="refresh" content="45" />
    <header><h1 className="text-2xl font-semibold">ИИ-компания</h1><p className="mt-1 text-sm text-[#796ba0]">Launch Supervision — Day {Math.max(1, day)} of 7 · автообновление 45 сек.</p></header>

    {(gates.length || andon.length || stale.length || blocked.length) ? <section className="rounded-2xl border border-red-300 bg-red-50 p-5" aria-labelledby="attention"><h2 id="attention" className="text-lg font-semibold text-red-900">Требует внимания</h2><ul className="mt-3 space-y-1 text-sm text-red-800"><li>Human Gates: {gates.length}</li><li>ANDON events: {andon.length}</li><li>STALE agents: {stale.map((agent) => agent.slug).join(", ") || "0"}</li><li>Blocked tasks: {blocked.map((task) => task.title).join(", ") || "0"}</li></ul></section> : null}

    <section className="rounded-2xl border border-[#eadff8] bg-white p-5"><h2 className="text-lg font-semibold">Company Pulse: {pulse}</h2><div className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">{counts.map(([label, count]) => <div key={label}><div className="text-xs text-[#796ba0]">{label}</div><div className="text-xl font-semibold">{count}</div></div>)}<div><div className="text-xs text-[#796ba0]">STALE</div><div className="text-xl font-semibold">{stale.length}</div></div><div><div className="text-xs text-[#796ba0]">Завершено сегодня</div><div className="text-xl font-semibold">{produced.length}</div></div></div><p className="mt-4 text-sm text-[#796ba0]">Обновлено: {time(data.generated_at)} · API cost: ${data.costs.amount_usd} · input {String(data.costs.input_units)} · output {String(data.costs.output_units)}</p></section>

    <section><h2 className="text-xl font-semibold">Агенты</h2><div className="mt-4 grid gap-4 lg:grid-cols-2">{roles.map(([slug, label]) => { const agent = data.agents.find((item) => item.slug === slug || (slug === "marketing" && item.slug.includes("marketing"))); const task = taskFor(data, agent?.slug ?? slug); const events = data.recent_events.filter((event) => event.agent_slug === agent?.slug).slice(0, 5); return <details key={slug} className="rounded-2xl border border-[#eadff8] bg-white p-5"><summary className="cursor-pointer font-semibold">{label} — {agent ? (isStale(agent, now) ? "STALE" : agent.status) : "UNKNOWN"}</summary><dl className="mt-4 grid gap-2 text-sm"><div><dt className="text-[#796ba0]">Current task</dt><dd>{task?.title ?? unavailable}</dd></div><div><dt className="text-[#796ba0]">Started / current step / next queue</dt><dd>{unavailable}</dd></div><div><dt className="text-[#796ba0]">Last heartbeat</dt><dd>{time(agent?.last_heartbeat_at ?? null)}</dd></div><div><dt className="text-[#796ba0]">Blocked/waiting reason</dt><dd>{task?.blocked_reason ?? "Не указан"}</dd></div><div><dt className="text-[#796ba0]">Latest result</dt><dd>{events[0]?.event_type ?? unavailable}</dd></div><div><dt className="text-[#796ba0]">Recent events</dt><dd>{events.map((event) => `${event.event_type} · ${time(event.created_at)}`).join("; ") || "Нет событий"}</dd></div><div><dt className="text-[#796ba0]">Task/heartbeat history, QA/Consumer state, agent cost</dt><dd>{unavailable}</dd></div></dl></details>; })}</div></section>

    <section><h2 className="text-xl font-semibold">Live Event Feed</h2><ol className="mt-3 divide-y rounded-2xl border border-[#eadff8] bg-white px-5">{data.recent_events.length ? data.recent_events.map((event, index) => <li key={`${event.created_at}-${index}`} className="py-3 text-sm"><strong>{event.event_type}</strong> · {event.agent_slug ?? "system"} · {time(event.created_at)}</li>) : <li className="py-4 text-sm text-[#796ba0]">Событий пока нет.</li>}</ol></section>

    <section><h2 className="text-xl font-semibold">Produced Today</h2><ul className="mt-3 space-y-2">{produced.length ? produced.map((task, index) => { const href = issueLink(task); return <li key={`${task.title}-${index}`} className="rounded-xl border border-[#eadff8] bg-white p-4 text-sm"><strong>{task.title}</strong> · {task.status}{href ? <> · <a className="text-[#7042c5] underline" href={href}>Issue #{task.github_issue_number}</a></> : <span className="text-[#796ba0]"> · artifact link unavailable</span>}</li>; }) : <li className="rounded-xl border border-[#eadff8] bg-white p-4 text-sm text-[#796ba0]">Принятых или завершённых outputs сегодня нет.</li>}</ul></section>
    <p className="text-xs text-[#796ba0]">Hourly snapshots и исторические heartbeat не входят в GET /v1/status и на этом экране не выдумываются.</p>
  </main>;
}
