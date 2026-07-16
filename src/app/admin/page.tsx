import AdminStatGrid from "@/components/admin/AdminStatGrid";
import { getAdminOverviewStats } from "@/lib/admin/queries";

export const dynamic = "force-dynamic";

export default async function AdminOverviewPage() {
  let stats;

  try {
    stats = await getAdminOverviewStats();
  } catch (error) {
    console.error("admin_overview_load_error", error);

    return (
      <div className="rounded-[22px] border border-[#efc7cf] bg-[#fff8f9] p-5 text-sm text-[#b34f63]">
        Не удалось загрузить показатели. Попробуйте обновить страницу.
      </div>
    );
  }

  return (
    <section aria-labelledby="admin-overview-heading">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="admin-overview-heading" className="text-[21px] font-semibold">
            Обзор
          </h2>
          <p className="mt-1 text-sm text-[#796ba0]">
            Обновлено{" "}
            {new Intl.DateTimeFormat("ru-RU", {
              day: "2-digit",
              month: "long",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            }).format(new Date(stats.generatedAt))}
          </p>
        </div>
      </div>

      <AdminStatGrid cards={stats.cards} />
    </section>
  );
}
