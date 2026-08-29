import { redirect } from "next/navigation";

import AuthorCreateWizard from "@/components/author-dashboard/AuthorCreateWizard";
import AuthorProductForm from "@/components/author-dashboard/AuthorProductForm";
import AuthorShell from "@/components/author-dashboard/AuthorShell";
import { listAuthorWorkspacesForUser } from "@/lib/author-products/auth";
import {
  CABINET_BRANCH_LABELS,
  parsePublicationClass,
  publicationClassToCabinetBranch,
} from "@/lib/author-products/publication-class";
import { loadAuthorProductTopicFormData } from "@/lib/author-products/topic-form-data";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ author?: string; class?: string }>;
};

export default async function NewAuthorProductPage({ searchParams }: PageProps) {
  const supabase = await createClient();
  const params = await searchParams;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/sign-in?next=/author-dashboard/products/new");
  }

  const authors = await listAuthorWorkspacesForUser(user.id);

  if (authors.length === 0) {
    redirect("/author-dashboard");
  }

  const initialAuthor =
    authors.find((item) => item.slug === params.author) ?? authors[0];
  const publicationClass = parsePublicationClass(params.class);

  if (!publicationClass) {
    return (
      <AuthorShell
        title="Создать"
        subtitle="Продукт, музыка или аудиопост"
        internalBackHref="/author-dashboard"
      >
        <AuthorCreateWizard authorSlug={params.author} />
      </AuthorShell>
    );
  }

  const topicFormData = await loadAuthorProductTopicFormData(
    supabase,
    initialAuthor.id,
  );
  const cabinetBranch = publicationClassToCabinetBranch(publicationClass);
  const { data: relatedProducts } = await supabase
    .from("practices")
    .select("id, title")
    .eq("author_id", initialAuthor.id)
    .eq("status", "published")
    .is("deleted_at", null)
    .eq("catalog_visibility", "listed")
    .eq("is_catalog_listed", true)
    .order("title")
    .limit(8);

  return (
    <AuthorShell
      title={`Создать: ${CABINET_BRANCH_LABELS[cabinetBranch]}`}
      subtitle="Единая форма для одиночного и составного продукта"
      internalBackHref="/author-dashboard/products/new"
    >
      <AuthorProductForm
        authors={authors}
        relatedProductOptions={(relatedProducts ?? []).map((item) => ({
          value: item.id,
          label: item.title,
        }))}
        initialAuthorSlug={params.author}
        initialPublicationClass={publicationClass}
        topicFormData={topicFormData}
        mode="create"
      />
    </AuthorShell>
  );
}
