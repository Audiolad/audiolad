import type { SupabaseClient } from "@supabase/supabase-js";

import type { AudioItemRow, PracticeRow } from "./types";
import { minutesFromSeconds } from "./utils";

export const MULTI_AUDIO_PUBLISH_MESSAGE =
  "Продукт сохранён как черновик. Публикация аудиопродуктов с несколькими аудио будет доступна после подключения последовательного прослушивания.";

type PublishValidationResult =
  | { ok: true }
  | { ok: false; code: string; message: string };

export function validatePublishRequirements(
  practice: PracticeRow,
  audioItems: AudioItemRow[],
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

  if (!format) {
    return {
      ok: false,
      code: "missing_format",
      message: "Выберите публичный формат.",
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

  if (audioItems.length === 0) {
    return {
      ok: false,
      code: "missing_audio",
      message: "Добавьте хотя бы одно аудио.",
    };
  }

  if (audioItems.length > 1) {
    return {
      ok: false,
      code: "multi_audio_not_supported",
      message: MULTI_AUDIO_PUBLISH_MESSAGE,
    };
  }

  const audio = audioItems[0];
  const audioPath = audio.audio_path?.trim();

  if (!audioPath) {
    return {
      ok: false,
      code: "missing_audio_file",
      message: "Загрузите MP3-файл для аудио.",
    };
  }

  if (!audio.duration_seconds || audio.duration_seconds <= 0) {
    return {
      ok: false,
      code: "missing_duration",
      message: "Не удалось определить длительность аудио.",
    };
  }

  if (practice.is_free) {
    if (practice.price !== 0) {
      return {
        ok: false,
        code: "invalid_price",
        message: "Для бесплатного продукта цена должна быть 0 ₽.",
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

export async function syncSingleAudioCompatibility(
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

  const firstAudio = audioItems?.[0];
  const firstPath = firstAudio?.audio_path?.trim() || null;
  const durationMinutes =
    firstAudio?.duration_seconds && firstAudio.duration_seconds > 0
      ? minutesFromSeconds(firstAudio.duration_seconds)
      : null;

  const { error: updateError } = await supabase
    .from("practices")
    .update({
      audio_url: firstPath,
      duration_minutes: durationMinutes,
      updated_at: new Date().toISOString(),
    })
    .eq("id", practiceId);

  if (updateError) {
    throw new Error("practice_sync_failed");
  }
}
