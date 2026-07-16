import Link from "next/link";

import AuthorApplicationsList from "@/components/admin/AuthorApplicationsList";
import {
  ADMIN_APPLICATION_STATUS_OPTIONS,
  resolveAdminApplicationFilterStatus,
} from "@/lib/admin/application-status";
import { listAdminAuthorApplications } from "@/lib/admin/queries";

export const dynamic = "force-dynamic";

export default async function AdminAuthorApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const params = await searchParams;
  const status = resolveAdminApplicationFilterStatus(params.status);

  let applications;

  try {
    applications = await listAdminAuthorApplications({ status });
  } catch (error) {
    console.error("admin_applications_page_error", error);

    return (
      <div className="rounded-[22px] border border-[#efc7cf] bg-[#fff8f9] p-5 text-sm text-[#b34f63]">
        Не удалось загрузить заявки. Попробуйте обновить страницу.
      </div>
    );
  }

  const activeFilter = params.status ?? "all";

  return (
    <section aria-labelledby="admin-applications-heading">
      <h2 id="admin-applications-heading" className="text-[21px] font-semibold">
        Заявки авторов
      </h2>

      <div className="mt-4 flex flex-wrap gap-2">
        <Link
          href="/admin/author-applications"
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
            href={`/admin/author-applications?status=${option.filterKey}`}
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
        <AuthorApplicationsList applications={applications} />
      </div>
    </section>
  );
}
