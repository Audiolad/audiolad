import type { SupabaseClient } from "@supabase/supabase-js";

import { getAuthorCommercialApplication } from "@/lib/author-commercial-applications/queries";
import {
  DEFAULT_COMMERCIAL_ONBOARDING_CAPABILITIES,
  evaluateCommercialOnboardingChecklist,
} from "@/lib/author-dashboard/commercial-onboarding";
import {
  evaluateAuthorOnboardingChecklist,
  type AuthorOnboardingCampaignInput,
  type AuthorOnboardingChecklistState,
  type AuthorOnboardingProductInput,
} from "@/lib/author-dashboard/onboarding-checklist";
import {
  AUDIO_ITEM_DETAIL_SELECT,
  listAuthorProducts,
} from "@/lib/author-products/products";
import {
  evaluatePublishReadiness,
  type PublishReadinessResult,
} from "@/lib/author-products/publish";
import type { AudioItemRow, PracticeRow } from "@/lib/author-products/types";
import type { AuthorAccessStatus } from "@/lib/authors/access";
import { getAuthorProfileDetail } from "@/lib/authors/profile";

type PracticeReadinessRow = Pick<
  PracticeRow,
  | "id"
  | "author_id"
  | "title"
  | "slug"
  | "subtitle"
  | "description"
  | "format"
  | "duration_minutes"
  | "price"
  | "is_free"
  | "cover_url"
  | "use_shared_cover"
  | "audio_url"
  | "status"
  | "currency"
  | "published_at"
  | "listening_notice_enabled"
  | "listening_notice_title"
  | "listening_notice_text"
  | "created_at"
  | "updated_at"
>;

function mapCampaignRow(
  row: Record<string, unknown>,
): AuthorOnboardingCampaignInput {
  const practice = Array.isArray(row.practices)
    ? row.practices[0]
    : row.practices;

  return {
    id: String(row.id),
    status: row.status === "archived" ? "archived" : "active",
    practice_id: String(row.practice_id),
    practice_status: String(practice?.status ?? ""),
  };
}

function emptyReadiness(): PublishReadinessResult {
  return {
    ok: false,
    requirements: [],
    completedCount: 0,
    totalCount: 0,
    firstFailure: {
      code: "missing_product",
      message: "Создайте продукт, чтобы продолжить подготовку.",
    },
  };
}

async function loadTopicCountsByPracticeId(
  supabase: SupabaseClient,
  practiceIds: string[],
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();

  if (practiceIds.length === 0) {
    return counts;
  }

  const { data, error } = await supabase
    .from("practice_topics")
    .select("practice_id, topics!inner(is_active)")
    .in("practice_id", practiceIds);

  if (error) {
    throw new Error("practice_topics_count_failed");
  }

  for (const row of data ?? []) {
    const practiceId = String(row.practice_id);
    const topicsValue = row.topics as
      | { is_active?: boolean }
      | { is_active?: boolean }[]
      | null;
    const topic = Array.isArray(topicsValue) ? topicsValue[0] : topicsValue;

    if (topic?.is_active === true) {
      counts.set(practiceId, (counts.get(practiceId) ?? 0) + 1);
    }
  }

  return counts;
}

async function loadCampaignsForAuthor(
  supabase: SupabaseClient,
  authorId: string,
): Promise<AuthorOnboardingCampaignInput[]> {
  const { data, error } = await supabase
    .from("promotion_campaigns")
    .select(
      `
      id,
      author_id,
      practice_id,
      name,
      campaign_key,
      status,
      created_by,
      created_at,
      updated_at,
      practices (
        title,
        slug,
        status,
        authors!practices_author_id_fkey (
          slug
        )
      )
    `,
    )
    .eq("author_id", authorId)
    .order("updated_at", { ascending: false });

  if (error) {
    throw new Error("promotion_campaigns_list_failed");
  }

  return (data ?? []).map((row) =>
    mapCampaignRow(row as Record<string, unknown>),
  );
}

export async function loadAuthorOnboardingChecklistState(
  supabase: SupabaseClient,
  input: {
    authorId: string;
    authorSlug: string;
    accessStatus: AuthorAccessStatus;
  },
): Promise<AuthorOnboardingChecklistState> {
  const { authorId, authorSlug, accessStatus } = input;

  const [profile, productList, campaigns, commercialApplication] =
    await Promise.all([
      getAuthorProfileDetail(supabase, authorId),
      listAuthorProducts(supabase, authorId),
      loadCampaignsForAuthor(supabase, authorId),
      getAuthorCommercialApplication(supabase, authorId).catch(() => null),
    ]);

  if (!profile) {
    throw new Error("author_not_found");
  }

  const nonArchivedIds = productList
    .filter((product) => product.status !== "archived")
    .map((product) => product.id);

  let practiceRows: PracticeReadinessRow[] = [];
  let audioItems: AudioItemRow[] = [];
  let topicCounts = new Map<string, number>();

  if (nonArchivedIds.length > 0) {
    const [practicesResult, audioResult, topics] = await Promise.all([
      supabase
        .from("practices")
        .select(
          `
          id,
          author_id,
          title,
          slug,
          subtitle,
          description,
          format,
          duration_minutes,
          price,
          is_free,
          cover_url,
          use_shared_cover,
          audio_url,
          status,
          currency,
          published_at,
          listening_notice_enabled,
          listening_notice_title,
          listening_notice_text,
          created_at,
          updated_at
        `,
        )
        .in("id", nonArchivedIds),
      supabase
        .from("audio_items")
        .select(AUDIO_ITEM_DETAIL_SELECT)
        .in("practice_id", nonArchivedIds)
        .order("position", { ascending: true }),
      loadTopicCountsByPracticeId(supabase, nonArchivedIds),
    ]);

    if (practicesResult.error) {
      throw new Error("products_list_failed");
    }

    if (audioResult.error) {
      throw new Error("audio_items_lookup_failed");
    }

    practiceRows = (practicesResult.data ?? []) as PracticeReadinessRow[];
    audioItems = (audioResult.data ?? []) as AudioItemRow[];
    topicCounts = topics;
  }

  const audioByPractice = new Map<string, AudioItemRow[]>();

  for (const item of audioItems) {
    const list = audioByPractice.get(item.practice_id) ?? [];
    list.push(item);
    audioByPractice.set(item.practice_id, list);
  }

  const practiceById = new Map(
    practiceRows.map((practice) => [practice.id, practice]),
  );

  const products: AuthorOnboardingProductInput[] = productList.map(
    (product) => {
      if (product.status === "archived") {
        return {
          id: product.id,
          title: product.title,
          slug: product.slug,
          status: product.status,
          is_free: product.is_free,
          updated_at: product.updated_at,
          readiness: emptyReadiness(),
        };
      }

      const practice = practiceById.get(product.id);

      if (!practice) {
        return {
          id: product.id,
          title: product.title,
          slug: product.slug,
          status: product.status,
          is_free: product.is_free,
          updated_at: product.updated_at,
          readiness: emptyReadiness(),
        };
      }

      const readiness = evaluatePublishReadiness(
        practice as PracticeRow,
        audioByPractice.get(product.id) ?? [],
        {
          accessStatus,
          activeTopicCount: topicCounts.get(product.id) ?? 0,
        },
      );

      return {
        id: product.id,
        title: product.title,
        slug: product.slug,
        status: product.status,
        is_free: product.is_free,
        updated_at: product.updated_at,
        readiness,
      };
    },
  );

  const free = evaluateAuthorOnboardingChecklist({
    authorId,
    authorSlug,
    profile: {
      short_positioning: profile.short_positioning,
      full_bio: profile.full_bio,
      avatar_url: profile.avatar_url,
      avatar_path: profile.avatar_path,
      avatar_image: profile.avatar_image,
    },
    products,
    campaigns,
  });

  const commercialOnboardingOpen =
    accessStatus === "commercial_onboarding" ||
    accessStatus === "commercial_active" ||
    accessStatus === "commercial" ||
    accessStatus === "commercial_suspended" ||
    commercialApplication?.status === "approved";

  const commercial = evaluateCommercialOnboardingChecklist({
    authorSlug,
    accessStatus,
    freeGateReady: free.readyForCommercial,
    products,
    campaigns,
    capabilities: {
      ...DEFAULT_COMMERCIAL_ONBOARDING_CAPABILITIES,
      applicationSubmissionAvailable: true,
      // Stub routes ship with this change: cards become active after approve.
      payoutDetailsAvailable: commercialOnboardingOpen,
      termsAcceptanceAvailable: commercialOnboardingOpen,
    },
    applicationStatus: commercialApplication?.status ?? null,
    applicationReviewComment: commercialApplication?.review_comment ?? null,
    applicationHref: `/author-dashboard/commercial-application?author=${encodeURIComponent(authorSlug)}`,
    payoutDetailsHref: `/author-dashboard/commercial/payout-details?author=${encodeURIComponent(authorSlug)}`,
    termsHref: `/author-dashboard/commercial/terms?author=${encodeURIComponent(authorSlug)}`,
    // Existing commercial_active authors keep paid access without fake completion.
    payoutDetailsComplete: accessStatus === "commercial_active" || accessStatus === "commercial",
    termsAccepted: accessStatus === "commercial_active" || accessStatus === "commercial",
    legacyPendingWithoutApplication:
      accessStatus === "commercial_pending" && !commercialApplication,
  });

  return {
    ...free,
    commercial,
    journeyComplete: free.complete && commercial.complete,
  };
}
