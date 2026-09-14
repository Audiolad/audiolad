import { redirect } from "next/navigation";

import AuthorSeoOpportunitiesClient from "@/components/author-dashboard/AuthorSeoOpportunitiesClient";
import AuthorShell from "@/components/author-dashboard/AuthorShell";
import { listAuthorProducts } from "@/lib/author-products/products";
import {
  listAuthorWorkspacesForUser,
  requireAuthenticatedUser,
  requireAuthorMembership,
} from "@/lib/author-products/auth";
import { isAuthorSeoDiscoveryEnabled } from "@/lib/seo-queries/discovery-beta";
import { listSeoOpportunitiesForAuthor } from "@/lib/seo-queries/queries";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AuthorSeoOpportunitiesPage({
  searchParams,
}: {
  searchParams: Promise<{ author?: string }>;
}) {
  const params = await searchParams;
  const { user } = await requireAuthenticatedUser();
  const workspaces = await listAuthorWorkspacesForUser(user.id);
  if (workspaces.length === 0) redirect("/become-author");
  const workspace = workspaces.find((item) => item.slug === params.author) ?? workspaces[0];
  const { supabase } = await requireAuthorMembership(workspace.id);
  const discoveryEnabled = isAuthorSeoDiscoveryEnabled(workspace.id);
  const [opportunities, authorProducts] = await Promise.all([
    listSeoOpportunitiesForAuthor(workspace.id),
    listAuthorProducts(supabase, workspace.id),
  ]);

  const title = discoveryEnabled ? "Что ищут слушатели" : "SEO-возможности";
  const subtitle = discoveryEnabled
    ? "Поиск тем в Wordstat и SEO-запросы для новых аудиопродуктов"
    : "Запросы для новых аудиопродуктов";

  return (
    <AuthorShell title={title} subtitle={subtitle} internalBackHref={`/author-dashboard?author=${encodeURIComponent(workspace.slug)}`}>
      <AuthorSeoOpportunitiesClient
        authorId={workspace.id}
        authorSlug={workspace.slug}
        discoveryEnabled={discoveryEnabled}
        opportunities={opportunities}
        products={authorProducts
          .filter((product) => product.status === "draft")
          .map((product) => ({ id: product.id, title: product.title }))}
      />
    </AuthorShell>
  );
}
