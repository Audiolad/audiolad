import Link from "next/link";
import { redirect } from "next/navigation";

import AuthorOpportunitiesClient from "@/components/author-dashboard/AuthorOpportunitiesClient";
import AuthorShell from "@/components/author-dashboard/AuthorShell";
import { loadAuthorOpportunitiesView } from "@/lib/author-dashboard/load-author-opportunities";
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

export default async function AuthorOpportunitiesPage({
  searchParams,
}: PageProps) {
  const params = (await searchParams) ?? {};
  const { user } = await requireAuthenticatedUser();
  const workspaces = await listAuthorWorkspacesForUser(user.id);

  if (workspaces.length === 0) {
    redirect("/become-author");
  }

  const requestedSlug = params.author?.trim() ?? "";
  const workspace =
    workspaces.find((item) => item.slug === requestedSlug) ?? workspaces[0];

  const { supabase, accessStatus } = await requireAuthorMembership(workspace.id);
  const view = await loadAuthorOpportunitiesView({
    supabase,
    authorId: workspace.id,
    authorSlug: workspace.slug,
    accessStatus,
  });

  const backHref = `/author-dashboard?author=${encodeURIComponent(workspace.slug)}`;

  return (
    <AuthorShell
      title="Возможности"
      subtitle="Как продвигать продукты и развивать аудиторию"
      internalBackHref={backHref}
    >
      {workspaces.length > 1 ? (
        <div className="mb-4 flex flex-wrap gap-2">
          {workspaces.map((item) => {
            const active = item.id === workspace.id;
            return (
              <Link
                key={item.id}
                href={`/author-dashboard/opportunities?author=${encodeURIComponent(item.slug)}`}
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

      <AuthorOpportunitiesClient view={view} />
    </AuthorShell>
  );
}
