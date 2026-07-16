import Link from "next/link";
import { notFound } from "next/navigation";

import AuthorApplicationReviewForm from "@/components/admin/AuthorApplicationReviewForm";
import { getAdminApplicationStatusLabel } from "@/lib/admin/application-status";
import { getAdminAuthorApplication } from "@/lib/admin/queries";

export const dynamic = "force-dynamic";

export default async function AdminAuthorApplicationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let application;

  try {
    application = await getAdminAuthorApplication(id);
  } catch (error) {
    console.error("admin_application_detail_error", error);

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
    <section aria-labelledby="admin-application-detail-heading">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link
            href="/admin/author-applications"
            className="text-sm font-medium text-[#7042c5]"
          >
            ← К списку заявок
          </Link>
          <h2
            id="admin-application-detail-heading"
            className="mt-2 text-[21px] font-semibold"
          >
            {application.display_name}
          </h2>
          <p className="mt-1 text-sm text-[#796ba0]">
            Статус: {getAdminApplicationStatusLabel(application.status)}
          </p>
        </div>
      </div>

      <AuthorApplicationReviewForm application={application} />
    </section>
  );
}
