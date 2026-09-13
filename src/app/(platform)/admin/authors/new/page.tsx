import Link from "next/link";

import CreateStudioWorkspaceForm from "@/components/admin/CreateStudioWorkspaceForm";
import { requireAdminPermission } from "@/lib/admin/guard";

export const dynamic = "force-dynamic";

export default async function NewAdminAuthorWorkspacePage() {
  await requireAdminPermission("authors.manage");

  return (
    <section aria-labelledby="new-admin-author-workspace-heading">
      <div className="mb-5">
        <Link
          href="/admin/author-applications"
          className="text-sm font-medium text-[#7042c5]"
        >
          ← К заявкам авторов
        </Link>
        <h2
          id="new-admin-author-workspace-heading"
          className="mt-2 text-[21px] font-semibold"
        >
          Создать пространство студии
        </h2>
      </div>
      <CreateStudioWorkspaceForm />
    </section>
  );
}
