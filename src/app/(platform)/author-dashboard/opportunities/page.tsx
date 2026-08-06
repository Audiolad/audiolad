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
      <AuthorOpportunitiesClient view={view} />
    </AuthorShell>
  );
}
