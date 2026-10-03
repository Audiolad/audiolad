import { notFound, redirect } from "next/navigation";

import AuthorAudioSprintClient from "@/components/author-dashboard/AuthorAudioSprintClient";
import AuthorDashboardNav from "@/components/author-dashboard/AuthorDashboardNav";
import AuthorShell from "@/components/author-dashboard/AuthorShell";
import {
  listAuthorWorkspacesForUser,
  requireAuthenticatedUser,
  requireAuthorMembership,
} from "@/lib/author-products/auth";
import { AUDIO_SPRINT_OSEN_ZVUCHIT_TITLE } from "@/lib/seo-queries/audio-sprint";
import { listAudioSprintForAuthor } from "@/lib/seo-queries/list-audio-sprint-queries";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PageProps = {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{ author?: string }>;
};

export default async function AuthorAudioSprintPage({
  params,
  searchParams,
}: PageProps) {
  const { slug } = await params;
  const query = (await searchParams) ?? {};
  const { user } = await requireAuthenticatedUser();
  const workspaces = await listAuthorWorkspacesForUser(user.id);
  if (workspaces.length === 0) redirect("/become-author");

  const requestedSlug = query.author?.trim() ?? "";
  const workspace =
    workspaces.find((item) => item.slug === requestedSlug) ?? workspaces[0];
  const { role } = await requireAuthorMembership(workspace.id);
  const listing = await listAudioSprintForAuthor({
    slug,
    authorId: workspace.id,
    authorWorkspaces: workspaces.map((item) => ({
      id: item.id,
      name: item.name,
      slug: item.slug,
    })),
  });
  if (!listing) notFound();

  const backHref = `/author-dashboard?author=${encodeURIComponent(workspace.slug)}`;

  return (
    <AuthorShell
      title={listing.sprint.title || AUDIO_SPRINT_OSEN_ZVUCHIT_TITLE}
      subtitle="Аудиоспринт"
      internalBackHref={backHref}
    >
      <div className="mb-6">
        <AuthorDashboardNav
          authorSlug={workspace.slug}
          authorId={workspace.id}
          authorRole={role}
        />
      </div>
      <AuthorAudioSprintClient
        authorId={workspace.id}
        authorSlug={workspace.slug}
        queries={listing.queries}
        activeReservationCount={listing.activeReservationCount}
      />
    </AuthorShell>
  );
}
