import { presentCourseAudioTitle } from "./course-audio-title";
import { attachNativeUpgradeAction } from "./attach-upgrade-action";
import { canAccessRequiredLevel, type CourseLearnerAccessSnapshot } from "./learner-access";
import type {
  LearnerCourse,
  LearnerCourseAudioBlock,
  LearnerCourseBlock,
  LearnerCourseFileBlock,
  LearnerCourseLesson,
  LearnerCourseLevel,
  LearnerCourseTextBlock,
} from "./learner-types";

export type LearnerLessonSource = {
  id: string;
  title: string;
  position: number;
  required_access_level?: number | null;
};

export type LearnerBlockSource = {
  id: string;
  lesson_id: string;
  type: string;
  position: number;
  asset_id: string | null;
  payload: unknown;
};

export type LearnerAudioAssetSource = {
  id: string;
  title?: string | null;
  duration_seconds?: number | null;
};

export type LearnerFileAssetSource = {
  id: string;
  original_name?: string | null;
  mime?: string | null;
  size_bytes?: number | null;
  storage_path?: string | null;
};

export type LearnerLevelSource = {
  level: number;
  title?: string | null;
  description?: string | null;
  upgrade_price?: number | null;
  currency?: string | null;
};

export function normalizeRequiredAccessLevel(value: unknown): number {
  if (typeof value === "number" && Number.isInteger(value) && value >= 1) {
    return value;
  }

  return 1;
}

export function mapPracticeAccessLevels(
  rows: readonly LearnerLevelSource[],
): LearnerCourseLevel[] {
  return [...rows]
    .filter((row) => typeof row.level === "number" && row.level >= 1)
    .sort((left, right) => left.level - right.level)
    .map((row) => ({
      level: row.level,
      title: typeof row.title === "string" ? row.title.trim() : "",
      description:
        typeof row.description === "string" && row.description.trim()
          ? row.description.trim()
          : null,
      upgradePrice:
        typeof row.upgrade_price === "number" &&
        Number.isFinite(row.upgrade_price) &&
        row.upgrade_price > 0
          ? row.upgrade_price
          : null,
      currency:
        typeof row.currency === "string" && row.currency.trim()
          ? row.currency.trim()
          : null,
    }))
    .filter((row) => row.title.length > 0);
}

function readTextPayload(payload: unknown): string | null {
  if (payload == null || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }

  const text = (payload as { text?: unknown }).text;
  return typeof text === "string" ? text : null;
}

function mapUnlockedBlock(
  block: LearnerBlockSource,
  audioAssets: ReadonlyMap<string, LearnerAudioAssetSource>,
  fileAssets: ReadonlyMap<string, LearnerFileAssetSource>,
  audioOrdinal: number,
): LearnerCourseBlock | null {
  if (block.type === "text") {
    const text = readTextPayload(block.payload);
    if (text == null) {
      return null;
    }

    const mapped: LearnerCourseTextBlock = {
      id: block.id,
      type: "text",
      position: block.position,
      text,
    };
    return mapped;
  }

  if (block.type === "audio") {
    const audioItemId = block.asset_id?.trim();
    if (!audioItemId) {
      return null;
    }

    const asset = audioAssets.get(audioItemId);
    const mapped: LearnerCourseAudioBlock = {
      id: block.id,
      type: "audio",
      position: block.position,
      audioItemId,
      title: presentCourseAudioTitle(asset?.title, audioOrdinal),
      durationSeconds: asset?.duration_seconds ?? null,
    };
    return mapped;
  }

  if (block.type === "file") {
    const fileId = block.asset_id?.trim();
    if (!fileId) {
      return null;
    }

    const asset = fileAssets.get(fileId);
    const mapped: LearnerCourseFileBlock = {
      id: block.id,
      type: "file",
      position: block.position,
      fileId,
      filename: asset?.original_name?.trim() || "Файл.pdf",
      mime: asset?.mime?.trim() || "application/pdf",
      sizeBytes: asset?.size_bytes ?? 0,
    };
    return mapped;
  }

  return null;
}

/**
 * Redact a lesson BEFORE client serialization.
 * Locked lessons keep safe metadata only — never text, asset ids, paths, or URLs.
 */
export function toLearnerCourseLesson(input: {
  lesson: LearnerLessonSource;
  blocks: readonly LearnerBlockSource[];
  access: CourseLearnerAccessSnapshot;
  audioAssets: ReadonlyMap<string, LearnerAudioAssetSource>;
  fileAssets: ReadonlyMap<string, LearnerFileAssetSource>;
}): LearnerCourseLesson {
  const requiredAccessLevel = normalizeRequiredAccessLevel(
    input.lesson.required_access_level,
  );
  const locked = !canAccessRequiredLevel(input.access, requiredAccessLevel);

  if (locked) {
    return {
      id: input.lesson.id,
      title: input.lesson.title,
      position: input.lesson.position,
      requiredAccessLevel,
      locked: true,
    };
  }

  let audioOrdinal = 0;
  const blocks = [...input.blocks]
    .filter((block) => block.lesson_id === input.lesson.id)
    .sort((left, right) => left.position - right.position || left.id.localeCompare(right.id))
    .map((block) => {
      if (block.type === "audio") {
        audioOrdinal += 1;
      }
      return mapUnlockedBlock(
        block,
        input.audioAssets,
        input.fileAssets,
        audioOrdinal,
      );
    })
    .filter((block): block is LearnerCourseBlock => block != null);

  return {
    id: input.lesson.id,
    title: input.lesson.title,
    position: input.lesson.position,
    requiredAccessLevel,
    locked: false,
    blocks,
  };
}

export function toLearnerCourse(input: {
  publicationId: string;
  access: CourseLearnerAccessSnapshot;
  lessons: readonly LearnerLessonSource[];
  blocks: readonly LearnerBlockSource[];
  audioAssets: ReadonlyMap<string, LearnerAudioAssetSource>;
  fileAssets: ReadonlyMap<string, LearnerFileAssetSource>;
  levels: readonly LearnerLevelSource[];
}): LearnerCourse {
  const lessons = [...input.lessons]
    .sort((left, right) => left.position - right.position || left.id.localeCompare(right.id))
    .map((lesson) =>
      toLearnerCourseLesson({
        lesson,
        blocks: input.blocks,
        access: input.access,
        audioAssets: input.audioAssets,
        fileAssets: input.fileAssets,
      }),
    );

  return {
    publicationId: input.publicationId,
    accessLevel: input.access.accessLevel,
    privileged: input.access.privileged,
    levels: attachNativeUpgradeAction({
      levels: mapPracticeAccessLevels(input.levels),
      accessLevel: input.access.accessLevel,
      practiceId: input.publicationId,
      privileged: input.access.privileged,
    }),
    lessons,
  };
}

const LOCKED_LEAK_PATTERNS = [
  /"text"\s*:/,
  /"audioItemId"\s*:/,
  /"audio_url"\s*:/,
  /"audioUrl"\s*:/,
  /"asset_id"\s*:/,
  /"assetId"\s*:/,
  /"fileId"\s*:/,
  /"storage_path"\s*:/,
  /"storagePath"\s*:/,
  /"signedUrl"\s*:/,
  /"signed_url"\s*:/,
  /"audio_path"\s*:/,
];

export function assertLearnerLessonRedacted(lesson: LearnerCourseLesson): void {
  if (!lesson.locked) {
    return;
  }

  if (lesson.blocks && lesson.blocks.length > 0) {
    throw new Error("locked_lesson_must_not_include_blocks");
  }

  const serialized = JSON.stringify(lesson);
  for (const pattern of LOCKED_LEAK_PATTERNS) {
    if (pattern.test(serialized)) {
      throw new Error(`locked_lesson_payload_leak:${pattern.source}`);
    }
  }
}

export function serializeLearnerCourse(course: LearnerCourse): LearnerCourse {
  for (const lesson of course.lessons) {
    assertLearnerLessonRedacted(lesson);
  }

  return JSON.parse(JSON.stringify(course)) as LearnerCourse;
}
