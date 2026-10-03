import AdminSeoAnalyticsClient from "@/components/admin/AdminSeoAnalyticsClient";
import { requireAdminPermission } from "@/lib/admin/guard";
import { loadSeoAnalyticsDashboard } from "@/lib/seo-analytics/load-dashboard";
import type { SeoAnalyticsDashboardData } from "@/lib/seo-analytics/types";

export const dynamic = "force-dynamic";

export default async function AdminSeoAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ snapshot?: string }>;
}) {
  await requireAdminPermission("seo.manage");
  const params = await searchParams;
  let data: SeoAnalyticsDashboardData | null = null;
  try {
    data = await loadSeoAnalyticsDashboard(params.snapshot ?? null);
  } catch (error) {
    console.error("seo_analytics_page_failed", error);
  }

  if (!data) {
    return (
      <div className="rounded-[22px] border border-[#efc7cf] bg-[#fff8f9] p-5 text-sm text-[#b34f63]">
        Не удалось загрузить SEO-аналитику. Попробуйте обновить страницу.
      </div>
    );
  }

  return (
    <section>
      <h2 className="text-[21px] font-semibold">SEO-аналитика</h2>
      <p className="mt-2 max-w-3xl text-sm text-[#796ba0]">
        Еженедельная выгрузка Яндекс.Вебмастера рядом с SEO-картой: частотность,
        кластер, формат, статус и опубликованный продукт. Повторный импорт того же
        периода заменяет только его строки.
      </p>
      <div className="mt-5">
        <AdminSeoAnalyticsClient data={data} />
      </div>
    </section>
  );
}
