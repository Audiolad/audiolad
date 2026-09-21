import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";

import AuthorShell from "@/components/author-dashboard/AuthorShell";
import AuthorYour20Client from "@/components/author-dashboard/AuthorYour20Client";
import {
  canAccessAuthorPartnerYour20Ui,
  isAuthorPartnerUiBetaEnabled,
} from "@/lib/author-partner/ui-beta";
import { parseAuthorPartnerProfilePayload } from "@/lib/author-partner/profile-types";
import { listAuthorWorkspacesForUser } from "@/lib/author-products/auth";
import { peekAuthorExecutionContext } from "@/lib/author-support/context";
import { getAppOrigin } from "@/lib/seo/app-origin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function NoAuthorAccess() {
  return (
    <AuthorShell title="Ваши 20%">
      <div className="rounded-[24px] border border-[#eadff8] bg-white px-5 py-8 text-center">
        <p className="text-[18px] font-semibold">
          У вас пока нет доступа к кабинету автора.
        </p>
        <Link
          href="/profile"
          className="mt-6 inline-flex rounded-full bg-[#7042c5] px-5 py-3 text-sm font-semibold text-white"
        >
          Вернуться в профиль
        </Link>
      </div>
    </AuthorShell>
  );
}

type SearchParams = Promise<{ author?: string | string[] }>;

export default async function AuthorYour20Page({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const execution = await peekAuthorExecutionContext();
  if (execution?.isSupportMode) {
    redirect("/author-dashboard");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/sign-in?next=/author-dashboard/your-20");
  }

  const authors = await listAuthorWorkspacesForUser(user.id);
  if (authors.length === 0) {
    return <NoAuthorAccess />;
  }

  const params = await searchParams;
  const slugParam = Array.isArray(params.author)
    ? params.author[0]
    : params.author;
  const selected =
    (slugParam
      ? authors.find((author) => author.slug === slugParam)
      : null) ?? authors[0];

  if (
    !canAccessAuthorPartnerYour20Ui({
      authorId: selected.id,
      authorSlug: selected.slug,
      role: selected.role,
      isSupportMode: false,
    })
  ) {
    // Non-beta workspace, editor, etc. — hide by redirect (not only nav).
    const q = selected.slug
      ? `?author=${encodeURIComponent(selected.slug)}`
      : "";
    redirect(`/author-dashboard${q}`);
  }

  // Defense in depth: beta allowlist alone.
  if (
    !isAuthorPartnerUiBetaEnabled({
      authorId: selected.id,
      authorSlug: selected.slug,
    })
  ) {
    redirect("/author-dashboard");
  }

  const { data, error } = await supabase.rpc("get_author_partner_profile", {
    p_author_id: selected.id,
  });

  const initialProfile = error
    ? { exists: false as const, authorId: selected.id }
    : parseAuthorPartnerProfilePayload(data, selected.id);

  return (
    <AuthorShell
      title="Ваши 20%"
      subtitle="Приглашайте новых авторов в АудиоЛад"
      internalBackHref="/author-dashboard"
    >
      <Suspense fallback={<p className="text-sm text-[#7d70a2]">Загрузка…</p>}>
        <AuthorYour20Client
          authors={authors}
          initialAuthorId={selected.id}
          initialProfile={initialProfile}
          siteOrigin={getAppOrigin()}
        />
      </Suspense>
    </AuthorShell>
  );
}
