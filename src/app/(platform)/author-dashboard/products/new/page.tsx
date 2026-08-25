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

  return (
    <AuthorShell
      title={`Создать: ${CABINET_BRANCH_LABELS[cabinetBranch]}`}
      subtitle="Единая форма для одиночного и составного продукта"
      internalBackHref="/author-dashboard/products/new"
    >
      <AuthorProductForm
        authors={authors}
        initialAuthorSlug={params.author}
        initialPublicationClass={publicationClass}
        topicFormData={topicFormData}
        mode="create"
      />
    </AuthorShell>
  );
}
