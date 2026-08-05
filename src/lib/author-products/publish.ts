import type { SupabaseClient } from "@supabase/supabase-js";

import { mapPublishRpcError } from "@/lib/author-products/moderation";
import { mapTopicRpcError } from "@/lib/topics/errors";

import type { AuthorAccessStatus } from "@/lib/authors/access";
import { authorAccessAllowsPaidProducts } from "@/lib/authors/access";

import type { AudioItemRow, PracticeRow } from "./types";
import { LEGACY_OTHER_FORMAT } from "./format";
import {
  assertMusicUsagePermissionForKind,
  AUDIO_POST_KIND_LABEL,
  isAudioPostProductKind,
  isMusicProductKind,
  MUSIC_KIND_LABEL,
  normalizeProductKind,
  PRODUCT_KIND,
} from "./product-kind";
import { minutesFromSeconds } from "./utils";
import { assertPublishedTopicMinimum } from "@/lib/topics/limits";
import { validatePromoRecommendation } from "@/lib/products/promo-recommendation";

export type PublishValidationResult =
  | { ok: true }
  | { ok: false; code: string; message: string };

export type PublishReadinessRequirementKey =
  | "author"
  | "title"
  | "slug"
  | "description"
  | "format"
  | "cover"
  | "audio"
  | "price"
  | "topics"
  | "music_usage"
  | "promo";

export type PublishReadinessRequirement = {
  key: PublishReadinessRequirementKey;
  label: string;
  ok: boolean;
  code: string | null;
  message: string | null;
};

export type PublishReadinessResult = {
  ok: boolean;
  requirements: PublishReadinessRequirement[];
  completedCount: number;
  totalCount: number;
  firstFailure: { code: string; message: string } | null;
};

export type EvaluatePublishReadinessOptions = {
  accessStatus?: AuthorAccessStatus;
  /** Active practice topics; required for the shared publish + onboarding gate. */
  activeTopicCount: number;
};

function sortAudioItemsByPosition(audioItems: AudioItemRow[]): AudioItemRow[] {
  return [...audioItems].sort((left, right) => left.position - right.position);
}

function requirement(
  key: PublishReadinessRequirementKey,
  label: string,
  failure: { code: string; message: string } | null,
): PublishReadinessRequirement {
  if (!failure) {
    return { key, label, ok: true, code: null, message: null };
  }

  return {
    key,
    label,
    ok: false,
    code: failure.code,
    message: failure.message,
  };
}

function summarizePublishReadiness(
  requirements: PublishReadinessRequirement[],
): PublishReadinessResult {
  const completedCount = requirements.filter((item) => item.ok).length;
  const firstFailed = requirements.find((item) => !item.ok);

  return {
    ok: !firstFailed,
    requirements,
    completedCount,
    totalCount: requirements.length,
    firstFailure:
      firstFailed && firstFailed.code && firstFailed.message
        ? { code: firstFailed.code, message: firstFailed.message }
        : null,
  };
}

export function validateAudioItemsStructure(
  practice: PracticeRow,
  audioItems: AudioItemRow[],
): PublishValidationResult {
  if (isAudioPostProductKind(practice.product_kind) && audioItems.length !== 1) {
    return {
      ok: false,
      code: "audio_post_requires_single_audio",
      message: "Для аудиопоста требуется ровно одна аудиозапись.",
    };
  }

  if (audioItems.length === 0) {
    return {
      ok: false,
      code: "missing_audio",
      message: "Добавьте хотя бы одно аудио.",
    };
  }

  const sorted = sortAudioItemsByPosition(audioItems);
  const positions = sorted.map((item) => item.position);

  if (new Set(positions).size !== positions.length) {
    return {
      ok: false,
      code: "invalid_audio_positions",
      message: "Порядок аудио настроен некорректно. Проверьте позиции треков.",
    };
  }

  for (const [index, item] of sorted.entries()) {
    const expectedPosition = index + 1;

    if (item.position !== expectedPosition) {
      return {
        ok: false,
        code: "invalid_audio_positions",
        message: "Порядок аудио настроен некорректно. Проверьте позиции треков.",
      };
    }

    if (item.practice_id !== practice.id) {
      return {
        ok: false,
        code: "audio_item_mismatch",
        message: "Не удалось подтвердить принадлежность аудио к этому продукту.",
      };
    }

    const audioNumber = index + 1;

    if (!item.title?.trim()) {
      return {
        ok: false,
        code: "missing_audio_title",
        message: `Укажите название для аудио ${audioNumber}.`,
      };
    }

    if (!item.audio_path?.trim()) {
      return {
        ok: false,
        code: "missing_audio_file",
        message: `Загрузите MP3-файл для аудио ${audioNumber}.`,
      };
    }

    if (!item.duration_seconds || item.duration_seconds <= 0) {
      return {
        ok: false,
        code: "missing_audio_duration",
        message: `Не удалось определить длительность аудио ${audioNumber}.`,
      };
    }
  }

  return { ok: true };
}

/**
 * Effective format for publish.
 * Music always stores/shows the system label «Музыка» (no author format picker).
 */
export function resolveFormatForPublish(
  practice: Pick<PracticeRow, "format" | "product_kind">,
  audioItems: ReadonlyArray<Pick<AudioItemRow, "id">> = [],
): string | null {
  void audioItems;

  if (isMusicProductKind(practice.product_kind)) {
    return MUSIC_KIND_LABEL;
  }

  if (isAudioPostProductKind(practice.product_kind)) {
    return AUDIO_POST_KIND_LABEL;
  }

  const format = practice.format?.trim() || null;

  if (format && format !== LEGACY_OTHER_FORMAT) {
    return format;
  }

  return format === LEGACY_OTHER_FORMAT ? LEGACY_OTHER_FORMAT : null;
}

function buildCorePublishRequirements(
  practice: PracticeRow,
  audioItems: AudioItemRow[],
  accessStatus?: AuthorAccessStatus,
): PublishReadinessRequirement[] {
  const productKind = normalizeProductKind(practice.product_kind);
  const isMusic = productKind === PRODUCT_KIND.MUSIC;
  const isAudioPost = productKind === PRODUCT_KIND.AUDIO_POST;

  const authorFailure = !practice.author_id
    ? {
        code: "missing_author",
        message: "Выберите авторское пространство.",
      }
    : null;

  const titleFailure = !practice.title?.trim()
    ? {
        code: "missing_title",
        message: "Укажите название аудиопродукта.",
      }
    : null;

  const slugFailure = !practice.slug?.trim()
    ? {
        code: "missing_slug",
        message: "Укажите адрес аудиопродукта.",
      }
    : null;

  const descriptionFailure = !practice.description?.trim()
    ? {
        code: "missing_description",
        message: "Добавьте описание аудиопродукта.",
      }
    : null;

  const format = resolveFormatForPublish(practice, audioItems);
  const formatFailure =
    !format || format === LEGACY_OTHER_FORMAT
      ? {
          code:
            format === LEGACY_OTHER_FORMAT
              ? "missing_custom_format"
              : "missing_format",
          message:
            format === LEGACY_OTHER_FORMAT
              ? "Укажите название своего формата"
              : "Выберите публичный формат.",
        }
      : null;

  const coverFailure = !practice.cover_url?.trim()
    ? {
        code: "missing_cover",
        message: "Загрузите обложку аудиопродукта.",
      }
    : null;

  const structureValidation = validateAudioItemsStructure(practice, audioItems);
  const audioFailure = structureValidation.ok
    ? null
    : {
        code: structureValidation.code,
        message: structureValidation.message,
      };

  let priceFailure: { code: string; message: string } | null = null;

  if (isAudioPost && (!practice.is_free || practice.price !== 0)) {
    priceFailure = {
      code: "audio_post_must_be_free",
      message: "Аудиопост может быть только бесплатным.",
    };
  } else if (accessStatus && !authorAccessAllowsPaidProducts(accessStatus)) {
    if (!practice.is_free || practice.price > 0) {
      priceFailure = {
        code: "paid_products_not_allowed",
        message: "Продажи станут доступны после коммерческого подключения.",
      };
    }
  }

  if (!priceFailure) {
    if (practice.is_free) {
      if (practice.price !== 0) {
        priceFailure = {
          code: "invalid_price",
          message: "Для подарочного продукта цена должна быть 0 ₽.",
        };
      }
    } else if (practice.price <= 0) {
      priceFailure = {
        code: "invalid_price",
        message: "Укажите цену платного аудиопродукта.",
      };
    }
  }

  const musicUsageCheck = assertMusicUsagePermissionForKind(
    practice.product_kind,
    practice.music_usage_permission,
  );
  const musicUsageFailure =
    isMusic && !musicUsageCheck.ok
      ? { code: musicUsageCheck.code, message: musicUsageCheck.message }
      : !isMusic && !musicUsageCheck.ok
        ? { code: musicUsageCheck.code, message: musicUsageCheck.message }
        : null;
  const promoCheck = validatePromoRecommendation(practice);
  const promoFailure =
    isAudioPost && !promoCheck.ok
      ? { code: promoCheck.code, message: promoCheck.message }
      : null;

  const requirements: PublishReadinessRequirement[] = [
    requirement("author", "Авторское пространство", authorFailure),
    requirement("title", "Название", titleFailure),
    requirement("slug", "Адрес", slugFailure),
    requirement("description", "Описание", descriptionFailure),
    requirement("format", "Формат", formatFailure),
    requirement("cover", "Обложка", coverFailure),
    requirement("audio", "Аудиозапись", audioFailure),
    requirement("price", "Цена и доступ", priceFailure),
  ];

  if (isMusic || musicUsageFailure) {
    requirements.push(
      requirement("music_usage", "Условия использования музыки", musicUsageFailure),
    );
  }

  if (isAudioPost) {
    requirements.push(requirement("promo", "Рекомендация", promoFailure));
  }

  return requirements;
}

/**
 * Shared structured publish-readiness for publication API and author onboarding.
 * Includes core field/audio/price rules plus the minimum-topics gate.
 */
export function evaluatePublishReadiness(
  practice: PracticeRow,
  audioItems: AudioItemRow[],
  options: EvaluatePublishReadinessOptions,
): PublishReadinessResult {
  const topicCheck = assertPublishedTopicMinimum(options.activeTopicCount);
  const topicFailure = topicCheck.ok
    ? null
    : { code: topicCheck.code, message: topicCheck.message };

  return summarizePublishReadiness([
    ...buildCorePublishRequirements(
      practice,
      audioItems,
      options.accessStatus,
    ),
    requirement("topics", "Темы", topicFailure),
  ]);
}

export function validatePublishRequirements(
  practice: PracticeRow,
  audioItems: AudioItemRow[],
  accessStatus?: AuthorAccessStatus,
  activeTopicCount?: number,
): PublishValidationResult {
  if (typeof activeTopicCount === "number") {
    const readiness = evaluatePublishReadiness(practice, audioItems, {
      accessStatus,
      activeTopicCount,
    });

    if (readiness.ok || !readiness.firstFailure) {
      return { ok: true };
    }

    return {
      ok: false,
      code: readiness.firstFailure.code,
      message: readiness.firstFailure.message,
    };
  }

  // Legacy field/audio/price-only path (topics enforced separately / via RPC).
  const readiness = summarizePublishReadiness(
    buildCorePublishRequirements(practice, audioItems, accessStatus),
  );

  if (readiness.ok || !readiness.firstFailure) {
    return { ok: true };
  }

  return {
    ok: false,
    code: readiness.firstFailure.code,
    message: readiness.firstFailure.message,
  };
}

export async function publishPracticeProduct(
  supabase: SupabaseClient,
  practiceId: string,
  publishedAt: string,
): Promise<void> {
  const { error } = await supabase.rpc("publish_audio_product", {
    p_practice_id: practiceId,
    p_published_at: publishedAt,
  });

  if (error) {
    const publishMapped = mapPublishRpcError(error.message);
    if (publishMapped) {
      throw publishMapped;
    }

    const mapped = mapTopicRpcError(error.message);

    if (mapped.code !== "topic_sync_failed") {
      throw mapped;
    }

    throw new Error("practice_publish_failed");
  }
}

export async function unpublishPracticeProduct(
  supabase: SupabaseClient,
  practiceId: string,
): Promise<void> {
  const { error } = await supabase.rpc("unpublish_approved_practice", {
    p_practice_id: practiceId,
  });

  if (error) {
    const mapped = mapPublishRpcError(error.message);
    if (mapped) {
      throw mapped;
    }
    throw new Error("practice_unpublish_failed");
  }
}

export async function archivePracticeProduct(
  supabase: SupabaseClient,
  practiceId: string,
): Promise<void> {
  const { error } = await supabase.rpc("archive_audio_product", {
    p_practice_id: practiceId,
  });

  if (error) {
    throw new Error("practice_archive_failed");
  }
}

export async function publishAllAudioItems(
  supabase: SupabaseClient,
  practiceId: string,
  timestamp?: string,
): Promise<void> {
  const now = timestamp ?? new Date().toISOString();

  const { error } = await supabase
    .from("audio_items")
    .update({
      status: "published",
      updated_at: now,
    })
    .eq("practice_id", practiceId);

  if (error) {
    throw new Error("audio_items_publish_failed");
  }
}

export async function syncPracticeAudioCompatibility(
  supabase: SupabaseClient,
  practiceId: string,
) {
  const { data: practice, error: practiceError } = await supabase
    .from("practices")
    .select("id, status")
    .eq("id", practiceId)
    .maybeSingle();

  if (practiceError || !practice?.id) {
    throw new Error("practice_not_found");
  }

  const { data: audioItems, error: audioError } = await supabase
    .from("audio_items")
    .select("id, audio_path, duration_seconds, position")
    .eq("practice_id", practiceId)
    .order("position", { ascending: true });

  if (audioError) {
    throw new Error("audio_items_lookup_failed");
  }

  const sortedItems = [...(audioItems ?? [])].sort(
    (left, right) => left.position - right.position,
  );

  const itemsWithMp3 = sortedItems.filter((item) => item.audio_path?.trim());

  const firstAudioPath = itemsWithMp3[0]?.audio_path?.trim() ?? null;
  const totalDurationSeconds = itemsWithMp3.reduce(
    (sum, item) => sum + (item.duration_seconds ?? 0),
    0,
  );
  const durationMinutes =
    totalDurationSeconds > 0
      ? minutesFromSeconds(totalDurationSeconds)
      : null;

  const { error: updateError } = await supabase
    .from("practices")
    .update({
      audio_url: firstAudioPath,
      duration_minutes: durationMinutes,
      updated_at: new Date().toISOString(),
    })
    .eq("id", practiceId);

  if (updateError) {
    throw new Error("practice_sync_failed");
  }
}

/** @deprecated Use syncPracticeAudioCompatibility */
export const syncSingleAudioCompatibility = syncPracticeAudioCompatibility;
