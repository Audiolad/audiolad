import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";

import AuthorDashboardClient from "@/components/author-dashboard/AuthorDashboardClient";
import AuthorShell from "@/components/author-dashboard/AuthorShell";
import { listAuthorWorkspacesForUser } from "@/lib/author-products/auth";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function NoAuthorAccess() {
  return (
    <AuthorShell title="Кабинет автора" backHref="/profile" backLabel="В профиль">
      <div className="rounded-[24px] border border-[#eadff8] bg-white px-5 py-8 text-center">
        <p className="text-[18px] font-semibold">
          У вас пока нет доступа к кабинету автора.
        </p>
        <p className="mt-3 text-sm text-[#7d70a2]">
          Доступ открывается после назначения в авторское пространство.
        </p>
        <Link
          href="/profile"
          className="mt-6 inline-flex rounded-full bg-[#7042c5] px-5 py-3 text-sm font-semibold text-white"
        >
          Вернуться в профиль
        </Link>
      </div>
    </AuthorShell>
  );
}

export default async function AuthorDashboardPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/sign-in?next=/author-dashboard");
  }

  const authors = await listAuthorWorkspacesForUser(user.id);

  if (authors.length === 0) {
    return <NoAuthorAccess />;
  }

  return (
    <AuthorShell title="Кабинет автора" backHref="/profile" backLabel="В профиль">
      <Suspense fallback={<p className="text-sm text-[#7d70a2]">Загрузка кабинета…</p>}>
        <AuthorDashboardClient authors={authors} />
      </Suspense>
    </AuthorShell>
  );
}
