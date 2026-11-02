import AdminBusinessTrials from "@/components/admin/AdminBusinessTrials";
import { requireAdminPanelAccess } from "@/lib/admin/guard";
import { canSeeBusinessTrialStats } from "@/lib/admin/nav";
import { loadBusinessTrialStats } from "@/lib/admin/business-trials-queries";
import { forbidden } from "next/navigation";

export const dynamic = "force-dynamic";

/** «АудиоЛад Бизнес» → «Подарочная неделя». Owner only, read-only. */
export default async function AdminBusinessTrialsPage() {
  const session = await requireAdminPanelAccess();
  if (!canSeeBusinessTrialStats(session.access)) forbidden();

  let data;
  try {
    data = await loadBusinessTrialStats();
  } catch (error) {
    console.error("admin_business_trials_page_error", error instanceof Error ? error.message : "unknown");
    return (
      <div className="rounded-[22px] border border-[#efc7cf] bg-[#fff8f9] p-5 text-sm text-[#b34f63]">
        Не удалось загрузить статистику подарочной недели. Попробуйте обновить страницу.
      </div>
    );
  }

  return (
    <section aria-labelledby="admin-business-trials-heading">
      <h2 id="admin-business-trials-heading" className="text-[21px] font-semibold">
        Подарочная неделя
      </h2>
      <p className="mt-1 text-sm text-[#796ba0]">
        Кто начал 7 дней в подарок в АудиоЛад Бизнес, сколько осталось и включали ли музыку. Только чтение.
      </p>
      <div className="mt-5">
        <AdminBusinessTrials data={data} />
      </div>
    </section>
  );
}
