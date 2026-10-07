import Link from "next/link";

import AuthorApplicationsList from "@/components/admin/AuthorApplicationsList";
import {
  ADMIN_APPLICATION_STATUS_OPTIONS,
  AUTHOR_APPLICATION_ATTENTION_FILTER_KEY,
  resolveAdminAuthorApplicationFilterStatuses,
} from "@/lib/admin/application-status";
import { requireAdminPermission } from "@/lib/admin/guard";
import { listAdminAuthorApplications } from "@/lib/admin/queries";
import { snapshotHasPermission } from "@/lib/auth/platform-access";

export const dynamic = "force-dynamic";

function AuthorApplicationsHeading({
  canManageAuthors,
}: {
  canManageAuthors: boolean;
}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
      <h2 id="admin-applications-heading" className="text-[21px] font-semibold">
        Заявки авторов
      </h2>
      {canManageAuthors ? (
        <Link
          href="/admin/authors/new"
          className="text-sm font-medium text-[#7042c5]"
        >
          Создать авторское пространство
        </Link>
      ) : null}
    </div>
  );
}

export default async function AdminAuthorApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const session = await requireAdminPermission("authors.view");
  const canManageAuthors = snapshotHasPermission(
    session.access,
    "authors.manage",
  );
  const params = await searchParams;
  const statuses = resolveAdminAuthorApplicationFilterStatuses(params.status);

  let applications;

  try {
    applications = await listAdminAuthorApplications({ statuses });
  } catch (error) {
    console.error("admin_applications_page_error", error);

    return (
      <section aria-labelledby="admin-applications-heading">
        <AuthorApplicationsHeading canManageAuthors={canManageAuthors} />
        <div className="mt-4 rounded-[22px] border border-[#efc7cf] bg-[#fff8f9] p-5 text-sm text-[#b34f63]">
          Не удалось загрузить заявки. Попробуйте обновить страницу.
        </div>
      </section>
    );
  }

  const activeFilter = params.status ?? "all";

  return (
    <section aria-labelledby="admin-applications-heading">
      <AuthorApplicationsHeading canManageAuthors={canManageAuthors} />

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
        <Link
          href={`/admin/author-applications?status=${AUTHOR_APPLICATION_ATTENTION_FILTER_KEY}`}
          className={`inline-flex items-center rounded-full px-4 py-2 text-sm font-semibold ${
            activeFilter === AUTHOR_APPLICATION_ATTENTION_FILTER_KEY
              ? "bg-[#7042c5] text-white"
              : "border border-[#e4d7f4] bg-white text-[#7042c5]"
          }`}
        >
          Требуют внимания
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
