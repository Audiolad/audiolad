import {
  classicaCanAdmin,
  requireClassicaProductionAccess,
} from "@/lib/classica/production/access";
import { formatRubMinor } from "@/lib/classica/production/money";
import { loadClassicaStats } from "@/lib/classica/production/queries";
import type { ClassicaOperatorStats } from "@/lib/classica/production/stats";

export const dynamic = "force-dynamic";

const PERIODS = [
  ["today", "Сегодня"],
  ["week", "Неделя"],
  ["month", "Месяц"],
] as const;

function StatsTable({ stats }: { stats: ClassicaOperatorStats }) {
  const rows = [
    ["Взято", String(stats.taken)],
    ["Сдано", String(stats.submitted)],
    ["Принято", String(stats.accepted)],
    ["Принято с первого раза", String(stats.acceptedFirstTry)],
    ["Возвращено", String(stats.returned)],
    ["Начислено", formatRubMinor(stats.accruedMinor)],
  ];
  return (
    <dl className="grid gap-2 text-sm">
      {rows.map(([label, value]) => (
        <div key={label} className="flex justify-between gap-3">
          <dt className="text-[#796ba0]">{label}</dt>
          <dd className="font-medium">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export default async function ClassicaStatsPage() {
  const session = await requireClassicaProductionAccess();
  const isAdmin = classicaCanAdmin(session.access);
  const stats = await loadClassicaStats(session.supabase, session.userId, isAdmin);

  return (
    <div className="grid gap-6">
      <h2 className="text-xl font-semibold">Моя статистика</h2>
      <div className="grid gap-3 md:grid-cols-3">
        {PERIODS.map(([key, label]) => (
          <section key={key} className="rounded-2xl border border-[#e4d7f4] bg-white p-4">
            <h3 className="font-semibold">{label}</h3>
            <div className="mt-3">
              <StatsTable stats={stats.periods[key]} />
            </div>
          </section>
        ))}
      </div>
      {isAdmin ? (
        <section>
          <h2 className="text-xl font-semibold">Все исполнители</h2>
          <div className="mt-3 grid gap-3">
            {stats.operators.map((operator) => (
              <article key={operator.id} className="rounded-2xl border border-[#e4d7f4] bg-white p-4">
                <h3 className="font-semibold">{operator.label}</h3>
                <div className="mt-3 grid gap-3 md:grid-cols-3">
                  {PERIODS.map(([key, label]) => (
                    <div key={key}>
                      <p className="text-sm text-[#796ba0]">{label}</p>
                      <StatsTable stats={operator.periods[key]} />
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
