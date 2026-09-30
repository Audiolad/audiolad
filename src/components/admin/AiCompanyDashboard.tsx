import { AI_COMPANY_ROLES, NO_DATA } from "@/lib/admin/ai-company-dashboard";
import type {
  AgentCardModel,
  DashboardModel,
  HistoryFilters,
  TaskDetailModel,
} from "@/lib/admin/ai-company-dashboard";

const TONE_CLASS: Record<AgentCardModel["tone"], string> = {
  working: "border-green-200 bg-green-50",
  waiting: "border-amber-200 bg-amber-50",
  attention: "border-red-200 bg-red-50",
  idle: "border-slate-200 bg-slate-50",
};

type AiCompanyDashboardProps = {
  model: DashboardModel;
  filters: HistoryFilters;
};

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[#796ba0]">{label}</dt>
      <dd className="mt-0.5 whitespace-pre-line break-words">{value}</dd>
    </div>
  );
}

function TaskDetail({ detail }: { detail: TaskDetailModel }) {
  return (
    <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
      <Fact label="Полный исходный текст постановки" value={detail.brief} />
      <Fact label="Время получения" value={detail.receivedAt} />
      <Fact label="Время обновления" value={detail.updatedAt} />
      <div className="min-w-0">
        <dt className="text-[#796ba0]">Источник</dt>
        <dd className="mt-0.5 break-words">
          {detail.sourceHref ? (
            <a className="text-[#7042c5] underline" href={detail.sourceHref}>
              {detail.source}
            </a>
          ) : (
            detail.source
          )}
        </dd>
      </div>
      <Fact label="Ответственный агент" value={detail.agent} />
      <Fact label="Текущий этап" value={detail.stage} />
      <Fact label="История состояний" value={detail.history} />
      <Fact label="Результаты" value={detail.results} />
      <Fact label="Передачи (handoff)" value={detail.handoffs} />
      <Fact label="Проверки контроля качества (QA) и возвраты" value={detail.returns} />
      <Fact label="Состояние контроля качества (QA)" value={detail.qa} />
      <div className="min-w-0">
        <dt className="text-[#796ba0]">PR</dt>
        <dd className="mt-0.5 break-words">
          {detail.prHref ? (
            <a className="text-[#7042c5] underline" href={detail.prHref}>
              {detail.pr}
            </a>
          ) : (
            detail.pr
          )}
        </dd>
      </div>
      <Fact label="CI" value={detail.ci} />
      <Fact label="Ручное разрешение (Human Gate)" value={detail.humanGate} />
      <Fact label="Production" value={detail.production} />
      <Fact label="Итог" value={detail.outcome} />
      <Fact label="Дата завершения" value={detail.completedAt} />
    </dl>
  );
}

export default function AiCompanyDashboard({ model, filters }: AiCompanyDashboardProps) {
  return (
    <div className="space-y-7">
      <header>
        <h2 id="ai-company-heading" className="text-[21px] font-semibold">
          ИИ-компания
        </h2>
        <p className="mt-1 text-sm text-[#796ba0]">
          Операционное табло · автообновление каждые 45 секунд · обновлено {model.generatedAtLabel} (московское время)
        </p>
      </header>

      {model.attention.length ? (
        <section className="rounded-2xl border border-red-300 bg-red-50 p-4 sm:p-5" aria-labelledby="ai-company-attention">
          <h3 id="ai-company-attention" className="text-lg font-semibold text-red-900">
            Требует внимания (Attention)
          </h3>
          <ul className="mt-3 space-y-1 text-sm text-red-800">
            {model.attention.map((item) => (
              <li key={item} className="break-words">
                {item}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="rounded-2xl border border-[#eadff8] bg-white p-4 sm:p-5" aria-labelledby="ai-company-pulse">
        <h3 id="ai-company-pulse" className="text-lg font-semibold">
          Сводка (Company Pulse)
        </h3>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {model.pulse.map((item) => (
            <div key={item.label} className="min-w-0">
              <div className="text-xs text-[#796ba0]">{item.label}</div>
              <div className="text-xl font-semibold tabular-nums">{item.count}</div>
            </div>
          ))}
        </div>
        <p className="mt-4 break-words text-sm text-[#796ba0]">Стоимость API: {model.costsLabel}</p>
      </section>

      <section aria-labelledby="ai-company-agents">
        <h3 id="ai-company-agents" className="text-xl font-semibold">
          Агенты
        </h3>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          {model.agents.map((agent) => (
            <details
              key={agent.slug}
              data-agent={agent.slug}
              data-state={agent.tone}
              className={`rounded-2xl border p-4 sm:p-5 ${TONE_CLASS[agent.tone]}`}
            >
              <summary className="min-h-11 cursor-pointer break-words font-semibold">
                {agent.label} — {agent.stateLabel}
              </summary>
              <dl className="mt-4 grid gap-3 text-sm">
                <Fact label="Текущая задача" value={agent.currentTaskTitle} />
                <Fact label="Идентификатор текущей задачи" value={agent.currentTaskTechnicalId} />
                <Fact label="Текущий этап" value={agent.stage} />
                <Fact label="Время начала" value={agent.startedAt} />
                <Fact label="Последний сигнал жизнеспособности (heartbeat)" value={agent.heartbeat} />
                <Fact label="Свежесть сигнала" value={agent.freshness} />
                <Fact label="Последний измеримый результат" value={agent.latestResult} />
                <Fact label="Причина ожидания или блокировки" value={agent.waitReason} />
                <Fact label="Кому передан результат" value={agent.handoff} />
                <Fact label="Состояние контроля качества (QA)" value={agent.qaState} />
              </dl>
            </details>
          ))}
        </div>
      </section>

      <section aria-labelledby="ai-company-today">
        <h3 id="ai-company-today" className="text-xl font-semibold">
          Сегодня в компании
        </h3>
        <p className="mt-1 text-xs text-[#796ba0]">{model.todayNote}</p>
        <div className="mt-3 space-y-2" data-section="today">
          {model.todayRows.length ? (
            model.todayRows.map((row) => (
              <details key={row.key} className="rounded-xl border border-[#eadff8] bg-white p-3 text-sm sm:p-4">
                <summary className="min-h-11 cursor-pointer break-words">
                  <span className="font-semibold">{row.timeLabel}</span>
                  {" → "}
                  {row.title}
                  {" → "}
                  {row.statusLabel}
                  {" → "}
                  {row.agentLabel}
                </summary>
                <TaskDetail detail={row.detail} />
              </details>
            ))
          ) : (
            <p className="rounded-xl border border-[#eadff8] bg-white p-4 text-sm text-[#796ba0]">
              {NO_DATA}: задач с достоверным временем поступления за сегодня нет.
            </p>
          )}
        </div>
      </section>

      <section aria-labelledby="ai-company-history">
        <h3 id="ai-company-history" className="text-xl font-semibold">
          История работы
        </h3>
        <p className="mt-1 text-sm text-[#796ba0]">{model.historySummary}</p>
        <form className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap" method="get">
          <label className="flex min-w-0 flex-col gap-1 text-xs text-[#796ba0]">
            Период
            <select name="period" defaultValue={filters.period} className="rounded-lg border border-[#eadff8] bg-white p-2 text-sm text-[#25135c]">
              <option value="all">Все периоды</option>
              <option value="today">Сегодня</option>
              <option value="week">Неделя</option>
              <option value="month">Месяц</option>
            </select>
          </label>
          <label className="flex min-w-0 flex-col gap-1 text-xs text-[#796ba0]">
            Состояние
            <input
              name="status"
              defaultValue={filters.status}
              placeholder="Например, done"
              className="rounded-lg border border-[#eadff8] bg-white p-2 text-sm text-[#25135c]"
            />
          </label>
          <label className="flex min-w-0 flex-col gap-1 text-xs text-[#796ba0]">
            Агент
            <select name="agent" defaultValue={filters.agent} className="rounded-lg border border-[#eadff8] bg-white p-2 text-sm text-[#25135c]">
              <option value="">Все агенты</option>
              {AI_COMPANY_ROLES.map(([slug, label]) => (
                <option key={slug} value={slug}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <button className="mt-auto min-h-11 rounded-lg bg-[#7042c5] px-4 py-2 text-sm font-semibold text-white" type="submit">
            Применить
          </button>
        </form>
        <div className="mt-3 space-y-2" data-section="history">
          {model.history.length ? (
            model.history.map((detail) => (
              <details key={detail.key} className="rounded-xl border border-[#eadff8] bg-white p-3 text-sm sm:p-4">
                <summary className="min-h-11 cursor-pointer break-words font-semibold">
                  {detail.title} · {detail.statusLabel}
                </summary>
                <TaskDetail detail={detail} />
              </details>
            ))
          ) : (
            <p className="rounded-xl border border-[#eadff8] bg-white p-4 text-sm text-[#796ba0]">
              Завершённых задач по выбранным фильтрам нет. Контроль качества (QA PASS) сам по себе сюда не попадает.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
