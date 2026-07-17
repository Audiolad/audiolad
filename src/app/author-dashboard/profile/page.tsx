import { Suspense } from "react";
import { redirect } from "next/navigation";

import AuthorProfileClient from "@/components/author-dashboard/AuthorProfileClient";
import AuthorShell from "@/components/author-dashboard/AuthorShell";
import { listAuthorWorkspacesForUser } from "@/lib/author-products/auth";
import { listActiveTopics } from "@/lib/topics/queries";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function AuthorProfilePage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/sign-in?next=/author-dashboard/profile");
  }

  const authors = await listAuthorWorkspacesForUser(user.id);

  if (authors.length === 0) {
    redirect("/author-dashboard");
  }

  const topicOptions = await listActiveTopics(supabase);

  return (
    <AuthorShell title="Страница автора" backHref="/author-dashboard" backLabel="Назад">
      <Suspense fallback={<p className="text-sm text-[#7d70a2]">Загрузка…</p>}>
        <AuthorProfileClient
          authors={authors}
          topicOptions={topicOptions.map((topic) => ({
            key: topic.key,
            title: topic.title,
            isActive: true,
          }))}
        />
      </Suspense>
    </AuthorShell>
  );
}
