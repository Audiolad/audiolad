import { evaluateAuthorSubmitEligibility } from "@/lib/admin/author-submit-eligibility";
import {
  collectLayeredDiagnosticIssues,
  evaluateModerationSubmitHeadline,
  type AdminProductLayeredIssue,
  type ModerationSubmitHeadline,
} from "@/lib/admin/product-diagnostics-shared";
import { isAdminExactUuid } from "@/lib/admin/users-search";
import {
  evaluateDatabaseModerationReady,
  type DatabaseModerationReadyResult,
} from "@/lib/author-products/database-moderation-ready";
import {
  countCoursePublishContent,
} from "@/lib/author-products/course-builder";
import {
  AUTHOR_PUBLICATION_CLASS_LABELS,
  isCoursePublication,
  parsePublicationClass,
} from "@/lib/author-products/publication-class";
import {
  evaluatePublishReadiness,
  type PublishReadinessResult,
} from "@/lib/author-products/publish";
import {
  getMusicUsagePermissionLabel,
  getProductKindLabel,
} from "@/lib/author-products/product-kind";
import {
  coercePracticeRow,
  type AudioItemRow,
  type PracticeRow,
} from "@/lib/author-products/types";
import {
  getAuthorAccessStatusLabel,
  type AuthorAccessStatus,
} from "@/lib/authors/access";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export type AdminProductDiagnosticTrack = {
  id: string;
  title: string;
  position: number;
  durationSeconds: number | null;
  hasAudioFile: boolean;
  status: string;
};

export type AdminProductDiagnosticCourseLesson = {
  id: string;
  title: string;
  position: number;
  blocks: Array<{
    id: string;
    type: string;
    position: number;
    hasAsset: boolean;
  }>;
};

export type AdminProductDiagnosticOwner = {
  userId: string;
  membershipRole: string;
  displayName: string;
  email: string | null;
};

export type { AdminProductLayeredIssue };

export type AdminProductDiagnostics = {
  practice: PracticeRow;
  author: {
    id: string;
    name: string;
    slug: string;
    accessStatus: AuthorAccessStatus;
    accessStatusLabel: string;
    canBypassProductModeration: boolean;
  };
  owners: AdminProductDiagnosticOwner[];
  productKindLabel: string;
  publicationClassLabel: string | null;
  musicUsageLabel: string | null;
  topicTitles: string[];
  tracks: AdminProductDiagnosticTrack[];
  course: {
    lessonCount: number;
    blockCount: number;
    lessons: AdminProductDiagnosticCourseLesson[];
  } | null;
  tsReadiness: PublishReadinessResult;
  dbReadiness: DatabaseModerationReadyResult;
  canSubmitToModeration: boolean;
  submitHeadline: ModerationSubmitHeadline;
  submitEligibility: ReturnType<typeof evaluateAuthorSubmitEligibility>;
  layeredIssues: AdminProductLayeredIssue[];
};

function buildDisplayName(fullName: string | null, email: string | null): string {
  const trimmed = fullName?.trim();
  if (trimmed) {
    return trimmed;
  }

  const localPart = email?.split("@")[0]?.trim();
  return localPart || "Пользователь";
}

export { collectLayeredDiagnosticIssues };

export async function getAdminProductDiagnostics(
  productId: string,
): Promise<AdminProductDiagnostics | null> {
  if (!isAdminExactUuid(productId)) {
    return null;
  }

  const service = createServiceRoleClient();

  const { data: row, error } = await service
    .from("practices")
    .select("*")
    .eq("id", productId)
    .maybeSingle();

  if (error) {
    throw new Error("admin_product_diagnostics_load_failed");
  }

  if (!row?.id || row.deleted_at) {
    return null;
  }

  const practice = coercePracticeRow(row as Parameters<typeof coercePracticeRow>[0]);

  const [
    authorResult,
    audioResult,
    topicResult,
    membersResult,
  ] = await Promise.all([
    service
      .from("authors")
      .select("id, name, slug, access_status, can_bypass_product_moderation")
      .eq("id", practice.author_id)
      .maybeSingle(),
    service
      .from("audio_items")
      .select(
        "id, practice_id, title, description, audio_path, cover_url, duration_seconds, original_file_name, file_size_bytes, position, is_preview, status, created_at, updated_at",
      )
      .eq("practice_id", productId)
      .order("position", { ascending: true }),
    service
      .from("practice_topics")
      .select("topics!inner(title, is_active)")
      .eq("practice_id", productId),
    service
      .from("author_members")
      .select("user_id, role")
      .eq("author_id", practice.author_id),
  ]);

  if (authorResult.error) {
    throw new Error("admin_product_diagnostics_author_failed");
  }

  const author = authorResult.data;
  const accessStatus = (author?.access_status ?? "free") as AuthorAccessStatus;

  const audioItems = (audioResult.data ?? []) as AudioItemRow[];

  const topicTitles = (topicResult.data ?? [])
    .map((item) => {
      const topic = Array.isArray(item.topics) ? item.topics[0] : item.topics;
      if (!topic || topic.is_active === false) {
        return null;
      }
      return typeof topic.title === "string" ? topic.title : null;
    })
    .filter((title): title is string => Boolean(title));

  const memberUserIds = [
    ...new Set((membersResult.data ?? []).map((member) => member.user_id as string)),
  ];

  const owners: AdminProductDiagnosticOwner[] = [];

  if (memberUserIds.length > 0) {
    const { data: profiles } = await service
      .from("profiles")
      .select("id, full_name, email")
      .in("id", memberUserIds);

    const profileById = new Map(
      (profiles ?? []).map((profile) => [profile.id as string, profile]),
    );

    for (const member of membersResult.data ?? []) {
      const profile = profileById.get(member.user_id as string);
      owners.push({
        userId: member.user_id as string,
        membershipRole: (member.role as string) || "—",
        displayName: buildDisplayName(
          (profile?.full_name as string | null) ?? null,
          (profile?.email as string | null) ?? null,
        ),
        email: (profile?.email as string | null) ?? null,
      });
    }
  }

  let courseContent = { lessonCount: 0, blockCount: 0 };
  let courseLessons: AdminProductDiagnosticCourseLesson[] = [];

  if (isCoursePublication(practice.publication_class, practice.product_kind)) {
    courseContent = await countCoursePublishContent(service, productId);

    const { data: lessonRows } = await service
      .from("course_lessons")
      .select("id, title, position")
      .eq("publication_id", productId)
      .order("position", { ascending: true });

    const lessonIds = (lessonRows ?? []).map((lesson) => lesson.id as string);
    const blocksByLesson = new Map<
      string,
      AdminProductDiagnosticCourseLesson["blocks"]
    >();

    if (lessonIds.length > 0) {
      const { data: blockRows } = await service
        .from("course_lesson_blocks")
        .select("id, lesson_id, type, position, asset_id")
        .in("lesson_id", lessonIds)
        .order("position", { ascending: true });

      for (const block of blockRows ?? []) {
        const lessonId = block.lesson_id as string;
        const current = blocksByLesson.get(lessonId) ?? [];
        current.push({
          id: block.id as string,
          type: (block.type as string) || "unknown",
          position: typeof block.position === "number" ? block.position : 0,
          hasAsset: Boolean(block.asset_id),
        });
        blocksByLesson.set(lessonId, current);
      }
    }

    courseLessons = (lessonRows ?? []).map((lesson) => ({
      id: lesson.id as string,
      title: (lesson.title as string) || "Без названия",
      position: typeof lesson.position === "number" ? lesson.position : 0,
      blocks: blocksByLesson.get(lesson.id as string) ?? [],
    }));
  }

  const tsReadiness = evaluatePublishReadiness(practice, audioItems, {
    accessStatus,
    activeTopicCount: topicTitles.length,
    courseContent,
  });
  const dbReadiness = evaluateDatabaseModerationReady({
    practice,
    audioItems,
    accessStatus,
    activeTopicCount: topicTitles.length,
    courseContent,
  });
  const submitEligibility = evaluateAuthorSubmitEligibility({
    status: practice.status,
    moderationStatus: practice.moderation_status,
    deletedAt: practice.deleted_at,
    canBypassProductModeration: author?.can_bypass_product_moderation === true,
    accessStatus,
    isFree: practice.is_free,
    price: practice.price,
  });

  const publicationClass = parsePublicationClass(practice.publication_class);
  const submitHeadline = evaluateModerationSubmitHeadline({
    tsReady: tsReadiness.ok,
    dbReady: dbReadiness.ok,
    eligibility: submitEligibility,
  });

  return {
    practice,
    author: {
      id: (author?.id as string) || practice.author_id,
      name: (author?.name as string) || "Автор",
      slug: (author?.slug as string) || "",
      accessStatus,
      accessStatusLabel: getAuthorAccessStatusLabel(accessStatus),
      canBypassProductModeration: author?.can_bypass_product_moderation === true,
    },
    owners,
    productKindLabel: getProductKindLabel(practice.product_kind),
    publicationClassLabel: publicationClass
      ? AUTHOR_PUBLICATION_CLASS_LABELS[publicationClass]
      : null,
    musicUsageLabel: getMusicUsagePermissionLabel(practice.music_usage_permission),
    topicTitles,
    tracks: audioItems.map((item) => ({
      id: item.id,
      title: item.title || "Без названия",
      position: item.position,
      durationSeconds: item.duration_seconds,
      hasAudioFile: Boolean(item.audio_path?.trim()),
      status: item.status,
    })),
    course: isCoursePublication(practice.publication_class, practice.product_kind)
      ? {
          lessonCount: courseContent.lessonCount,
          blockCount: courseContent.blockCount,
          lessons: courseLessons,
        }
      : null,
    tsReadiness,
    dbReadiness,
    canSubmitToModeration: submitHeadline.canSubmitNow,
    submitHeadline,
    submitEligibility,
    layeredIssues: collectLayeredDiagnosticIssues({
      submitEligibility,
      tsReadiness,
      dbReadiness,
    }),
  };
}
