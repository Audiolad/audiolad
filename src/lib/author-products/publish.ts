import type { SupabaseClient } from "@supabase/supabase-js";

import { mapTopicRpcError } from "@/lib/topics/errors";

import type { AuthorAccessStatus } from "@/lib/authors/access";
import { authorAccessAllowsPaidProducts } from "@/lib/authors/access";

import type { AudioItemRow, PracticeRow } from "./types";
import { LEGACY_OTHER_FORMAT } from "./format";
import { minutesFromSeconds } from "./utils";

type PublishValidationResult =
  | { ok: true }
  | { ok: false; code: string; message: string };

function sortAudioItemsByPosition(audioItems: AudioItemRow[]): AudioItemRow[] {
  return [...audioItems].sort((left, right) => left.position - right.position);
}

export function validateAudioItemsStructure(
  practice: PracticeRow,
  audioItems: AudioItemRow[],
): PublishValidationResult {
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

export function validatePublishRequirements(
  practice: PracticeRow,
  audioItems: AudioItemRow[],
  accessStatus?: AuthorAccessStatus,
): PublishValidationResult {
  if (!practice.author_id) {
    return {
      ok: false,
      code: "missing_author",
      message: "Выберите авторское пространство.",
    };
  }

  const title = practice.title?.trim();

  if (!title) {
    return {
      ok: false,
      code: "missing_title",
      message: "Укажите название аудиопродукта.",
    };
  }

  const slug = practice.slug?.trim();

  if (!slug) {
    return {
      ok: false,
      code: "missing_slug",
      message: "Укажите адрес аудиопродукта.",
    };
  }

  const description = practice.description?.trim();

  if (!description) {
    return {
      ok: false,
      code: "missing_description",
      message: "Добавьте описание аудиопродукта.",
    };
  }

  const format = practice.format?.trim();

  if (!format || format === LEGACY_OTHER_FORMAT) {
    return {
      ok: false,
      code: format === LEGACY_OTHER_FORMAT ? "missing_custom_format" : "missing_format",
      message:
        format === LEGACY_OTHER_FORMAT
          ? "Укажите название своего формата"
          : "Выберите публичный формат.",
    };
  }

  const coverUrl = practice.cover_url?.trim();

  if (!coverUrl) {
    return {
      ok: false,
      code: "missing_cover",
      message: "Загрузите обложку аудиопродукта.",
    };
  }

  const structureValidation = validateAudioItemsStructure(practice, audioItems);

  if (!structureValidation.ok) {
    return structureValidation;
  }

  if (accessStatus && !authorAccessAllowsPaidProducts(accessStatus)) {
    if (!practice.is_free || practice.price > 0) {
      return {
        ok: false,
        code: "paid_products_not_allowed",
        message: "Продажи станут доступны после коммерческого подключения.",
      };
    }
  }

  if (practice.is_free) {
    if (practice.price !== 0) {
      return {
        ok: false,
        code: "invalid_price",
        message: "Для подарочного продукта цена должна быть 0 ₽.",
      };
    }
  } else if (practice.price <= 0) {
    return {
      ok: false,
      code: "invalid_price",
      message: "Укажите цену платного аудиопродукта.",
    };
  }

  return { ok: true };
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
  const { error } = await supabase.rpc("unpublish_audio_product", {
    p_practice_id: practiceId,
  });

  if (error) {
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
