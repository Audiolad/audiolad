import Link from "next/link";

import CommercialApplicationsList from "@/components/admin/CommercialApplicationsList";
import {
  ADMIN_APPLICATION_STATUS_OPTIONS,
  resolveAdminApplicationFilterStatus,
} from "@/lib/admin/application-status";
import { listAdminCommercialApplications } from "@/lib/admin/commercial-application-queries";
import { requireAdminPermission } from "@/lib/admin/guard";

export const dynamic = "force-dynamic";

export default async function AdminCommercialApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  await requireAdminPermission("authors.view");
  const params = await searchParams;
  const status = resolveAdminApplicationFilterStatus(params.status);

  let applications;

  try {
    applications = await listAdminCommercialApplications({ status });
  } catch (error) {
    console.error("admin_commercial_applications_page_error", error);

    return (
      <div className="rounded-[22px] border border-[#efc7cf] bg-[#fff8f9] p-5 text-sm text-[#b34f63]">
        Не удалось загрузить заявки. Попробуйте обновить страницу.
      </div>
    );
  }

  const activeFilter = params.status ?? "all";

  return (
    <section aria-labelledby="admin-commercial-applications-heading">
      <h2
        id="admin-commercial-applications-heading"
        className="text-[21px] font-semibold"
      >
        Коммерческие заявки
      </h2>

      <div className="mt-4 flex flex-wrap gap-2">
        <Link
          href="/admin/commercial-applications"
          className={`inline-flex items-center rounded-full px-4 py-2 text-sm font-semibold ${
            activeFilter === "all"
              ? "bg-[#7042c5] text-white"
              : "border border-[#e4d7f4] bg-white text-[#7042c5]"
          }`}
        >
          Все
        </Link>
        {ADMIN_APPLICATION_STATUS_OPTIONS.map((option) => (
          <Link
            key={option.filterKey}
            href={`/admin/commercial-applications?status=${option.filterKey}`}
            className={`inline-flex items-center rounded-full px-4 py-2 text-sm font-semibold ${
              activeFilter === option.filterKey
                ? "bg-[#7042c5] text-white"
                : "border border-[#e4d7f4] bg-white text-[#7042c5]"
            }`}
          >
            {option.label}
          </Link>
        ))}
      </div>

      <div className="mt-5">
        <CommercialApplicationsList applications={applications} />
      </div>
    </section>
  );
}
