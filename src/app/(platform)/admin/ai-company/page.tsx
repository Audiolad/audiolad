import Link from "next/link";

import {
  getAiCompanySnapshot,
  type AiCompanyTask,
} from "@/lib/admin/ai-company-github";
import { requireAdminPermission } from "@/lib/admin/guard";

export const dynamic = "force-dynamic";

function formatMoscow(value: string): string {
  try {
    return new Intl.DateTimeFormat("ru-RU", {
      dateStyle: "short",
      timeStyle: "short",
      timeZone: "Europe/Moscow",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function statusClass(status: string): string {
  const value = status.toLowerCase();

  if (value === "human gate") {
    return "border-[#f0c6cb] bg-[#fff6f7] text-[#ad4658]";
  }

  if (value === "ready") {
    return "border-[#d7cdf1] bg-[#f8f5ff] text-[#7042c5]";
  }

  if (value === "done" || value === "production") {
    return "border-[#cfe5d8] bg-[#f4fbf7] text-[#347554]";
  }

  return "border-[#dcd7e8] bg-white text-[#655b7d]";
}

function TaskCard({ task }: { task: AiCompanyTask }) {
  return (
    <Link
      href={task.url}
      target="_blank"
      rel="noreferrer"
      className="block rounded-[20px] border border-[#e4dff0] bg-white p-4 transition-shadow hover:shadow-sm"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-[#8a7aa9]">#{task.number}</span>
        <span
          className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClass(
            task.status,
          )}`}
        >
          {task.status}
        </span>
        <span className="rounded-full bg-[#f3effa] px-2.5 py-1 text-xs font-semibold text-[#7042c5]">
          {task.priority}
        </span>
        {task.blocked ? (
          <span className="rounded-full bg-[#fff0f2] px-2.5 py-1 text-xs font-semibold text-[#ad4658]">
            Blocked
          </span>
        ) : null}
      </div>

      <h3 className="mt-3 text-base font-semibold text-[#25135c]">{task.title}</h3>

      <div className="mt-3 grid gap-2 text-xs text-[#756a8f] sm:grid-cols-2">
        <p>
          <span className="font-semibold text-[#514669]">Producer:</span>{" "}
          {task.producer || "не назначен"}
        </p>
        <p>
          <span className="font-semibold text-[#514669]">Consumer:</span>{" "}
          {task.resultConsumer || "не указан"}
        </p>
      </div>

      {task.nextAction ? (
        <p className="mt-3 text-sm leading-6 text-[#514669]">
          <span className="font-semibold">Дальше:</span> {task.nextAction}
        </p>
      ) : null}
    </Link>
  );
}

export default async function AiCompanyAdminPage() {
  await requireAdminPermission("dashboard.view");
  const snapshot = await getAiCompanySnapshot();

  const cards = [
    ["Ready", snapshot.counts.ready, "готовы к запуску"],
    ["В работе", snapshot.counts.active, "активный поток"],
    ["Human Gate", snapshot.counts.humanGate, "нужны решения"],
    ["Blocked", snapshot.counts.blocked, "остановленный поток"],
  ] as const;

  return (
    <div className="space-y-8">
      <section className="rounded-[24px] border border-[#ddd3ef] bg-white p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-4xl">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#8a75b6]">
              North Star
            </p>
            <h2 className="mt-2 text-[22px] font-semibold leading-tight text-[#25135c]">
              {snapshot.goal?.goal ||
                snapshot.goal?.title ||
                "Стратегическая цель ещё не создана"}
            </h2>
            {snapshot.goal?.why ? (
              <p className="mt-3 max-w-3xl text-sm leading-6 text-[#625878]">
                {snapshot.goal.why}
              </p>
            ) : null}
          </div>

          {snapshot.goal ? (
            <Link
              href={snapshot.goal.url}
              target="_blank"
              rel="noreferrer"
              className="rounded-full border border-[#d8caed] px-4 py-2 text-sm font-semibold text-[#7042c5]"
            >
              Открыть цель
            </Link>
          ) : null}
        </div>

        {snapshot.goal?.idealOutcome ? (
          <div className="mt-5 rounded-[18px] bg-[#f8f5ff] p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#8a75b6]">
              Картина идеального результата
            </p>
            <p className="mt-2 whitespace-pre-line text-sm leading-6 text-[#514669]">
              {snapshot.goal.idealOutcome}
            </p>
          </div>
        ) : null}
      </section>

      <section>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {cards.map(([label, value, note]) => (
            <div
              key={label}
              className="rounded-[20px] border border-[#e4dff0] bg-white p-4"
            >
              <p className="text-xs font-semibold text-[#81749b]">{label}</p>
              <p className="mt-1 text-3xl font-semibold tabular-nums text-[#25135c]">
                {value}
              </p>
              <p className="mt-1 text-xs text-[#9187a5]">{note}</p>
            </div>
          ))}
        </div>
      </section>

      {snapshot.error ? (
        <section className="rounded-[20px] border border-[#efc7cf] bg-[#fff8f9] p-4 text-sm text-[#a94d60]">
          GitHub сейчас не удалось обновить: {snapshot.error}. Последние данные не
          выдумываются.
        </section>
      ) : null}

      <section>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-[20px] font-semibold text-[#25135c]">Агенты</h2>
            <p className="mt-1 text-sm text-[#796ba0]">
              Текущее состояние первого штата по Producer активных задач.
            </p>
          </div>
          <p className="text-xs text-[#9187a5]">
            GitHub · {formatMoscow(snapshot.fetchedAt)} МСК
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {snapshot.agents.map((agent) => (
            <div
              key={agent.name}
              className="rounded-[20px] border border-[#e4dff0] bg-white p-4"
            >
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-semibold text-[#25135c]">{agent.name}</h3>
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                    agent.state === "active"
                      ? "bg-[#eef8f2] text-[#347554]"
                      : "bg-[#f4f1f8] text-[#81749b]"
                  }`}
                >
                  {agent.state === "active" ? "работает" : "свободен"}
                </span>
              </div>

              {agent.task ? (
                <Link
                  href={agent.task.url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 block text-sm leading-5 text-[#625878] hover:text-[#7042c5]"
                >
                  #{agent.task.number} · {agent.task.title}
                </Link>
              ) : (
                <p className="mt-3 text-sm text-[#9a91aa]">Активной задачи нет</p>
              )}
            </div>
          ))}
        </div>
      </section>

      <section>
        <div className="mb-4">
          <h2 className="text-[20px] font-semibold text-[#25135c]">Human Gates</h2>
          <p className="mt-1 text-sm text-[#796ba0]">
            Только вопросы, где автономный поток должен остановиться.
          </p>
        </div>

        {snapshot.humanGates.length === 0 ? (
          <div className="rounded-[20px] border border-[#cfe5d8] bg-[#f6fbf8] p-4 text-sm text-[#347554]">
            Решений по Human Gate сейчас не требуется.
          </div>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {snapshot.humanGates.map((task) => (
              <TaskCard key={task.number} task={task} />
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-[20px] font-semibold text-[#25135c]">
              Рабочий поток
            </h2>
            <p className="mt-1 text-sm text-[#796ba0]">
              AI Company Issues. GitHub остаётся единственным источником истины.
            </p>
          </div>
          <Link
            href={snapshot.sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="text-sm font-semibold text-[#7042c5]"
          >
            Открыть GitHub
          </Link>
        </div>

        {snapshot.tasks.length === 0 ? (
          <div className="rounded-[20px] border border-[#e4dff0] bg-white p-5 text-sm text-[#796ba0]">
            AI Company Issues пока нет.
          </div>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {snapshot.tasks.slice(0, 20).map((task) => (
              <TaskCard key={task.number} task={task} />
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="mb-4">
          <h2 className="text-[20px] font-semibold text-[#25135c]">Открытые PR</h2>
          <p className="mt-1 text-sm text-[#796ba0]">
            Последние открытые pull request репозитория — контекст текущей разработки.
          </p>
        </div>

        <div className="rounded-[20px] border border-[#e4dff0] bg-white">
          {snapshot.pullRequests.length === 0 ? (
            <p className="p-4 text-sm text-[#9187a5]">Открытых PR нет.</p>
          ) : (
            <div className="divide-y divide-[#eee9f5]">
              {snapshot.pullRequests.map((pr) => (
                <Link
                  key={pr.number}
                  href={pr.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-between gap-4 p-4 hover:bg-[#fbf9fe]"
                >
                  <span className="min-w-0 truncate text-sm font-medium text-[#514669]">
                    #{pr.number} · {pr.title}
                  </span>
                  <span className="shrink-0 text-xs text-[#9187a5]">
                    {formatMoscow(pr.updatedAt)}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="rounded-[20px] border border-[#e4dff0] bg-[#fbf9fe] p-4 text-xs leading-5 text-[#81749b]">
        Command Center v1 — read-only. GitHub остаётся source of truth; данные
        читаются сервером с коротким cache window. Управляющие действия добавляем
        после первого стабильного автономного цикла.
      </section>
    </div>
  );
}
