import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";

import AuthorListenerFeedback from "@/components/author-dashboard/AuthorListenerFeedback";
import AuthorShell from "@/components/author-dashboard/AuthorShell";
import { AUTHOR_FEEDBACK_SUBTITLE, AUTHOR_FEEDBACK_TITLE } from "@/lib/practice-comments/copy";
import { listAuthorWorkspacesForUser } from "@/lib/author-products/auth";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function AuthorFeedbackPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/sign-in?next=/author-dashboard/feedback");
  }

  const authors = await listAuthorWorkspacesForUser(user.id);
  if (authors.length === 0) {
    return (
      <AuthorShell title={AUTHOR_FEEDBACK_TITLE}>
        <div className="rounded-[24px] border border-[#eadff8] bg-white px-5 py-8 text-center">
          <p className="text-[18px] font-semibold">У вас пока нет доступа к кабинету автора.</p>
          <Link href="/profile" className="mt-6 inline-flex min-h-11 items-center rounded-full bg-[#7042c5] px-5 text-sm font-semibold text-white">
            Вернуться в профиль
          </Link>
        </div>
      </AuthorShell>
    );
  }

  return (
    <AuthorShell
      title={AUTHOR_FEEDBACK_TITLE}
      subtitle={AUTHOR_FEEDBACK_SUBTITLE}
      internalBackHref="/author-dashboard"
    >
      <Suspense fallback={<p className="text-sm text-[#7d70a2]">Загрузка…</p>}>
        <AuthorListenerFeedback
          authors={authors.map((author) => ({
            id: author.id,
            name: author.name,
            slug: author.slug,
          }))}
        />
      </Suspense>
    </AuthorShell>
  );
}
