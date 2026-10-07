"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type ReactNode } from "react";

import { AI_COMPANY_ROLES, NO_DATA, historyHref } from "@/lib/admin/ai-company-dashboard";
import { useAiCompanyDisclosureState } from "@/lib/admin/ai-company-disclosure";
import type {
  ActiveTaskCard,
  AgentCardModel,
  DashboardModel,
  EngineeringPanel,
  ExecutorCard,
  GateCard,
  HistoryFilters,
  QuotaLine,
  StageBadge,
  StageTone,
  TaskDetailModel,
  TodayRowModel,
  WorkEventModel,
} from "@/lib/admin/ai-company-dashboard";

const TONE_CLASS: Record<AgentCardModel["tone"], string> = {
  working: "border-green-200 bg-green-50",
  waiting: "border-amber-200 bg-amber-50",
  attention: "border-red-200 bg-red-50",
  idle: "border-slate-200 bg-slate-50",
  offline: "border-slate-300 bg-slate-100",
  unknown: "border-[#eadff8] bg-white",
};

const CONNECTION_CLASS: Record<ExecutorCard["connection"], string> = {
  online: "border-green-200 bg-green-50",
  idle: "border-slate-200 bg-slate-50",
  not_connected: "border-slate-300 bg-slate-100",
  no_fresh_data: "border-[#eadff8] bg-white",
};

const STAGE_BADGE_CLASS: Record<StageTone, string> = {
  queue: "border-slate-300 bg-slate-100 text-slate-800",
  working: "border-sky-300 bg-sky-100 text-sky-950",
  review: "border-amber-300 bg-amber-100 text-amber-950",
  release: "border-orange-300 bg-orange-100 text-orange-950",
  site: "border-indigo-300 bg-indigo-100 text-indigo-950",
  done: "border-green-300 bg-green-100 text-green-900",
  decision: "border-red-300 bg-red-100 text-red-900",
  blocked: "border-red-400 bg-red-50 text-red-950",
  cancelled: "border-zinc-300 bg-zinc-200 text-zinc-800",
  stale: "border-stone-300 bg-stone-100 text-stone-800",
};

const ROW_BUTTON =
  "flex min-h-12 w-full max-w-full flex-wrap items-center gap-x-2 gap-y-1 px-3 py-1.5 text-left text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5] sm:h-14 sm:flex-nowrap";

type AiCompanyDashboardProps = {
  model: DashboardModel | null;
  filters: HistoryFilters;
  sourceError: string | null;
};

function knownValue(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed || trimmed === NO_DATA) return null;
  return trimmed;
}

function panelDomId(rowKey: string): string {
  const safe = rowKey.replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  return `ai-company-panel-${safe || "row"}`;
}

function shortReason(value: string): string {
  const line = value.replace(/\s+/g, " ").trim();
  if (!line || line === NO_DATA) return "Нужно внимание";
  return line.length > 72 ? `${line.slice(0, 72)}…` : line;
}

function StageBadgeLabel({ badge }: { badge: StageBadge }) {
  return (
    <span
      data-stage-badge={badge.tone}
      className={`inline-block min-w-0 max-w-full whitespace-normal break-words rounded-full border px-2.5 py-1 text-xs font-semibold leading-snug ${STAGE_BADGE_CLASS[badge.tone]}`}
    >
      {badge.label}
    </span>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[#796ba0]">{label}</dt>
      <dd className="mt-0.5 whitespace-pre-line break-words">{value || NO_DATA}</dd>
    </div>
  );
}

function EngineeringFacts({ panel }: { panel: EngineeringPanel }) {
  return (
    <>
      <Fact label="CI" value={panel.ci} />
      <Fact label="Независимая проверка точного SHA" value={panel.independentReview} />
      <Fact label="Выкладка (deploy)" value={panel.deploy} />
      <Fact label="Проверка на production" value={panel.production} />
    </>
  );
}

function HelpNote({ label, children }: { label: string; children: ReactNode }) {
  return (
    <details className="mt-1 text-xs text-[#796ba0]">
      <summary className="min-h-8 cursor-pointer text-[#7042c5]">{label}</summary>
      <div className="mt-1 max-w-3xl space-y-1">{children}</div>
    </details>
  );
}

function TaskCopyButton({ text }: { text: string }) {
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const [phase, setPhase] = useState<"idle" | "copied" | "fallback">("idle");

  async function copy() {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("clipboard unavailable");
      await navigator.clipboard.writeText(text);
      setPhase("copied");
    } catch {
      setPhase("fallback");
    }
  }

  return (
    <div className="mt-3 max-w-full" data-task-copy="true">
      <button
        type="button"
        aria-label="Скопировать данные задачи"
        onClick={(event) => {
          event.stopPropagation();
          void copy();
        }}
        className="min-h-11 rounded-lg border border-[#7042c5] bg-white px-3 py-2 text-sm font-semibold text-[#7042c5] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
      >
        Скопировать данные
      </button>
      {phase === "copied" ? (
        <p className="mt-2 text-sm text-[#3f6212]" role="status">
          Скопировано
        </p>
      ) : null}
      {phase === "fallback" ? (
        <div className="mt-2 max-w-full">
          <p className="text-sm text-red-800" role="alert">
            Буфер обмена недоступен. Текст ниже можно выделить целиком.
          </p>
          <textarea
            ref={areaRef}
            readOnly
            value={text}
            rows={8}
            className="mt-2 box-border w-full max-w-full whitespace-pre-wrap rounded-lg border border-[#eadff8] bg-white p-2 text-sm text-[#25135c]"
            aria-label="Текст задачи для копирования"
          />
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              const area = areaRef.current;
              if (!area) return;
              area.focus();
              area.select();
            }}
            className="mt-2 min-h-11 rounded-lg bg-[#7042c5] px-3 py-2 text-sm font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
          >
            Выделить всё
          </button>
        </div>
      ) : null}
    </div>
  );
}

function TaskDetail({ detail }: { detail: TaskDetailModel }) {
  return (
    <>
    <TaskCopyButton text={detail.copyText} />
    <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
      <Fact label="Идентификатор задачи" value={detail.taskId} />
      <Fact label="Полный исходный текст постановки" value={detail.brief} />
      <Fact label="Создание записи" value={detail.createdAt} />
      <Fact label="Время получения" value={detail.receivedAt} />
      <Fact label="Время начала" value={detail.startedAt} />
      <Fact label="Последнее событие" value={detail.lastEventAt} />
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
      <Fact label="Функциональная роль" value={detail.agent} />
      <Fact label="Фактический исполнитель" value={detail.executor} />
      <Fact label="Текущий этап" value={detail.stageBadge.label} />
      {detail.stageBadge.detail ? <Fact label="Уточнение этапа" value={detail.stageBadge.detail} /> : null}
      <Fact label="Технический статус" value={detail.statusLabel} />
      <Fact label="Проверенный прогресс" value={detail.progress} />
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
      <EngineeringFacts panel={detail.engineering} />
      <Fact label="Ручное разрешение (Human Gate)" value={detail.humanGate} />
      <Fact label="Итог" value={detail.outcome} />
      <Fact label="Дата завершения" value={detail.completedAt} />
    </dl>
    </>
  );
}

function CompactRow({
  rowKey,
  title,
  aside,
  time,
  badge,
  attention,
  open,
  onToggle,
  children,
  className = "",
  articleProps,
}: {
  rowKey: string;
  title: string;
  aside?: string | null;
  time?: string | null;
  badge?: StageBadge | null;
  attention?: string | null;
  open: boolean;
  onToggle?: (key: string, open: boolean) => void;
  children: ReactNode;
  className?: string;
  articleProps?: Record<string, string>;
}) {
  const expanded = open === true;
  const panelId = panelDomId(rowKey);
  return (
    <article data-compact-row={rowKey} className={`max-w-full overflow-hidden rounded-xl border text-sm ${className}`} {...articleProps}>
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={panelId}
        onClick={() => onToggle?.(rowKey, !expanded)}
        className={ROW_BUTTON}
      >
        <span className="line-clamp-2 min-w-0 flex-1 basis-full break-words font-semibold sm:basis-0 sm:line-clamp-1">
          {title}
        </span>
        {aside ? <span className="max-w-[9rem] shrink-0 truncate text-xs text-[#5c4d86]">{aside}</span> : null}
        {attention ? (
          <span className="max-w-[14rem] shrink truncate text-xs text-[#9f1239]">{attention}</span>
        ) : null}
        {time ? <span className="shrink-0 whitespace-nowrap text-xs tabular-nums text-[#796ba0]">{time}</span> : null}
        {badge ? (
          <span className="ml-auto max-w-[46%] shrink-0 sm:max-w-none">
            <StageBadgeLabel badge={badge} />
          </span>
        ) : null}
        <span aria-hidden="true" className="shrink-0 text-xs text-[#7042c5]">
          {expanded ? "▴" : "▾"}
        </span>
      </button>
      <div
        id={panelId}
        hidden={!expanded}
        className="border-t border-[#eadff8] px-3 pb-3"
        onClick={(event) => event.stopPropagation()}
      >
        <p className="mt-3 break-words font-semibold">{title}</p>
        {children}
      </div>
    </article>
  );
}

function GateList({
  gates,
  openDetails,
  onToggleDetail,
  attention,
  rowPrefix,
}: {
  gates: GateCard[];
  openDetails?: Record<string, boolean>;
  onToggleDetail?: (key: string, open: boolean) => void;
  attention?: boolean;
  rowPrefix: string;
}) {
  return (
    <ul className="mt-2 flex flex-col gap-1.5">
      {gates.map((gate) => {
        const rowKey = `${rowPrefix}:${gate.key}`;
        return (
          <li key={rowKey}>
            <CompactRow
              rowKey={rowKey}
              title={gate.taskTitle}
              aside={gate.decisionOwner}
              attention={attention ? shortReason(gate.reason) : null}
              open={openDetails?.[rowKey] ?? false}
              onToggle={onToggleDetail}
              className={attention ? "border-red-200 bg-white/80" : "border-[#eadff8] bg-white"}
              articleProps={{ "data-decision-owner": gate.decisionOwner }}
            >
              <TaskCopyButton text={gate.copyText} />
              <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                {gate.historical ? <Fact label="Метка" value="Историческая блокировка" /> : null}
                <Fact label="Причина" value={gate.reason} />
                <Fact label="Свежесть" value={gate.freshness} />
                <Fact label="Кто разбирает" value={gate.decisionOwner} />
                <Fact label="Запрос" value={gate.request} />
                <Fact label="Следующий шаг" value={gate.nextAction} />
              </dl>
            </CompactRow>
          </li>
        );
      })}
    </ul>
  );
}

function TaskRow({
  detail,
  rowKey,
  open,
  onToggle,
  extra,
  articleProps,
}: {
  detail: TaskDetailModel;
  rowKey: string;
  open: boolean;
  onToggle?: (key: string, open: boolean) => void;
  extra?: ReactNode;
  articleProps?: Record<string, string>;
}) {
  return (
    <CompactRow
      rowKey={rowKey}
      title={detail.title}
      aside={knownValue(detail.executor)}
      time={knownValue(detail.lastEventAt)}
      badge={detail.stageBadge}
      open={open}
      onToggle={onToggle}
      className="border-[#eadff8] bg-white"
      articleProps={articleProps}
    >
      {extra}
      <TaskDetail detail={detail} />
    </CompactRow>
  );
}

function TodayList({
  rows,
  empty,
  openDetails,
  onToggleDetail,
  rowPrefix,
}: {
  rows: TodayRowModel[];
  empty: string;
  openDetails?: Record<string, boolean>;
  onToggleDetail?: (key: string, open: boolean) => void;
  rowPrefix: string;
}) {
  if (!rows.length) return <p className="rounded-xl border border-[#eadff8] bg-white p-3 text-sm text-[#796ba0]">{empty}</p>;
  return (
    <div className="mt-1.5 flex flex-col gap-1.5">
      {rows.map((row) => {
        const rowKey = `${rowPrefix}:${row.key}`;
        return (
          <TaskRow
            key={rowKey}
            detail={row.detail}
            rowKey={rowKey}
            open={openDetails?.[rowKey] ?? false}
            onToggle={onToggleDetail}
          />
        );
      })}
    </div>
  );
}

function ActiveCard({
  task,
  open,
  onToggle,
}: {
  task: ActiveTaskCard;
  open: boolean;
  onToggle?: (key: string, open: boolean) => void;
}) {
  const rowKey = `now:${task.key}`;
  return (
    <TaskRow
      detail={task.detail}
      rowKey={rowKey}
      open={open}
      onToggle={onToggle}
      articleProps={{ "data-active-task": task.taskId }}
      extra={
        <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
          <Fact label="Приоритет" value={task.priority} />
          <Fact label="Функциональная роль" value={task.functionalRole} />
          <Fact label="Фактический исполнитель" value={task.executorLabel} />
          <Fact label="Этап" value={task.detail.stageBadge.label} />
          <Fact label="Итог" value={task.detail.outcome} />
          <Fact label="Проверенный прогресс" value={task.progress} />
          <Fact label="Последнее событие" value={task.lastEvent} />
          <Fact label="Следующий шаг" value={task.nextStep} />
          {task.executorNote ? <Fact label="Канал модели" value={task.executorNote} /> : null}
          {task.codexNote ? <Fact label="Готовность Codex" value={task.codexNote} /> : null}
          <EngineeringFacts panel={task.engineering} />
        </dl>
      }
    />
  );
}

function WorkEventRow({
  event,
  open,
  onToggle,
}: {
  event: WorkEventModel;
  open: boolean;
  onToggle?: (key: string, open: boolean) => void;
}) {
  const rowKey = `event:${event.key}`;
  return (
    <CompactRow
      rowKey={rowKey}
      title={event.text}
      time={knownValue(event.timeLabel)}
      open={open}
      onToggle={onToggle}
      className="border-[#eadff8] bg-white"
    >
      <p className="mt-3 break-words text-sm">{event.text}</p>
    </CompactRow>
  );
}

function QuotaCard({ line }: { line: QuotaLine }) {
  return (
    <article className="rounded-2xl border border-[#eadff8] bg-white p-4" data-quota={line.id}>
      <h4 className="font-semibold">{line.label}</h4>
      <p className="mt-2 break-words text-sm">{line.value}</p>
      <p className="mt-2 break-words text-xs text-[#796ba0]">{line.checkPath}</p>
    </article>
  );
}

export function AiCompanyDashboardView({
  model,
  filters,
  sourceError,
  onRefresh,
  openDetails = {},
  onToggleDetail,
}: AiCompanyDashboardProps & {
  onRefresh: () => void;
  openDetails?: Record<string, boolean>;
  onToggleDetail?: (key: string, open: boolean) => void;
}) {
  const nextHistory = model
    ? historyHref(filters, {
        historyOffset: model.historyNextOffset ?? undefined,
        historyBefore: model.historyNextOffset == null ? model.historyNextCursor ?? undefined : undefined,
      })
    : null;
  const showNext = Boolean(model && (model.historyNextOffset != null || model.historyNextCursor));
  const receiptMissing = model?.todayNote.startsWith("Нет данных") ?? false;

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h2 id="ai-company-heading" className="text-[21px] font-semibold">
            ИИ-компания
          </h2>
          <p className="mt-1 break-words text-sm text-[#796ba0]" data-freshness="snapshot">
            {model ? model.freshnessLabel : "Свежесть: нет данных"}
          </p>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          className="min-h-11 rounded-lg bg-[#7042c5] px-4 py-2 text-sm font-semibold text-white"
        >
          Обновить данные
        </button>
      </header>

      {sourceError ? (
        <section className="rounded-2xl border border-red-300 bg-red-50 p-4 sm:p-5" aria-labelledby="ai-company-unavailable">
          <h3 id="ai-company-unavailable" className="text-lg font-semibold text-red-900">
            Company Core недоступен
          </h3>
          <p className="mt-2 break-words text-sm text-red-800">{sourceError}</p>
          <p className="mt-2 text-sm text-red-800">
            Возраст данных: нет данных. Нулевая активность не показана: фиктивные нули не подставлены.
          </p>
        </section>
      ) : null}

      {model ? (
        <>
          <section aria-labelledby="ai-company-now" data-section="now">
            <h3 id="ai-company-now" className="text-xl font-semibold">
              Сейчас в работе
            </h3>
            <p className="mt-1 text-sm text-[#796ba0]">{model.activeBoundary}</p>
            <div className="mt-2 flex flex-col gap-1.5">
              {model.activeTasks.length ? (
                model.activeTasks.map((task) => (
                  <ActiveCard
                    key={task.key}
                    task={task}
                    open={openDetails[`now:${task.key}`] ?? false}
                    onToggle={onToggleDetail}
                  />
                ))
              ) : (
                <p className="rounded-xl border border-[#eadff8] bg-white p-3 text-sm text-[#796ba0]">
                  {NO_DATA}: активных задач в полученном срезе нет.
                </p>
              )}
            </div>
          </section>

          {model.decisions.length ? (
            <section className="rounded-2xl border border-red-300 bg-red-50 p-3 sm:p-4" aria-labelledby="ai-company-decisions" data-section="decisions">
              <h3 id="ai-company-decisions" className="text-lg font-semibold text-red-900">
                Нужно решение
              </h3>
              <p className="mt-1 text-xs text-red-800">Текущие решения видны в списке. Владелец строки — тот, кто записан в источнике.</p>
              <GateList
                gates={model.decisions}
                openDetails={openDetails}
                onToggleDetail={onToggleDetail}
                attention
                rowPrefix="gate"
              />
            </section>
          ) : null}

          <section aria-labelledby="ai-company-executors" data-section="executors">
            <h3 id="ai-company-executors" className="text-xl font-semibold">
              Исполнители
            </h3>
            <p className="mt-1 text-sm text-[#796ba0]">В строке — имя и достоверное состояние подключения.</p>
            <HelpNote label="Справка об исполнителях">
              <p>
                Фактические исполнители: запуск, задача и свежесть. Состояния: не подключён, свободен, нет данных, работает. Grok оркеструет и не является отдельным runner. Модель Grok внутри Cursor остаётся Cursor.
              </p>
            </HelpNote>
            <div className="mt-2 flex flex-col gap-1.5">
              {model.executors.map((executor) => {
                const rowKey = `executor:${executor.id}`;
                return (
                  <CompactRow
                    key={rowKey}
                    rowKey={rowKey}
                    title={executor.label}
                    aside={executor.connectionLabel}
                    open={openDetails[rowKey] ?? false}
                    onToggle={onToggleDetail}
                    className={CONNECTION_CLASS[executor.connection]}
                    articleProps={{ "data-executor": executor.id, "data-connection": executor.connection }}
                  >
                    <p className="mt-2 text-sm text-[#796ba0]">{executor.roleNote}</p>
                    <dl className="mt-3 grid gap-2 text-sm">
                      <Fact label="Состояние" value={executor.connectionLabel} />
                      <Fact label="Задача" value={executor.currentTask} />
                      <Fact label="Запуск" value={executor.runId} />
                      <Fact label="Свежесть" value={executor.freshness} />
                      <Fact label="Последний сигнал" value={executor.heartbeat} />
                      <Fact label="Уточнение" value={executor.detail} />
                    </dl>
                  </CompactRow>
                );
              })}
            </div>
          </section>

          <section aria-labelledby="ai-company-roles" data-section="roles">
            <h3 id="ai-company-roles" className="text-xl font-semibold">
              Роли компании
            </h3>
            <p className="mt-1 text-sm text-[#796ba0]">В строке — роль и достоверное состояние. Это функции компании, не число запущенных процессов.</p>
            <HelpNote label="Справка о ролях">
              <p>
                Восемь функций компании, не восемь запущенных процессов. Product, Engineering, QA и Analytics назначает Grok по нужде. QA остаётся независимой. Старые роли не запускаются ради показателей.
              </p>
            </HelpNote>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {model.pulse.map((item) => (
                <div key={item.label} className="min-w-0">
                  <div className="text-xs text-[#796ba0]">{item.label}</div>
                  <div className="text-lg font-semibold tabular-nums">{item.count}</div>
                </div>
              ))}
            </div>
            <div className="mt-2 flex flex-col gap-1.5">
              {model.agents.map((agent) => {
                const rowKey = `role:${agent.slug}`;
                return (
                  <CompactRow
                    key={rowKey}
                    rowKey={rowKey}
                    title={agent.label}
                    aside={agent.stateLabel}
                    open={openDetails[rowKey] ?? false}
                    onToggle={onToggleDetail}
                    className={TONE_CLASS[agent.tone]}
                    articleProps={{ "data-agent": agent.slug, "data-state": agent.tone }}
                  >
                    <dl className="mt-3 grid gap-3 text-sm">
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
                  </CompactRow>
                );
              })}
            </div>
          </section>

          <section aria-labelledby="ai-company-today" data-section="today">
            <h3 id="ai-company-today" className="text-xl font-semibold">
              Сегодня
            </h3>
            <p className="mt-1 text-xs text-[#796ba0]">
              {receiptMissing ? model.todayNote : "Новые сверху. Возраст списка не берётся из updated_at."}
            </p>
            <HelpNote label="Справка о порядке списков">
              <p>{model.todayNote}</p>
              <p>Получены сегодня: порядок received_at, новые сверху.</p>
              <p>Созданы сегодня: порядок created_at, новые сверху. Это запасной список, не received_at и не updated_at.</p>
              <p>Завершены сегодня: порядок completed_at, новые сверху.</p>
            </HelpNote>
            <div className="mt-2 space-y-3">
              <div data-section="received">
                <h4 className="font-semibold">Получены сегодня · {model.todayReceived.length}</h4>
                <TodayList
                  rows={model.todayReceived}
                  empty={`${NO_DATA}: получения за московские сутки снимка нет.`}
                  openDetails={openDetails}
                  onToggleDetail={onToggleDetail}
                  rowPrefix="received"
                />
              </div>
              <div data-section="created">
                <h4 className="font-semibold">Созданы сегодня · {model.todayCreated.length}</h4>
                <TodayList
                  rows={model.todayCreated}
                  empty={`${NO_DATA}: создания записи за эти сутки нет.`}
                  openDetails={openDetails}
                  onToggleDetail={onToggleDetail}
                  rowPrefix="created"
                />
              </div>
              <div data-section="work-events">
                <h4 className="font-semibold">События работы сегодня · {model.todayWorkEvents.length}</h4>
                <div className="mt-1.5 flex flex-col gap-1.5">
                  {model.todayWorkEvents.length ? (
                    model.todayWorkEvents.map((event) => (
                      <WorkEventRow
                        key={event.key}
                        event={event}
                        open={openDetails[`event:${event.key}`] ?? false}
                        onToggle={onToggleDetail}
                      />
                    ))
                  ) : (
                    <p className="rounded-xl border border-[#eadff8] bg-white p-3 text-sm text-[#796ba0]">
                      {NO_DATA}: событий работы за эти сутки нет.
                    </p>
                  )}
                </div>
              </div>
              <div data-section="completed-today">
                <h4 className="font-semibold">Завершены сегодня · {model.todayCompleted.length}</h4>
                <TodayList
                  rows={model.todayCompleted}
                  empty={`${NO_DATA}: завершений по критерию готовности за эти сутки нет.`}
                  openDetails={openDetails}
                  onToggleDetail={onToggleDetail}
                  rowPrefix="completed"
                />
              </div>
            </div>
          </section>

          <section aria-labelledby="ai-company-queue" data-section="queue">
            <h3 id="ai-company-queue" className="text-xl font-semibold">
              Очередь
            </h3>
            <div className="mt-2 flex flex-col gap-1.5">
              {model.queue.length ? (
                model.queue.map((detail) => {
                  const rowKey = `queue:${detail.key}`;
                  return (
                    <TaskRow
                      key={rowKey}
                      detail={detail}
                      rowKey={rowKey}
                      open={openDetails[rowKey] ?? false}
                      onToggle={onToggleDetail}
                    />
                  );
                })
              ) : (
                <p className="rounded-xl border border-[#eadff8] bg-white p-3 text-sm text-[#796ba0]">
                  Неначатых задач в очереди нет.
                </p>
              )}
            </div>
          </section>

          <section aria-labelledby="ai-company-quotas" data-section="quotas">
            <h3 id="ai-company-quotas" className="text-xl font-semibold">
              Квоты и расход
            </h3>
            <div className="mt-3 grid gap-4 lg:grid-cols-2">
              {model.quotas.map((line) => (
                <QuotaCard key={line.id} line={line} />
              ))}
            </div>
          </section>

          <section aria-labelledby="ai-company-history" data-section="history">
            <h3 id="ai-company-history" className="text-xl font-semibold">
              Завершённые результаты
            </h3>
            <p className="mt-1 text-sm text-[#796ba0]">{model.historySummary}</p>
            <p className="mt-1 text-sm text-[#796ba0]">{model.historyBoundary}</p>
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
                Роль
                <select name="agent" defaultValue={filters.agent} className="rounded-lg border border-[#eadff8] bg-white p-2 text-sm text-[#25135c]">
                  <option value="">Все роли</option>
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
            <div className="mt-2 flex flex-col gap-1.5">
              {model.history.length ? (
                model.history.map((detail) => {
                  const rowKey = `history:${detail.key}`;
                  return (
                    <TaskRow
                      key={rowKey}
                      detail={detail}
                      rowKey={rowKey}
                      open={openDetails[rowKey] ?? false}
                      onToggle={onToggleDetail}
                    />
                  );
                })
              ) : (
                <p className="rounded-xl border border-[#eadff8] bg-white p-3 text-sm text-[#796ba0]">
                  Завершённых задач по выбранным фильтрам нет. Контроль качества (QA PASS), слияние и зелёный CI сами по себе сюда не попадают.
                </p>
              )}
            </div>
            {showNext && nextHistory ? (
              <a className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-[#7042c5] underline" href={nextHistory}>
                Следующая страница истории
              </a>
            ) : null}
            {model.archivedBlockers.length ? (
              <div className="mt-4" data-section="archived">
                <h4 className="font-semibold">История блокировок</h4>
                <p className="mt-1 text-xs text-[#796ba0]">Историческая или уже снятая блокировка. Текущие решения остаются в красном блоке.</p>
                <GateList
                  gates={model.archivedBlockers}
                  openDetails={openDetails}
                  onToggleDetail={onToggleDetail}
                  rowPrefix="archive"
                />
              </div>
            ) : null}
          </section>
        </>
      ) : null}
    </div>
  );
}

export default function AiCompanyDashboard(props: AiCompanyDashboardProps) {
  const router = useRouter();
  const { openDetails, onToggleDetail } = useAiCompanyDisclosureState();

  return (
    <div data-refresh="route" data-open-details={Object.keys(openDetails).filter((key) => openDetails[key]).join(" ")}>
      <AiCompanyDashboardView
        {...props}
        onRefresh={() => router.refresh()}
        openDetails={openDetails}
        onToggleDetail={onToggleDetail}
      />
    </div>
  );
}
