import { Suspense } from "react";
import { redirect } from "next/navigation";

import AuthorCommercialApplicationForm from "@/components/author-dashboard/AuthorCommercialApplicationForm";
import AuthorShell from "@/components/author-dashboard/AuthorShell";
import { listAuthorWorkspacesForUser } from "@/lib/author-products/auth";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function AuthorCommercialApplicationPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/sign-in?next=/author-dashboard/commercial-application");
  }

  const authors = await listAuthorWorkspacesForUser(user.id);

  if (authors.length === 0) {
    redirect("/author-dashboard");
  }

  return (
    <AuthorShell
      title="Коммерческая заявка"
      internalBackHref="/author-dashboard"
    >
      <Suspense fallback={<p className="text-sm text-[#7d70a2]">Загрузка…</p>}>
        <AuthorCommercialApplicationForm authors={authors} />
      </Suspense>
    </AuthorShell>
  );
}
