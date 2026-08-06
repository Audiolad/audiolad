import { redirect } from "next/navigation";

import AuthorDashboardNav from "@/components/author-dashboard/AuthorDashboardNav";
import AuthorLegalTermsCard from "@/components/author-dashboard/AuthorLegalTermsCard";
import AuthorShell from "@/components/author-dashboard/AuthorShell";
import { loadAuthorCommercialShareSummary } from "@/lib/author-commercial/share-summary";
import {
  listAuthorWorkspacesForUser,
  requireAuthenticatedUser,
  requireAuthorMembership,
} from "@/lib/author-products/auth";
import {
  authorHasAnyTermsAcceptance,
  loadAuthorTermsStatus,
} from "@/lib/author-terms/service";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PageProps = {
  searchParams?: Promise<{ author?: string }>;
};

export default async function AuthorLegalDocumentsPage({
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

  const { role } = await requireAuthorMembership(workspace.id);
  const [status, hadPrior, commercialShare] = await Promise.all([
    loadAuthorTermsStatus({
      authorId: workspace.id,
      role,
    }),
    authorHasAnyTermsAcceptance(workspace.id),
    loadAuthorCommercialShareSummary(workspace.id),
  ]);
  const backHref = `/author-dashboard?author=${encodeURIComponent(workspace.slug)}`;

  return (
    <AuthorShell
      title="Юридические документы"
      subtitle="Документы коммерческого сотрудничества"
      internalBackHref={backHref}
    >
      <div className="mb-6">
        <AuthorDashboardNav authorSlug={workspace.slug} />
      </div>
      <AuthorLegalTermsCard
        authorId={workspace.id}
        authorSlug={workspace.slug}
        status={status}
        mode={hadPrior ? "updated" : "first"}
        commercialShare={
          status.acceptedCurrent ? null : commercialShare
        }
      />
    </AuthorShell>
  );
}
