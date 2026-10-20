import Link from "next/link";
import { redirect } from "next/navigation";

import AuthorAgreementReacceptBanner from "@/components/author-dashboard/AuthorAgreementReacceptBanner";
import AuthorDashboardNav from "@/components/author-dashboard/AuthorDashboardNav";
import AuthorProductStatusBadge from "@/components/author-dashboard/AuthorProductStatusBadge";
import AuthorShell from "@/components/author-dashboard/AuthorShell";
import BusinessAgreementStatusScreen, {
  type BusinessTrackAdmission,
} from "@/components/author-dashboard/business/BusinessAgreementStatusScreen";
import BusinessCommercialRequiredNotice from "@/components/author-dashboard/business/BusinessCommercialRequiredNotice";
import RightsholderVerificationForm, {
  type ExistingVerification,
  type OwnProduct,
  type ProgramDocument,
} from "@/components/author-dashboard/business/RightsholderVerificationForm";
import { authorCanOpenBusiness, BUSINESS_LOCKED_NOTICE_ID } from "@/lib/author-dashboard/business-access";
import {
  listAuthorWorkspacesForUser,
  requireAuthenticatedUser,
  requireAuthorMembership,
} from "@/lib/author-products/auth";
import { isConsentBlockedForRequest } from "@/lib/author-support/consent-context";
import { SUPPORT_MODE_CONSENT_NOTICE } from "@/lib/author-support/consent-guard";
import { hasAcceptedCurrentAuthorTerms, loadAuthorTermsStatus } from "@/lib/author-terms/service";
import { orderProductsForVerification } from "@/lib/business-rightsholder/agreement-links";
import { isUnifiedAgreementEnabled } from "@/lib/author-terms/unified-agreement-flag";
import { createClient } from "@/lib/supabase/server";
import { tracksLiveInBusiness, type BusinessGrantLayerRow } from "@/lib/business-rightsholder/track-in-business";
import {
  EVIDENCE_SIGNED_URL_TTL_SECONDS,
  parseAttemptEvidence,
  parseAttemptProvider,
  type StoredEvidenceFile,
} from "@/lib/business-rightsholder/evidence-display";

const EVIDENCE_BUCKET = "business-rightsholder-evidence";

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
  const { role, accessStatus } = await requireAuthorMembership(workspace.id);
  // No commercial status: same notice as the muted nav tab, and no Business data is loaded.
  if (!authorCanOpenBusiness(accessStatus)) {
    return (
      <AuthorShell
        title="АудиоЛад Бизнес"
        subtitle="Ваша музыка в спа, салонах и кафе – с честными выплатами"
        internalBackHref={`/author-dashboard?author=${encodeURIComponent(workspace.slug)}`}
      >
        <div className="mb-6">
          <AuthorDashboardNav authorSlug={workspace.slug} authorId={workspace.id} authorRole={role} accessStatus={accessStatus} />
        </div>
        <BusinessCommercialRequiredNotice id={BUSINESS_LOCKED_NOTICE_ID} authorSlug={workspace.slug} />
      </AuthorShell>
    );
  }
  // Business consents are the rightsholder's personal act: never in support mode.
  // The DB also refuses (business_onboarding_consents → support_mode_consent_forbidden).
  const supportMode = await isConsentBlockedForRequest(user.id);
  if (supportMode) {
    return (
      <AuthorShell
        title="АудиоЛад Бизнес"
        subtitle="Ваша музыка в спа, салонах и кафе – с честными выплатами"
        internalBackHref={`/author-dashboard?author=${encodeURIComponent(workspace.slug)}`}
      >
        <div className="mb-6">
          <AuthorDashboardNav authorSlug={workspace.slug} authorId={workspace.id} authorRole={role} accessStatus={accessStatus} />
        </div>
        <p
          role="note"
          data-testid="support-mode-business-consent-blocked"
          className="rounded-2xl border border-[#f1d9a6] bg-[#fff8e8] p-4 text-sm leading-6 text-[#6b4a00]"
        >
          {SUPPORT_MODE_CONSENT_NOTICE}
        </p>
      </AuthorShell>
    );
  }
  const supabase = await createClient();

  // Only own published music products with published tracks (the DB re-checks ownership on submit).
  const ownerWorkspaceIds = workspaces.map((w) => w.id);
  const [{ data: practices }, { data: docs }, { data: verification }] = await Promise.all([
    supabase
      .from("practices")
      .select("id, title, author_id, audio_items(id, title, status, position)")
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
      .select("id, status, reason, product_id, audio_item_id, service_track_title, service_track_url, ai_service, ai_service_other, provider_details, declared_rightsholder_name, declared_rightsholder_type, declared_rightsholder_is_self, business_rightsholder_verification_attempts(count)")
      .eq("owner_user_id", user.id)
      .maybeSingle(),
  ]);

  const unifiedMode = isUnifiedAgreementEnabled();
  // The unified agreement is accepted per workspace; one application per account may use a product
  // of any own workspace (pseudonyms). Each product carries its workspace and that workspace's 2.0 status.
  const productWorkspaceIds = [...new Set((practices ?? []).map((p) => p.author_id as string))];
  const agreementByWorkspace = new Map<string, boolean>(
    unifiedMode
      ? await Promise.all(
          productWorkspaceIds.map(
            async (id) => [id, (await hasAcceptedCurrentAuthorTerms(id)).gate.businessAgreement === true] as const,
          ),
        )
      : [],
  );
  const workspaceById = new Map(workspaces.map((w) => [w.id, w]));
  const products: OwnProduct[] = orderProductsForVerification(
    (practices ?? []).map((p) => {
      const ws = workspaceById.get(p.author_id as string);
      return {
        id: p.id as string,
        title: (p.title as string) ?? "Без названия",
        tracks: ((p.audio_items as { id: string; title: string | null; status: string; position: number | null }[]) ?? [])
          .filter((t) => t.status === "published")
          .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
          .map((t) => ({ id: t.id, title: t.title ?? "Трек" })),
        workspace: ws
          ? {
              slug: ws.slug,
              name: ws.name,
              agreementAccepted: unifiedMode ? agreementByWorkspace.get(ws.id) === true : null,
            }
          : null,
      };
    }).filter((p) => p.tracks.length > 0),
    workspace.slug,
  );

  const documents: ProgramDocument[] = (docs ?? []).map((d) => ({
    key: d.document_key as ProgramDocument["key"],
    version: d.version as string,
    url: (d.content_url as string | null) ?? null,
  }));

  const unified = isUnifiedAgreementEnabled();
  let unifiedView: {
    status: Awaited<ReturnType<typeof loadAuthorTermsStatus>>;
    tracks: BusinessTrackAdmission[];
  } | null = null;
  if (unified) {
    const status = await loadAuthorTermsStatus({ authorId: workspace.id, role, supportMode: false });
    // Per-track admission for THIS workspace's own published music (read-only).
    const ownTracks = (practices ?? []).filter((p) => p.author_id === workspace.id).flatMap((p) =>
      ((p.audio_items as { id: string; title: string | null; status: string }[]) ?? [])
        .filter((t) => t.status === "published")
        .map((t) => ({ id: t.id, title: t.title ?? "Трек", productTitle: (p.title as string) ?? "Без названия" })),
    );
    const trackIds = ownTracks.map((t) => t.id);
    // Owner's own session only: reviews via RLS (member read), grant layers via a membership-checked RPC.
    const [{ data: reviews }, { data: grants }] = trackIds.length
      ? await Promise.all([
          supabase
            .from("business_track_eligibility_reviews")
            .select("audio_item_id, decision, reason_code, comment, created_at, id")
            .eq("author_id", workspace.id)
            .in("audio_item_id", trackIds)
            .order("created_at", { ascending: false })
            .order("id", { ascending: false }),
          supabase.rpc("author_business_track_grant_layers", {
            p_author_id: workspace.id,
            p_audio_item_ids: trackIds,
          }),
        ])
      : [{ data: [] }, { data: [] }];
    const latest = new Map<string, { decision: string; reason_code: string | null; comment: string | null }>();
    for (const r of reviews ?? []) {
      const id = String(r.audio_item_id);
      if (!latest.has(id)) latest.set(id, r as { decision: string; reason_code: string | null; comment: string | null });
    }
    // "В Бизнесе" only when BOTH layers (recording + composition) have a live, currently valid grant.
    const granted = tracksLiveInBusiness((grants ?? []) as BusinessGrantLayerRow[]);
    unifiedView = {
      status,
      tracks: ownTracks.map((t) => {
        const review = latest.get(t.id);
        return {
          audioItemId: t.id,
          title: t.title,
          productTitle: t.productTitle,
          decision: (review?.decision as BusinessTrackAdmission["decision"]) ?? null,
          reasonCode: review?.reason_code ?? null,
          comment: review?.comment ?? null,
          inBusiness: granted.has(t.id),
        };
      }),
    };
  }

  const attemptsAgg = verification?.business_rightsholder_verification_attempts as { count: number }[] | undefined;
  // Files of the latest submitted attempt, so a reopened form shows what was sent.
  // Owner RLS on attempts + storage; short-lived signed links with the user's own session
  // (same pattern as /admin/business-verification). Nothing is written here.
  let storedEvidence: StoredEvidenceFile[] = [];
  if (verification) {
    const { data: lastAttempt } = await supabase
      .from("business_rightsholder_verification_attempts")
      .select("snapshot")
      .eq("verification_id", verification.id as string)
      .order("attempt_no", { ascending: false })
      .limit(1)
      .maybeSingle();
    // Only files submitted with the case's current service (the draft can switch services
    // after a failed upload; old files would otherwise appear under the new labels).
    const attemptProvider = parseAttemptProvider(lastAttempt?.snapshot);
    const rows = attemptProvider === (verification.ai_service as string) ? parseAttemptEvidence(lastAttempt?.snapshot) : [];
    if (rows.length) {
      const { data: links } = await supabase.storage
        .from(EVIDENCE_BUCKET)
        .createSignedUrls(rows.map((r) => r.objectPath), EVIDENCE_SIGNED_URL_TTL_SECONDS);
      const signed = new Map<string, string>();
      for (const link of links ?? []) {
        if (link.path && link.signedUrl && !link.error) signed.set(link.path, link.signedUrl);
      }
      storedEvidence = rows.map((r) => ({
        kind: r.kind,
        mimeType: r.mimeType,
        sizeBytes: r.sizeBytes,
        createdAt: r.createdAt,
        url: signed.get(r.objectPath) ?? null,
      }));
    }
  }

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
        declaredRightsholder: verification.declared_rightsholder_name &&
          (verification.declared_rightsholder_type === "person" || verification.declared_rightsholder_type === "organization") &&
          typeof verification.declared_rightsholder_is_self === "boolean"
          ? {
              name: verification.declared_rightsholder_name as string,
              type: verification.declared_rightsholder_type,
              isSelf: verification.declared_rightsholder_is_self,
            }
          : null,
        attempts: attemptsAgg?.[0]?.count ?? 0,
      }
    : null;

  return (
    <AuthorShell
      title="АудиоЛад Бизнес"
      subtitle="Ваша музыка в спа, салонах и кафе – с честными выплатами"
      internalBackHref={`/author-dashboard?author=${encodeURIComponent(workspace.slug)}`}
    >
      <div className="mb-6">
        <AuthorDashboardNav authorSlug={workspace.slug} authorId={workspace.id} authorRole={role} accessStatus={accessStatus} />
      </div>
      {unifiedView ? (
        <>
          <AuthorProductStatusBadge accessStatus={workspace.accessStatus} />
          <AuthorAgreementReacceptBanner status={unifiedView.status} authorSlug={workspace.slug} />
          <BusinessAgreementStatusScreen
            authorSlug={workspace.slug}
            agreement={{
              accepted: unifiedView.status.businessAgreement === true,
              version: unifiedView.status.businessAgreement ? unifiedView.status.currentVersion?.version ?? null : null,
            }}
            verificationStatus={(verification?.status as string | undefined) ?? null}
            tracks={unifiedView.tracks}
          />
        </>
      ) : null}
      {unifiedView && unifiedView.status.businessAgreement !== true ? null : products.length === 0 ? (
        <p className="rounded-2xl border border-neutral-200 bg-white p-4 text-sm text-neutral-700">
          Сначала опубликуйте хотя бы один свой музыкальный продукт – потом здесь можно будет подтвердить права.{" "}
          <Link
            href={`/author-dashboard/music?author=${encodeURIComponent(workspace.slug)}`}
            className="font-semibold text-[#7042c5] underline underline-offset-2"
          >
            Перейти к музыке
          </Link>
        </p>
      ) : (
        <RightsholderVerificationForm
          products={products}
          documents={documents}
          existing={existing}
          mode={unifiedView ? "unified" : "legacy"}
          storedEvidence={storedEvidence}
        />
      )}
    </AuthorShell>
  );
}
