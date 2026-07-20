import { redirect } from "next/navigation";
import { Suspense } from "react";

import AuthorDiagnosticsEditorClient from "@/components/author-dashboard/personal-materials/AuthorDiagnosticsEditorClient";
import AuthorShell from "@/components/author-dashboard/AuthorShell";
import { listAuthorWorkspacesForUser } from "@/lib/author-products/auth";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ author?: string }>;
};

export default async function AuthorDiagnosticEditorPage({
  params,
  searchParams,
}: PageProps) {
  const { id } = await params;
  const query = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/auth/sign-in?next=/author-dashboard/diagnostics/${id}`);
  }

  const authors = await listAuthorWorkspacesForUser(user.id);

  if (authors.length === 0) {
    redirect("/author-dashboard/diagnostics");
  }

  const initialAuthor =
    authors.find((item) => item.slug === query.author) ?? authors[0];
  const backHref = `/author-dashboard/diagnostics?author=${encodeURIComponent(initialAuthor.slug)}`;

  return (
    <AuthorShell
      title="Диагностика"
      subtitle="Редактирование персональной аудиодиагностики"
      internalBackHref={backHref}
      internalBackLabel="К списку диагностик"
    >
      <Suspense fallback={<p className="text-sm text-[#7d70a2]">Загрузка редактора…</p>}>
        <AuthorDiagnosticsEditorClient materialId={id} authors={authors} />
      </Suspense>
    </AuthorShell>
  );
}
