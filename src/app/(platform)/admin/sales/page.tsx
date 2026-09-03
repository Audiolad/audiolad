import AdminAppreciationBlock from "@/components/admin/AdminAppreciationBlock";
import AdminSalesList from "@/components/admin/AdminSalesList";
import { getAdminAppreciationAnalytics } from "@/lib/admin/appreciation-analytics-queries";
import { requireAdminPermission } from "@/lib/admin/guard";
import { listAdminSales } from "@/lib/admin/sales-queries";

export const dynamic = "force-dynamic";

export default async function AdminSalesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  await requireAdminPermission("sales.view");
  const params = await searchParams;
  const page = Number.parseInt(params.page ?? "1", 10);

  let data;
  let appreciation;

  try {
    [data, appreciation] = await Promise.all([
      listAdminSales({
        page: Number.isFinite(page) ? page : 1,
      }),
      getAdminAppreciationAnalytics(),
    ]);
  } catch (error) {
    console.error("admin_sales_page_error", error);

    return (
      <div className="rounded-[22px] border border-[#efc7cf] bg-[#fff8f9] p-5 text-sm text-[#b34f63]">
        Не удалось загрузить продажи. Попробуйте обновить страницу.
      </div>
    );
  }

  return (
    <section aria-labelledby="admin-sales-heading">
      <h2 id="admin-sales-heading" className="text-[21px] font-semibold">
        Продажи
      </h2>
      <p className="mt-1 text-sm text-[#796ba0]">
        Всего: {data.total.toLocaleString("ru-RU")}
      </p>

      <div className="mt-5">
        <AdminAppreciationBlock data={appreciation} />
      </div>

      <div className="mt-5">
        <AdminSalesList data={data} />
      </div>
    </section>
  );
}
