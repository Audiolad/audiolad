import Link from "next/link";
import { redirect } from "next/navigation";

import AuthorShell from "@/components/author-dashboard/AuthorShell";
import AuthorStatusClient from "@/components/author-dashboard/AuthorStatusClient";
import { loadAuthorStatusView } from "@/lib/author-dashboard/load-author-status";
import {
  listAuthorWorkspacesForUser,
  requireAuthenticatedUser,
  requireAuthorMembership,
} from "@/lib/author-products/auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PageProps = {
  searchParams?: Promise<{ author?: string }>;
};

export default async function AuthorStatusPage({ searchParams }: PageProps) {
  const params = (await searchParams) ?? {};
  const { user } = await requireAuthenticatedUser();
  const workspaces = await listAuthorWorkspacesForUser(user.id);

  if (workspaces.length === 0) {
    redirect("/become-author");
  }

  const requestedSlug = params.author?.trim() ?? "";
  const workspace =
    workspaces.find((item) => item.slug === requestedSlug) ?? workspaces[0];

  const { role, accessStatus } = await requireAuthorMembership(workspace.id);
  const view = await loadAuthorStatusView({
    authorId: workspace.id,
    authorSlug: workspace.slug,
    accessStatus,
    role,
  });

  const backHref = `/author-dashboard?author=${encodeURIComponent(workspace.slug)}`;

  return (
    <AuthorShell
      title="Статус автора"
      subtitle="Текущий уровень доступа и условия коммерческого подключения"
      internalBackHref={backHref}
    >
      {workspaces.length > 1 ? (
        <div className="mb-4 flex flex-wrap gap-2">
          {workspaces.map((item) => {
            const active = item.id === workspace.id;
            return (
              <Link
                key={item.id}
                href={`/author-dashboard/status?author=${encodeURIComponent(item.slug)}`}
                className={`inline-flex min-h-10 items-center rounded-full px-4 text-sm font-semibold ${
                  active
                    ? "bg-[#7042c5] text-white"
                    : "border border-[#e4d7f4] bg-white text-[#7042c5]"
                }`}
              >
                {item.name}
              </Link>
            );
          })}
        </div>
      ) : null}

      <AuthorStatusClient authorSlug={workspace.slug} view={view} />
    </AuthorShell>
  );
}
