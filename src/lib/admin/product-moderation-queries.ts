import type { AdminProductModerationFilterKey } from "@/lib/admin/product-moderation-status";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export type AdminProductModerationListItem = {
  id: string;
  title: string;
  slug: string;
  status: string;
  moderationStatus: string;
  moderationAttempt: number;
  moderationSubmittedAt: string | null;
  productKind: string;
  isFree: boolean;
  price: number;
  audioCount: number;
  totalDurationSeconds: number | null;
  authorId: string;
  authorName: string;
  authorSlug: string;
  isFirstSubmission: boolean;
  isResubmission: boolean;
  updatedAt: string;
};

export type AdminProductModerationEvent = {
  id: string;
  action: string;
  fromStatus: string | null;
  toStatus: string | null;
  fromModerationStatus: string | null;
  toModerationStatus: string | null;
  comment: string | null;
  actorUserId: string | null;
  actorType: string;
  attempt: number | null;
  createdAt: string;
  actorDisplayName: string | null;
};

export type AdminProductModerationAudioItem = {
  id: string;
  title: string;
  position: number;
  durationSeconds: number | null;
  hasAudioFile: boolean;
  status: string;
};

export type AdminProductModerationDetail = {
  id: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  slug: string;
  format: string | null;
  productKind: string;
  status: string;
  moderationStatus: string;
  moderationAttempt: number;
  moderationSubmittedAt: string | null;
  moderationReviewComment: string | null;
  isFree: boolean;
  price: number;
  promoEnabled: boolean;
  promoTitle: string | null;
  promoText: string | null;
  promoButtonText: string | null;
  promoUrl: string | null;
  promoOpenInNewTab: boolean;
  coverUrl: string | null;
  coverImage: unknown;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  authorId: string;
  authorName: string;
  authorSlug: string;
  authorCanBypass: boolean;
  topicTitles: string[];
  audioItems: AdminProductModerationAudioItem[];
  events: AdminProductModerationEvent[];
  submittedByUserId: string | null;
};

export async function countAdminProductModerationSubmitted(): Promise<number> {
  const supabase = createServiceRoleClient();
  const { count, error } = await supabase
    .from("practices")
    .select("id", { count: "exact", head: true })
    .eq("moderation_status", "submitted")
    .is("deleted_at", null);

  if (error) {
    throw new Error(`product_moderation_count_failed:${error.message}`);
  }

  return count ?? 0;
}

export async function listAdminProductModerationQueue(input: {
  filter: AdminProductModerationFilterKey;
}): Promise<AdminProductModerationListItem[]> {
  const supabase = createServiceRoleClient();

  let query = supabase
    .from("practices")
    .select(
      `
      id,
      title,
      slug,
      status,
      moderation_status,
      moderation_attempt,
      moderation_submitted_at,
      product_kind,
      is_free,
      price,
      duration_minutes,
      updated_at,
      author_id,
      authors!practices_author_id_fkey (
        id,
        name,
        slug
      )
    `,
    )
    .is("deleted_at", null);

  switch (input.filter) {
    case "submitted":
      query = query
        .eq("moderation_status", "submitted")
        .order("moderation_submitted_at", { ascending: true, nullsFirst: false });
      break;
    case "changes_requested":
      query = query
        .eq("moderation_status", "changes_requested")
        .order("updated_at", { ascending: false });
      break;
    case "published":
      query = query
        .eq("status", "published")
        .eq("moderation_status", "approved")
        .order("published_at", { ascending: false, nullsFirst: false });
      break;
    case "unpublished":
      query = query
        .eq("status", "unpublished")
        .order("updated_at", { ascending: false });
      break;
  }

  const { data, error } = await query.limit(200);

  if (error) {
    throw new Error(`product_moderation_list_failed:${error.message}`);
  }

  const rows = data ?? [];
  const practiceIds = rows.map((row) => row.id as string);

  const audioStats = new Map<
    string,
    { count: number; totalDurationSeconds: number }
  >();

  if (practiceIds.length > 0) {
    const { data: audioRows, error: audioError } = await supabase
      .from("audio_items")
      .select("practice_id, duration_seconds")
      .in("practice_id", practiceIds);

    if (audioError) {
      throw new Error(`product_moderation_audio_stats_failed:${audioError.message}`);
    }

    for (const audio of audioRows ?? []) {
      const practiceId = audio.practice_id as string;
      const current = audioStats.get(practiceId) ?? {
        count: 0,
        totalDurationSeconds: 0,
      };
      current.count += 1;
      current.totalDurationSeconds +=
        typeof audio.duration_seconds === "number" && audio.duration_seconds > 0
          ? audio.duration_seconds
          : 0;
      audioStats.set(practiceId, current);
    }
  }

  return rows.map((row) => {
    const author = Array.isArray(row.authors) ? row.authors[0] : row.authors;
    const attempt =
      typeof row.moderation_attempt === "number" ? row.moderation_attempt : 0;
    const stats = audioStats.get(row.id as string);

    return {
      id: row.id as string,
      title: (row.title as string) || "Без названия",
      slug: (row.slug as string) || "",
      status: (row.status as string) || "draft",
      moderationStatus: (row.moderation_status as string) || "not_submitted",
      moderationAttempt: attempt,
      moderationSubmittedAt:
        (row.moderation_submitted_at as string | null) ?? null,
      productKind: (row.product_kind as string) || "practice",
      isFree: row.is_free === true,
      price: typeof row.price === "number" ? row.price : 0,
      audioCount: stats?.count ?? 0,
      totalDurationSeconds:
        stats && stats.totalDurationSeconds > 0
          ? stats.totalDurationSeconds
          : null,
      authorId: (author?.id as string) || (row.author_id as string),
      authorName: (author?.name as string) || "Автор",
      authorSlug: (author?.slug as string) || "",
      isFirstSubmission: attempt <= 1,
      isResubmission: attempt > 1,
      updatedAt: (row.updated_at as string) || "",
    };
  });
}

export async function getAdminProductModerationDetail(
  practiceId: string,
): Promise<AdminProductModerationDetail | null> {
  const supabase = createServiceRoleClient();

  const { data: practice, error } = await supabase
    .from("practices")
    .select(
      `
      id,
      title,
      subtitle,
      description,
      slug,
      format,
      product_kind,
      status,
      moderation_status,
      moderation_attempt,
      moderation_submitted_at,
      moderation_review_comment,
      is_free,
      price,
      promo_enabled,
      promo_title,
      promo_text,
      promo_button_text,
      promo_url,
      promo_open_in_new_tab,
      cover_url,
      cover_image,
      created_at,
      updated_at,
      published_at,
      deleted_at,
      author_id,
      authors!practices_author_id_fkey (
        id,
        name,
        slug,
        can_bypass_product_moderation
      )
    `,
    )
    .eq("id", practiceId)
    .maybeSingle();

  if (error) {
    throw new Error(`product_moderation_detail_failed:${error.message}`);
  }

  if (!practice?.id || practice.deleted_at) {
    return null;
  }

  const author = Array.isArray(practice.authors)
    ? practice.authors[0]
    : practice.authors;

  const [{ data: audioItems }, { data: topicRows }, { data: events }] =
    await Promise.all([
      supabase
        .from("audio_items")
        .select("id, title, position, duration_seconds, audio_path, status")
        .eq("practice_id", practiceId)
        .order("position", { ascending: true }),
      supabase
        .from("practice_topics")
        .select("topics!inner(title, is_active)")
        .eq("practice_id", practiceId),
      supabase
        .from("practice_moderation_events")
        .select(
          `
          id,
          action,
          from_status,
          to_status,
          from_moderation_status,
          to_moderation_status,
          comment,
          actor_user_id,
          actor_type,
          attempt,
          created_at
        `,
        )
        .eq("practice_id", practiceId)
        .order("created_at", { ascending: false }),
    ]);

  const actorIds = Array.from(
    new Set(
      (events ?? [])
        .map((event) => event.actor_user_id as string | null)
        .filter((id): id is string => Boolean(id)),
    ),
  );

  const actorNames = new Map<string, string>();

  if (actorIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name, email")
      .in("id", actorIds);

    for (const profile of profiles ?? []) {
      const name =
        (typeof profile.full_name === "string" && profile.full_name.trim()) ||
        (typeof profile.email === "string" && profile.email.trim()) ||
        null;
      if (name) {
        actorNames.set(profile.id as string, name);
      }
    }
  }

  const topicTitles = (topicRows ?? [])
    .map((row) => {
      const topic = Array.isArray(row.topics) ? row.topics[0] : row.topics;
      if (!topic || topic.is_active === false) {
        return null;
      }
      return typeof topic.title === "string" ? topic.title : null;
    })
    .filter((title): title is string => Boolean(title));

  const mappedEvents: AdminProductModerationEvent[] = (events ?? []).map(
    (event) => ({
      id: event.id as string,
      action: event.action as string,
      fromStatus: (event.from_status as string | null) ?? null,
      toStatus: (event.to_status as string | null) ?? null,
      fromModerationStatus:
        (event.from_moderation_status as string | null) ?? null,
      toModerationStatus: (event.to_moderation_status as string | null) ?? null,
      comment: (event.comment as string | null) ?? null,
      actorUserId: (event.actor_user_id as string | null) ?? null,
      actorType: (event.actor_type as string) || "system",
      attempt:
        typeof event.attempt === "number" ? (event.attempt as number) : null,
      createdAt: event.created_at as string,
      actorDisplayName: event.actor_user_id
        ? actorNames.get(event.actor_user_id as string) ?? null
        : null,
    }),
  );

  const submittedEvent = mappedEvents.find(
    (event) =>
      event.action === "submitted" || event.action === "resubmitted",
  );

  return {
    id: practice.id as string,
    title: (practice.title as string) || "Без названия",
    subtitle: (practice.subtitle as string | null) ?? null,
    description: (practice.description as string | null) ?? null,
    slug: (practice.slug as string) || "",
    format: (practice.format as string | null) ?? null,
    productKind: (practice.product_kind as string) || "practice",
    status: (practice.status as string) || "draft",
    moderationStatus: (practice.moderation_status as string) || "not_submitted",
    moderationAttempt:
      typeof practice.moderation_attempt === "number"
        ? practice.moderation_attempt
        : 0,
    moderationSubmittedAt:
      (practice.moderation_submitted_at as string | null) ?? null,
    moderationReviewComment:
      (practice.moderation_review_comment as string | null) ?? null,
    isFree: practice.is_free === true,
    price: typeof practice.price === "number" ? practice.price : 0,
    promoEnabled: practice.promo_enabled === true,
    promoTitle: (practice.promo_title as string | null) ?? null,
    promoText: (practice.promo_text as string | null) ?? null,
    promoButtonText: (practice.promo_button_text as string | null) ?? null,
    promoUrl: (practice.promo_url as string | null) ?? null,
    promoOpenInNewTab: practice.promo_open_in_new_tab === true,
    coverUrl: (practice.cover_url as string | null) ?? null,
    coverImage: practice.cover_image ?? null,
    createdAt: (practice.created_at as string) || "",
    updatedAt: (practice.updated_at as string) || "",
    publishedAt: (practice.published_at as string | null) ?? null,
    authorId: (author?.id as string) || (practice.author_id as string),
    authorName: (author?.name as string) || "Автор",
    authorSlug: (author?.slug as string) || "",
    authorCanBypass: author?.can_bypass_product_moderation === true,
    topicTitles,
    audioItems: (audioItems ?? []).map((item) => ({
      id: item.id as string,
      title: (item.title as string) || "Без названия",
      position: typeof item.position === "number" ? item.position : 0,
      durationSeconds:
        typeof item.duration_seconds === "number" ? item.duration_seconds : null,
      hasAudioFile: Boolean(
        typeof item.audio_path === "string" && item.audio_path.trim(),
      ),
      status: (item.status as string) || "draft",
    })),
    events: mappedEvents,
    submittedByUserId: submittedEvent?.actorUserId ?? null,
  };
}
