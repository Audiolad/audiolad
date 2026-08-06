import { redirect } from "next/navigation";

import AuthorCreateProjectForm from "@/components/author-dashboard/AuthorCreateProjectForm";
import AuthorShell from "@/components/author-dashboard/AuthorShell";
import { listAuthorWorkspacesForUser } from "@/lib/author-products/auth";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function NewAuthorProjectPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/sign-in?next=/author-dashboard/projects/new");
  }

  const authors = await listAuthorWorkspacesForUser(user.id);
  if (authors.length === 0) {
    redirect("/author-dashboard");
  }

  return (
    <AuthorShell
      title="Создать проект"
      subtitle="Новый публичный автор или бренд в вашем кабинете"
      internalBackHref="/author-dashboard"
      internalBackLabel="Назад в кабинет"
    >
      <AuthorCreateProjectForm />
    </AuthorShell>
  );
}
