import { requireAdminPermission } from "@/lib/admin/guard";
import { loadSpaAdminPrograms } from "@/lib/business-app/spa-admin";

import { removeSpaProgramTrack } from "./actions";

export const dynamic = "force-dynamic";

function fmt(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("ru-RU", { timeZone: "Europe/Moscow" });
}

export default async function AdminBusinessSpaPage() {
  await requireAdminPermission("playlists.manage");
  const programs = await loadSpaAdminPrograms();

  return (
    <div className="space-y-8 p-6">
      <header>
        <h1 className="text-2xl font-semibold">Business · SPA-программы (пилот)</h1>
        <p className="text-sm text-neutral-500">
          Названия треков берутся из каталога АудиоЛада. Минуты — телеметрия плеера (online / offline), не отчёт для
          начислений.
        </p>
      </header>
      {programs.length === 0 ? <p>SPA-программ пока нет.</p> : null}
      {programs.map((p) => (
        <section key={p.id} className="space-y-3" data-testid="spa-admin-program">
          <h2 className="text-xl font-medium">
            {p.name} <span className="text-sm text-neutral-500">({p.status}, {p.organizationName ?? p.organizationId})</span>
          </h2>
          <p className="text-sm" data-testid="spa-admin-totals">
            Онлайн: {p.totalOnlineMinutes} мин · Офлайн: <b>{p.totalOfflineMinutes} мин</b>
          </p>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-neutral-500">
                <th>#</th>
                <th>Трек</th>
                <th>Онлайн, мин</th>
                <th>Офлайн, мин</th>
                <th>Последняя синхронизация</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {p.items.map((i) => (
                <tr key={i.audioItemId} className={i.excludedAt ? "opacity-50" : undefined}>
                  <td>{i.excludedAt ? "—" : i.position}</td>
                  <td>
                    {i.title} <span className="text-neutral-500">{i.trackCode ?? ""}</span>
                  </td>
                  <td>{i.minutes?.onlineMinutes ?? 0}</td>
                  <td>{i.minutes?.offlineMinutes ?? 0}</td>
                  <td>{fmt(i.minutes?.lastReceivedAt ?? null)}</td>
                  <td>
                    {i.excludedAt ? (
                      <span className="text-neutral-500">снят {fmt(i.excludedAt)}</span>
                    ) : (
                      <form action={removeSpaProgramTrack}>
                        <input type="hidden" name="programId" value={p.id} />
                        <input type="hidden" name="audioItemId" value={i.audioItemId} />
                        <button type="submit" className="text-red-600 underline">
                          Снять с Business
                        </button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  );
}
