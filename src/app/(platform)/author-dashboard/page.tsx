import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";

import AuthorDashboardClient from "@/components/author-dashboard/AuthorDashboardClient";
import AuthorShell from "@/components/author-dashboard/AuthorShell";
import { listAuthorWorkspacesForUser } from "@/lib/author-products/auth";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function StudioMicrophoneIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-5 w-5 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="7" y="2.5" width="10" height="13" rx="5" />
      <path d="M4.5 11.5a7.5 7.5 0 0 0 15 0M12 19v3m-4 0h8" />
      <path d="M9.5 6.5h5m-5 3h5" />
    </svg>
  );
}

function NoAuthorAccess() {
  return (
    <AuthorShell title="Кабинет автора">
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
    <AuthorShell
      title="Кабинет автора"
      actions={
        <Link
          href="/studio"
          className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[#7042c5] px-3 py-2 text-sm font-semibold text-white transition hover:bg-[#5e32ad] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5] sm:px-4"
        >
          <StudioMicrophoneIcon />
          <span>Студия</span>
        </Link>
      }
    >
      <Suspense fallback={<p className="text-sm text-[#7d70a2]">Загрузка кабинета…</p>}>
        <AuthorDashboardClient authors={authors} />
      </Suspense>
    </AuthorShell>
  );
}
