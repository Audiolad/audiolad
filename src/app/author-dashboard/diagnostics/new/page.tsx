import { redirect } from "next/navigation";
import { Suspense } from "react";

import AuthorDiagnosticsCreateClient from "@/components/author-dashboard/personal-materials/AuthorDiagnosticsCreateClient";
import AuthorShell from "@/components/author-dashboard/AuthorShell";
import { listAuthorWorkspacesForUser } from "@/lib/author-products/auth";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ author?: string }>;
};

export default async function NewAuthorDiagnosticPage({ searchParams }: PageProps) {
  const supabase = await createClient();
  const params = await searchParams;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/sign-in?next=/author-dashboard/diagnostics/new");
  }

  const authors = await listAuthorWorkspacesForUser(user.id);

  if (authors.length === 0) {
    redirect("/author-dashboard/diagnostics");
  }

  const initialAuthor =
    authors.find((item) => item.slug === params.author) ?? authors[0];
  const backHref = `/author-dashboard/diagnostics?author=${encodeURIComponent(initialAuthor.slug)}`;

  return (
    <AuthorShell
      title="Создать диагностику"
      subtitle="Заполните данные клиента и сохраните черновик"
      internalBackHref={backHref}
      internalBackLabel="К списку диагностик"
    >
      <Suspense fallback={<p className="text-sm text-[#7d70a2]">Загрузка формы…</p>}>
        <AuthorDiagnosticsCreateClient authors={authors} />
      </Suspense>
    </AuthorShell>
  );
}
