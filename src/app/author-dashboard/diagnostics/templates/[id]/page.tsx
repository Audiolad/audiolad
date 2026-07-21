import { redirect } from "next/navigation";
import { Suspense } from "react";

import AuthorDiagnosticsTemplateEditorClient from "@/components/author-dashboard/personal-materials/AuthorDiagnosticsTemplateEditorClient";
import AuthorShell from "@/components/author-dashboard/AuthorShell";
import { listAuthorWorkspacesForUser } from "@/lib/author-products/auth";
import { createClient } from "@/lib/supabase/server";
import {
  getPersonalMaterialTemplateById,
  toSafePersonalMaterialTemplateDto,
} from "@/lib/personal-materials/server/templates";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ author?: string }>;
};

export default async function EditPersonalMaterialTemplatePage({
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
    redirect(`/auth/sign-in?next=/author-dashboard/diagnostics/templates/${id}`);
  }

  const authors = await listAuthorWorkspacesForUser(user.id);

  if (authors.length === 0) {
    redirect("/author-dashboard/diagnostics");
  }

  const templateRow = await getPersonalMaterialTemplateById(supabase, id);

  if (!templateRow) {
    redirect("/author-dashboard/diagnostics?tab=templates");
  }

  const author =
    authors.find((item) => item.id === templateRow.author_id) ??
    authors.find((item) => item.slug === query.author) ??
    authors[0];

  if (author.id !== templateRow.author_id) {
    redirect("/author-dashboard/diagnostics?tab=templates");
  }

  const template = toSafePersonalMaterialTemplateDto(templateRow);
  const backHref = `/author-dashboard/diagnostics?author=${encodeURIComponent(author.slug)}&tab=templates`;

  return (
    <AuthorShell
      title="Шаблон"
      subtitle="Редактирование повторяющихся полей"
      internalBackHref={backHref}
      internalBackLabel="К шаблонам"
    >
      <Suspense fallback={<p className="text-sm text-[#7d70a2]">Загрузка…</p>}>
        <AuthorDiagnosticsTemplateEditorClient
          authorId={author.id}
          authorSlug={author.slug}
          initialTemplate={template}
        />
      </Suspense>
    </AuthorShell>
  );
}
