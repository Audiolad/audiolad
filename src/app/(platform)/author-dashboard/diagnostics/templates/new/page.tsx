import { redirect } from "next/navigation";
import { Suspense } from "react";

import AuthorDiagnosticsTemplateEditorClient from "@/components/author-dashboard/personal-materials/AuthorDiagnosticsTemplateEditorClient";
import AuthorShell from "@/components/author-dashboard/AuthorShell";
import { listAuthorWorkspacesForUser } from "@/lib/author-products/auth";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ author?: string }>;
};

export default async function NewPersonalMaterialTemplatePage({
  searchParams,
}: PageProps) {
  const supabase = await createClient();
  const params = await searchParams;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/sign-in?next=/author-dashboard/diagnostics/templates/new");
  }

  const authors = await listAuthorWorkspacesForUser(user.id);

  if (authors.length === 0) {
    redirect("/author-dashboard/diagnostics");
  }

  const initialAuthor =
    authors.find((item) => item.slug === params.author) ?? authors[0];
  const backHref = `/author-dashboard/diagnostics?author=${encodeURIComponent(initialAuthor.slug)}&tab=templates`;

  return (
    <AuthorShell
      title="Новый шаблон"
      subtitle="Общие тексты и ссылка на чат для быстрых клиентских материалов"
      internalBackHref={backHref}
      internalBackLabel="К шаблонам"
    >
      <Suspense fallback={<p className="text-sm text-[#7d70a2]">Загрузка…</p>}>
        <AuthorDiagnosticsTemplateEditorClient
          authorId={initialAuthor.id}
          authorSlug={initialAuthor.slug}
        />
      </Suspense>
    </AuthorShell>
  );
}
