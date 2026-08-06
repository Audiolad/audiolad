import Link from "next/link";
import { notFound } from "next/navigation";

import CommercialApplicationReviewForm from "@/components/admin/CommercialApplicationReviewForm";
import { getAdminApplicationStatusLabel } from "@/lib/admin/application-status";
import { getAdminCommercialApplication } from "@/lib/admin/commercial-application-queries";
import { requireAdminPermission } from "@/lib/admin/guard";
import { snapshotHasPermission } from "@/lib/auth/platform-access";

export const dynamic = "force-dynamic";

export default async function AdminCommercialApplicationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireAdminPermission("authors.view");
  const canManage = snapshotHasPermission(session.access, "authors.manage");
  const { id } = await params;

  let application;

  try {
    application = await getAdminCommercialApplication(id);
  } catch (error) {
    console.error("admin_commercial_application_detail_error", error);

    return (
      <div className="rounded-[22px] border border-[#efc7cf] bg-[#fff8f9] p-5 text-sm text-[#b34f63]">
        Не удалось загрузить заявку. Попробуйте обновить страницу.
      </div>
    );
  }

  if (!application) {
    notFound();
  }

  return (
    <section aria-labelledby="admin-commercial-application-detail-heading">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link
            href="/admin/commercial-applications"
            className="text-sm font-medium text-[#7042c5]"
          >
            ← К списку коммерческих заявок
          </Link>
          <h2
            id="admin-commercial-application-detail-heading"
            className="mt-2 text-[21px] font-semibold"
          >
            {application.authorName ?? "Коммерческая заявка"}
          </h2>
          <p className="mt-1 text-sm text-[#796ba0]">
            Статус: {getAdminApplicationStatusLabel(application.status)}
          </p>
        </div>
      </div>

      {canManage ? (
        <CommercialApplicationReviewForm application={application} />
      ) : (
        <div className="rounded-[22px] border border-[#eadff8] bg-white p-5 text-sm text-[#796ba0]">
          Просмотр заявки доступен. Изменение статуса для вашей роли недоступно.
        </div>
      )}
    </section>
  );
}
