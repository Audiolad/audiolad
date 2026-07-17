import { redirect } from "next/navigation";

import AuthorProductForm from "@/components/author-dashboard/AuthorProductForm";
import AuthorShell from "@/components/author-dashboard/AuthorShell";
import { listAuthorWorkspacesForUser } from "@/lib/author-products/auth";
import { loadAuthorProductTopicFormData } from "@/lib/author-products/topic-form-data";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ author?: string }>;
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
  const topicFormData = await loadAuthorProductTopicFormData(
    supabase,
    initialAuthor.id,
  );

  return (
    <AuthorShell
      title="Создать аудиопродукт"
      subtitle="Единая форма для одиночного и составного продукта"
      backHref="/author-dashboard"
    >
      <AuthorProductForm
        authors={authors}
        initialAuthorSlug={params.author}
        topicFormData={topicFormData}
        mode="create"
      />
    </AuthorShell>
  );
}
