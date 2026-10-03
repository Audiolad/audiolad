import Link from "next/link";

import {
  classicaCanOperate,
  requireClassicaProductionAccess,
} from "@/lib/classica/production/access";
import { formatRubMinor } from "@/lib/classica/production/money";
import { listClassicaAssignees, listClassicaJobs } from "@/lib/classica/production/queries";
import {
  CLASSICA_STATUSES,
  classicaStatusLabel,
  type ClassicaStatus,
} from "@/lib/classica/production/status";
import { takeClassicaJobAction } from "@/lib/classica/production/actions";

export const dynamic = "force-dynamic";

const COMPLEXITY: Record<string, string> = {
  low: "Низкая",
  medium: "Средняя",
  high: "Высокая",
};

type PageProps = {
  searchParams: Promise<{ status?: string; assignee?: string; composer?: string; error?: string }>;
};

export default async function ClassicaProductionQueuePage({ searchParams }: PageProps) {
  const session = await requireClassicaProductionAccess();
  const params = await searchParams;
  const [jobs, assignees] = await Promise.all([
    listClassicaJobs(session.supabase, {
      status: params.status,
      assigneeId: params.assignee,
      composer: params.composer,
    }),
    listClassicaAssignees(session.supabase),
  ]);
  const canTake = classicaCanOperate(session.access);

  return (
    <div className="grid gap-4">
      {params.error ? (
        <p className="rounded-xl bg-[#fff4f6] px-3 py-2 text-sm text-[#9b2c4a]">{params.error}</p>
      ) : null}
      <form className="grid gap-3 rounded-2xl border border-[#e4d7f4] bg-white p-4 md:grid-cols-4">
        <label className="text-sm">
          Статус
          <select
            name="status"
            defaultValue={params.status ?? ""}
            className="mt-1 w-full rounded-xl border border-[#e4d7f4] px-3 py-2"
          >
            <option value="">Все</option>
            {CLASSICA_STATUSES.map((status) => (
              <option key={status} value={status}>
                {classicaStatusLabel(status)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Исполнитель
          <select
            name="assignee"
            defaultValue={params.assignee ?? ""}
            className="mt-1 w-full rounded-xl border border-[#e4d7f4] px-3 py-2"
          >
            <option value="">Все</option>
            {assignees.map((assignee) => (
              <option key={assignee.id} value={assignee.id}>
                {assignee.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm md:col-span-2">
          Композитор
          <input
            name="composer"
            defaultValue={params.composer ?? ""}
            className="mt-1 w-full rounded-xl border border-[#e4d7f4] px-3 py-2"
          />
        </label>
        <button type="submit" className="w-fit rounded-xl bg-[#7042c5] px-4 py-2 text-sm font-semibold text-white">
          Показать
        </button>
      </form>

      {jobs.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-[#e4d7f4] bg-white p-6 text-sm text-[#796ba0]">
          В очереди пока нет работ по этому фильтру.
        </p>
      ) : (
        <ul className="grid gap-3">
          {jobs.map((job) => (
            <li key={job.id} className="rounded-2xl border border-[#e4d7f4] bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm text-[#796ba0]">{job.composerName}</p>
                  <h2 className="text-lg font-semibold">
                    <Link href={`/classica/production/${job.id}`}>{job.title}</Link>
                  </h2>
                  <p className="mt-1 text-sm text-[#796ba0]">
                    {[job.catalogueNumber, job.primaryQuery].filter(Boolean).join(" · ") || "Без каталожного номера"}
                  </p>
                </div>
                <span className="rounded-full bg-[#f3eefe] px-3 py-1 text-sm font-medium">
                  {classicaStatusLabel(job.status as ClassicaStatus)}
                </span>
              </div>
              <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <dt className="text-[#796ba0]">Приоритет</dt>
                  <dd>{job.priority}</dd>
                </div>
                <div>
                  <dt className="text-[#796ba0]">Сложность</dt>
                  <dd>{COMPLEXITY[job.complexity] ?? job.complexity}</dd>
                </div>
                <div>
                  <dt className="text-[#796ba0]">Исполнитель</dt>
                  <dd>{job.assigneeLabel ?? "Не назначен"}</dd>
                </div>
                <div>
                  <dt className="text-[#796ba0]">Стоимость</dt>
                  <dd>{formatRubMinor(job.taskCostMinor)}</dd>
                </div>
                <div>
                  <dt className="text-[#796ba0]">Взято</dt>
                  <dd>{job.reservedAt ? new Date(job.reservedAt).toLocaleString("ru-RU") : "—"}</dd>
                </div>
                <div>
                  <dt className="text-[#796ba0]">Срок</dt>
                  <dd>{job.dueOn ?? "—"}</dd>
                </div>
              </dl>
              <div className="mt-3 flex flex-wrap gap-3">
                <Link className="text-sm font-medium text-[#7042c5]" href={`/classica/production/${job.id}`}>
                  Открыть
                </Link>
                {canTake && job.status === "queued" ? (
                  <form action={takeClassicaJobAction}>
                    <input type="hidden" name="job_id" value={job.id} />
                    <button type="submit" className="text-sm font-semibold text-[#7042c5]">
                      Взять в работу
                    </button>
                  </form>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
