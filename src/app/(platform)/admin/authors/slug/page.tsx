import Link from "next/link";

import ChangeAuthorSlugForm from "@/components/admin/ChangeAuthorSlugForm";
import { requireAdminPermission } from "@/lib/admin/guard";

export const dynamic = "force-dynamic";

export default async function AdminChangeAuthorSlugPage() {
  await requireAdminPermission("authors.manage");

  return (
    <section aria-labelledby="admin-change-author-slug-heading">
      <div className="mb-5">
        <Link
          href="/admin/authors/new"
          className="text-sm font-medium text-[#7042c5]"
        >
          ← К созданию студии
        </Link>
        <h2
          id="admin-change-author-slug-heading"
          className="mt-2 text-[21px] font-semibold"
        >
          Смена URL авторского пространства
        </h2>
      </div>
      <ChangeAuthorSlugForm />
    </section>
  );
}
