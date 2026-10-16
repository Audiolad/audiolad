import { redirect } from "next/navigation";

import AuthorDashboardNav from "@/components/author-dashboard/AuthorDashboardNav";
import AuthorShell from "@/components/author-dashboard/AuthorShell";
import RightsholderVerificationForm, {
  type ExistingVerification,
  type OwnProduct,
  type ProgramDocument,
} from "@/components/author-dashboard/business/RightsholderVerificationForm";
import {
  listAuthorWorkspacesForUser,
  requireAuthenticatedUser,
  requireAuthorMembership,
} from "@/lib/author-products/auth";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PageProps = { searchParams?: Promise<{ author?: string }> };

export default async function AuthorBusinessPage({ searchParams }: PageProps) {
  const params = (await searchParams) ?? {};
  const { user } = await requireAuthenticatedUser();
  const workspaces = await listAuthorWorkspacesForUser(user.id);
  if (workspaces.length === 0) redirect("/become-author");
  const requestedSlug = params.author?.trim() ?? "";
  const workspace = workspaces.find((item) => item.slug === requestedSlug) ?? workspaces[0];
  const { role } = await requireAuthorMembership(workspace.id);
  const supabase = await createClient();

  // Only own published music products with published tracks (the DB re-checks ownership on submit).
  const ownerWorkspaceIds = workspaces.map((w) => w.id);
  const [{ data: practices }, { data: docs }, { data: verification }] = await Promise.all([
    supabase
      .from("practices")
      .select("id, title, audio_items(id, title, status, position)")
      .in("author_id", ownerWorkspaceIds)
      .eq("status", "published")
      .eq("product_kind", "music")
      .order("title"),
    supabase
      .from("business_program_document_versions")
      .select("document_key, version, content_url")
      .eq("is_current", true),
    supabase
      .from("business_rightsholder_verifications")
      .select("id, status, reason, product_id, audio_item_id, service_track_title, service_track_url, ai_service, ai_service_other, provider_details, business_rightsholder_verification_attempts(count)")
      .eq("owner_user_id", user.id)
      .maybeSingle(),
  ]);

  const products: OwnProduct[] = (practices ?? []).map((p) => ({
    id: p.id as string,
    title: (p.title as string) ?? "Без названия",
    tracks: ((p.audio_items as { id: string; title: string | null; status: string; position: number | null }[]) ?? [])
      .filter((t) => t.status === "published")
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
      .map((t) => ({ id: t.id, title: t.title ?? "Трек" })),
  })).filter((p) => p.tracks.length > 0);

  const documents: ProgramDocument[] = (docs ?? []).map((d) => ({
    key: d.document_key as ProgramDocument["key"],
    version: d.version as string,
    url: (d.content_url as string | null) ?? null,
  }));

  const attemptsAgg = verification?.business_rightsholder_verification_attempts as { count: number }[] | undefined;
  const existing: ExistingVerification = verification
    ? {
        status: verification.status as string,
        reason: (verification.reason as string | null) ?? null,
        productId: verification.product_id as string,
        audioItemId: verification.audio_item_id as string,
        trackTitle: verification.service_track_title as string,
        trackUrl: (verification.service_track_url as string | null) ?? null,
        aiService: verification.ai_service as "suno" | "musicgpt" | "other",
        aiServiceOther: (verification.ai_service_other as string | null) ?? null,
        providerDetails: (verification.provider_details as Record<string, string> | null) ?? {},
        attempts: attemptsAgg?.[0]?.count ?? 0,
      }
    : null;

  return (
    <AuthorShell
      title="АудиоЛад Бизнес"
      subtitle="Ваша музыка в спа, салонах и кафе — с честными выплатами"
      internalBackHref={`/author-dashboard?author=${encodeURIComponent(workspace.slug)}`}
    >
      <div className="mb-6">
        <AuthorDashboardNav authorSlug={workspace.slug} authorId={workspace.id} authorRole={role} />
      </div>
      {products.length === 0 ? (
        <p className="rounded-2xl border border-neutral-200 bg-white p-4 text-sm text-neutral-700">
          Сначала опубликуйте хотя бы один свой музыкальный продукт — потом здесь можно будет подтвердить права.
        </p>
      ) : (
        <RightsholderVerificationForm products={products} documents={documents} existing={existing} />
      )}
    </AuthorShell>
  );
}
