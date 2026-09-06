/**
 * Shared course access-level rules for the author editor, snapshot, and
 * publish readiness. Empty catalog = legacy single implicit L1.
 * Author writes must keep contiguous 1..N with L1 present.
 */

import { sanitizeStoredFormatLabel } from "@/lib/author-products/format";

export const ACCESS_LEVEL_TITLE_MAX = 100;
export const ACCESS_LEVEL_DESCRIPTION_MAX = 1000;

export const COURSE_ACCESS_LEVELS_SECTION_TITLE = "Уровни доступа";
export const COURSE_ACCESS_LEVELS_LEGACY_COPY =
  "По умолчанию весь аудиокурс доступен после одной покупки.";
export const COURSE_ACCESS_LEVELS_ADD_SECOND_LABEL = "Добавить второй уровень";
export const COURSE_ACCESS_LEVELS_ADD_NEXT_LABEL = "Добавить следующий уровень";
export const COURSE_ACCESS_LEVELS_BASE_PRICE_LABEL = "Цена курса";
export const COURSE_ACCESS_LEVEL_SELECT_LABEL = "Уровень доступа";

export const COURSE_PUBLISH_MISSING_ACCESS_LEVEL_1_CODE =
  "missing_access_level_1";
export const COURSE_PUBLISH_ACCESS_LEVELS_NOT_CONTIGUOUS_CODE =
  "access_levels_not_contiguous";
export const COURSE_PUBLISH_INVALID_LEVEL_1_UPGRADE_CODE =
  "invalid_level_1_upgrade_price";
export const COURSE_PUBLISH_INVALID_PAID_UPGRADE_CODE =
  "invalid_paid_upgrade_price";
export const COURSE_PUBLISH_LESSON_LEVEL_NOT_IN_CATALOG_CODE =
  "lesson_level_not_in_catalog";
export const COURSE_PUBLISH_PAID_LEVEL_MISSING_LESSONS_CODE =
  "paid_level_missing_lessons";

export const COURSE_PUBLISH_MISSING_ACCESS_LEVEL_1_MESSAGE =
  "Если уровни доступа включены, должен существовать первый уровень.";
export const COURSE_PUBLISH_ACCESS_LEVELS_NOT_CONTIGUOUS_MESSAGE =
  "Уровни доступа должны идти подряд: 1, 2, 3… без пропусков.";
export const COURSE_PUBLISH_INVALID_LEVEL_1_UPGRADE_MESSAGE =
  "У первого уровня нет отдельной доплаты. Цена курса задаётся в карточке продукта.";
export const COURSE_PUBLISH_INVALID_PAID_UPGRADE_MESSAGE =
  "Для каждого платного уровня укажите доплату больше 0 ₽.";
export const COURSE_PUBLISH_LESSON_LEVEL_NOT_IN_CATALOG_MESSAGE =
  "Каждый урок должен относиться к одному из настроенных уровней доступа.";
export const COURSE_PUBLISH_PAID_LEVEL_MISSING_LESSONS_MESSAGE =
  "У каждого платного уровня должен быть хотя бы один урок.";

export const LESSON_LEVEL_RAISE_LOCKED_CODE = "lesson_level_raise_locked";
export const LESSON_LEVEL_RAISE_LOCKED_MESSAGE =
  "Нельзя повысить уровень уже существующего урока после продажи: слушатели потеряют доступ к купленному материалу.";
export const LESSON_LEVEL_NOT_CONFIGURED_CODE = "lesson_level_not_configured";
export const LESSON_LEVEL_NOT_CONFIGURED_MESSAGE =
  "Выберите один из настроенных уровней доступа.";
export const CANNOT_DELETE_LEVEL_1_CODE = "cannot_delete_level_1";
export const CANNOT_DELETE_LEVEL_1_MESSAGE = "Первый уровень нельзя удалить.";
export const CANNOT_DELETE_NON_HIGHEST_LEVEL_CODE =
  "cannot_delete_non_highest_level";
export const CANNOT_DELETE_NON_HIGHEST_LEVEL_MESSAGE =
  "Удалить можно только последний уровень.";
export const LEVEL_HAS_LESSONS_CODE = "level_has_lessons";
export const LEVEL_HAS_LESSONS_MESSAGE =
  "Нельзя удалить уровень, пока к нему привязаны уроки.";
export const LEVEL_HAS_ENTITLEMENTS_CODE = "level_has_entitlements";
export const LEVEL_HAS_ENTITLEMENTS_MESSAGE =
  "Нельзя удалить уровень: у слушателей уже есть доступ этого уровня или выше.";
export const ACCESS_LEVELS_BOOTSTRAP_REQUIRED_CODE =
  "access_levels_bootstrap_required";
export const ACCESS_LEVELS_BOOTSTRAP_REQUIRED_MESSAGE =
  "Сначала сохраните первый и второй уровни вместе.";
export const ACCESS_LEVELS_ALREADY_CONFIGURED_CODE =
  "access_levels_already_configured";
export const ACCESS_LEVELS_ALREADY_CONFIGURED_MESSAGE =
  "Уровни доступа уже созданы. Добавьте следующий уровень.";
export const ACCESS_LEVEL_NOT_FOUND_CODE = "access_level_not_found";
export const ACCESS_LEVEL_NOT_FOUND_MESSAGE = "Уровень доступа не найден.";
export const INVALID_ACCESS_LEVEL_TITLE_CODE = "invalid_access_level_title";
export const INVALID_ACCESS_LEVEL_TITLE_MESSAGE =
  "Укажите название уровня — до 100 символов.";
export const INVALID_ACCESS_LEVEL_DESCRIPTION_CODE =
  "invalid_access_level_description";
export const INVALID_ACCESS_LEVEL_DESCRIPTION_MESSAGE =
  "Описание уровня должно быть обычным текстом до 1000 символов.";
export const INVALID_REQUIRED_ACCESS_LEVEL_CODE =
  "invalid_required_access_level";
export const INVALID_REQUIRED_ACCESS_LEVEL_MESSAGE =
  "Укажите уровень доступа целым числом от 1.";
export const INVALID_UPGRADE_PRICE_CODE = "invalid_upgrade_price";
export const INVALID_UPGRADE_PRICE_MESSAGE =
  "Укажите доплату целым числом больше 0 ₽.";
export const LEVEL_1_UPGRADE_MUST_BE_NULL_CODE = "level_1_upgrade_must_be_null";
export const LEVEL_1_UPGRADE_MUST_BE_NULL_MESSAGE =
  "У первого уровня нет отдельной цены. Цена курса задаётся выше.";

export type CourseBuilderAccessLevelDto = {
  id: string;
  practice_id: string;
  level: number;
  title: string;
  description: string | null;
  upgrade_price: number | null;
  currency: string;
  created_at: string;
  updated_at: string;
};

export type AccessLevelWriteInput = {
  title: string;
  description: string | null;
  upgrade_price: number | null;
};

export type AccessLevelReadinessInput = {
  level: number;
  title?: string | null;
  upgrade_price?: number | null;
};

export type CourseAccessLevelReadinessFailure = {
  ok: false;
  code:
    | typeof COURSE_PUBLISH_MISSING_ACCESS_LEVEL_1_CODE
    | typeof COURSE_PUBLISH_ACCESS_LEVELS_NOT_CONTIGUOUS_CODE
    | typeof COURSE_PUBLISH_INVALID_LEVEL_1_UPGRADE_CODE
    | typeof COURSE_PUBLISH_INVALID_PAID_UPGRADE_CODE
    | typeof COURSE_PUBLISH_LESSON_LEVEL_NOT_IN_CATALOG_CODE
    | typeof COURSE_PUBLISH_PAID_LEVEL_MISSING_LESSONS_CODE;
  message: string;
};

export type CourseAccessLevelReadinessResult =
  | { ok: true }
  | CourseAccessLevelReadinessFailure;

export function normalizeRequiredAccessLevel(value: unknown): number {
  if (typeof value === "number" && Number.isInteger(value) && value >= 1) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isInteger(parsed) && parsed >= 1) {
      return parsed;
    }
  }

  return 1;
}

/**
 * Strict author-write parser. Absent values are handled by the caller.
 * Present invalid values must not fall back to 1.
 */
export function parseRequiredAccessLevelWrite(
  value: unknown,
):
  | { ok: true; value: number }
  | { ok: false; reason: typeof INVALID_REQUIRED_ACCESS_LEVEL_CODE } {
  if (typeof value === "number") {
    if (Number.isInteger(value) && value >= 1) {
      return { ok: true, value };
    }

    return { ok: false, reason: INVALID_REQUIRED_ACCESS_LEVEL_CODE };
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed || !/^[0-9]+$/.test(trimmed)) {
      return { ok: false, reason: INVALID_REQUIRED_ACCESS_LEVEL_CODE };
    }

    const parsed = Number(trimmed);
    if (Number.isInteger(parsed) && parsed >= 1) {
      return { ok: true, value: parsed };
    }
  }

  return { ok: false, reason: INVALID_REQUIRED_ACCESS_LEVEL_CODE };
}

function isPlainAccessLevelText(value: string): boolean {
  return sanitizeStoredFormatLabel(value) === value.replace(/\s+/g, " ").trim();
}

export function readRequiredAccessLevelField(
  record: Record<string, unknown>,
): unknown {
  if ("requiredAccessLevel" in record) {
    return record.requiredAccessLevel;
  }

  return record.required_access_level;
}

export function nextAccessLevel(
  existing: ReadonlyArray<{ level: number }>,
): number {
  if (existing.length === 0) {
    return 1;
  }

  return Math.max(...existing.map((item) => item.level)) + 1;
}

export function areAccessLevelsContiguous(
  levels: ReadonlyArray<{ level: number }>,
): boolean {
  if (levels.length === 0) {
    return true;
  }

  const sorted = [...levels].map((item) => item.level).sort((left, right) => left - right);

  if (sorted[0] !== 1) {
    return false;
  }

  return sorted.every((level, index) => level === index + 1);
}

export function isConfiguredAccessLevel(
  levels: ReadonlyArray<{ level: number }>,
  required: number,
): boolean {
  if (levels.length === 0) {
    return required === 1;
  }

  return levels.some((item) => item.level === required);
}

export function formatAccessLevelBadge(level: number): string {
  return `Уровень ${level}`;
}

export function formatAccessLevelOption(
  level: number,
  title?: string | null,
): string {
  const trimmed = title?.trim();
  return trimmed ? `Уровень ${level}. ${trimmed}` : `Уровень ${level}`;
}

export function parseAccessLevelTitle(
  value: unknown,
):
  | { ok: true; value: string }
  | { ok: false; reason: typeof INVALID_ACCESS_LEVEL_TITLE_CODE } {
  if (typeof value !== "string") {
    return { ok: false, reason: INVALID_ACCESS_LEVEL_TITLE_CODE };
  }

  const trimmed = value.trim();

  if (!trimmed || trimmed.length > ACCESS_LEVEL_TITLE_MAX) {
    return { ok: false, reason: INVALID_ACCESS_LEVEL_TITLE_CODE };
  }

  if (!isPlainAccessLevelText(trimmed)) {
    return { ok: false, reason: INVALID_ACCESS_LEVEL_TITLE_CODE };
  }

  return { ok: true, value: trimmed };
}

export function parseAccessLevelDescription(
  value: unknown,
):
  | { ok: true; value: string | null }
  | { ok: false; reason: typeof INVALID_ACCESS_LEVEL_DESCRIPTION_CODE } {
  if (value == null) {
    return { ok: true, value: null };
  }

  if (typeof value !== "string") {
    return { ok: false, reason: INVALID_ACCESS_LEVEL_DESCRIPTION_CODE };
  }

  const trimmed = value.trim();

  if (trimmed.length > ACCESS_LEVEL_DESCRIPTION_MAX) {
    return { ok: false, reason: INVALID_ACCESS_LEVEL_DESCRIPTION_CODE };
  }

  if (trimmed && !isPlainAccessLevelText(trimmed)) {
    return { ok: false, reason: INVALID_ACCESS_LEVEL_DESCRIPTION_CODE };
  }

  return { ok: true, value: trimmed ? trimmed : null };
}

function readUpgradePriceField(record: Record<string, unknown>): unknown {
  if ("upgrade_price" in record) {
    return record.upgrade_price;
  }

  return record.upgradePrice;
}

export function parseUpgradePriceForLevel(
  value: unknown,
  level: number,
):
  | { ok: true; value: number | null }
  | {
      ok: false;
      reason:
        | typeof INVALID_UPGRADE_PRICE_CODE
        | typeof LEVEL_1_UPGRADE_MUST_BE_NULL_CODE;
    } {
  if (level <= 1) {
    if (value == null || value === "") {
      return { ok: true, value: null };
    }

    return { ok: false, reason: LEVEL_1_UPGRADE_MUST_BE_NULL_CODE };
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.trim());
    if (Number.isInteger(parsed) && parsed > 0) {
      return { ok: true, value: parsed };
    }

    return { ok: false, reason: INVALID_UPGRADE_PRICE_CODE };
  }

  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return { ok: true, value };
  }

  return { ok: false, reason: INVALID_UPGRADE_PRICE_CODE };
}

export function parseAccessLevelWriteInput(
  body: unknown,
  level: number,
):
  | { ok: true; value: AccessLevelWriteInput }
  | { ok: false; reason: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, reason: "invalid_request" };
  }

  const record = body as Record<string, unknown>;
  const title = parseAccessLevelTitle(record.title);
  const description = parseAccessLevelDescription(record.description);
  const upgradePrice = parseUpgradePriceForLevel(
    readUpgradePriceField(record),
    level,
  );

  if (!title.ok) {
    return title;
  }

  if (!description.ok) {
    return description;
  }

  if (!upgradePrice.ok) {
    return upgradePrice;
  }

  return {
    ok: true,
    value: {
      title: title.value,
      description: description.value,
      upgrade_price: level <= 1 ? null : upgradePrice.value,
    },
  };
}

export function parseBootstrapAccessLevelsInput(body: unknown):
  | {
      ok: true;
      value: { level1: AccessLevelWriteInput; level2: AccessLevelWriteInput };
    }
  | { ok: false; reason: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, reason: "invalid_request" };
  }

  const levels = (body as { levels?: unknown }).levels;

  if (!Array.isArray(levels) || levels.length !== 2) {
    return { ok: false, reason: ACCESS_LEVELS_BOOTSTRAP_REQUIRED_CODE };
  }

  const firstLevel =
    levels[0] && typeof levels[0] === "object" && "level" in levels[0]
      ? normalizeRequiredAccessLevel((levels[0] as { level?: unknown }).level)
      : 1;
  const secondLevel =
    levels[1] && typeof levels[1] === "object" && "level" in levels[1]
      ? normalizeRequiredAccessLevel((levels[1] as { level?: unknown }).level)
      : 2;

  if (firstLevel !== 1 || secondLevel !== 2) {
    return { ok: false, reason: ACCESS_LEVELS_BOOTSTRAP_REQUIRED_CODE };
  }

  const level1 = parseAccessLevelWriteInput(levels[0], 1);
  const level2 = parseAccessLevelWriteInput(levels[1], 2);

  if (!level1.ok) {
    return level1;
  }

  if (!level2.ok) {
    return level2;
  }

  return {
    ok: true,
    value: { level1: level1.value, level2: level2.value },
  };
}

export function parseAppendAccessLevelInput(body: unknown):
  | { ok: true; value: AccessLevelWriteInput }
  | { ok: false; reason: string } {
  return parseAccessLevelWriteInput(body, 2);
}

export function parseAccessLevelPatchInput(
  body: unknown,
  current: AccessLevelWriteInput & { level: number },
):
  | { ok: true; value: AccessLevelWriteInput }
  | { ok: false; reason: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, reason: "invalid_request" };
  }

  const record = body as Record<string, unknown>;
  const next: AccessLevelWriteInput = {
    title: current.title,
    description: current.description,
    upgrade_price: current.level <= 1 ? null : current.upgrade_price,
  };

  if ("title" in record) {
    const title = parseAccessLevelTitle(record.title);
    if (!title.ok) {
      return title;
    }
    next.title = title.value;
  }

  if ("description" in record) {
    const description = parseAccessLevelDescription(record.description);
    if (!description.ok) {
      return description;
    }
    next.description = description.value;
  }

  if ("upgrade_price" in record || "upgradePrice" in record) {
    const upgradePrice = parseUpgradePriceForLevel(
      readUpgradePriceField(record),
      current.level,
    );
    if (!upgradePrice.ok) {
      return upgradePrice;
    }
    next.upgrade_price = current.level <= 1 ? null : upgradePrice.value;
  }

  if (current.level >= 2 && !(next.upgrade_price && next.upgrade_price > 0)) {
    return { ok: false, reason: INVALID_UPGRADE_PRICE_CODE };
  }

  return { ok: true, value: next };
}

export function evaluateLessonLevelChange(input: {
  currentLevel: number;
  nextLevel: number;
  saleLocked: boolean;
}):
  | { ok: true }
  | { ok: false; code: typeof LESSON_LEVEL_RAISE_LOCKED_CODE; message: string } {
  if (input.nextLevel > input.currentLevel && input.saleLocked) {
    return {
      ok: false,
      code: LESSON_LEVEL_RAISE_LOCKED_CODE,
      message: LESSON_LEVEL_RAISE_LOCKED_MESSAGE,
    };
  }

  return { ok: true };
}

export function evaluateAccessLevelDelete(input: {
  level: number;
  maxLevel: number;
  lessonCountAtLevel: number;
  entitlementCountAtOrAbove: number;
}):
  | { ok: true }
  | { ok: false; code: string; status: 409; message: string } {
  if (input.level <= 1) {
    return {
      ok: false,
      code: CANNOT_DELETE_LEVEL_1_CODE,
      status: 409,
      message: CANNOT_DELETE_LEVEL_1_MESSAGE,
    };
  }

  if (input.level !== input.maxLevel) {
    return {
      ok: false,
      code: CANNOT_DELETE_NON_HIGHEST_LEVEL_CODE,
      status: 409,
      message: CANNOT_DELETE_NON_HIGHEST_LEVEL_MESSAGE,
    };
  }

  if (input.lessonCountAtLevel > 0) {
    return {
      ok: false,
      code: LEVEL_HAS_LESSONS_CODE,
      status: 409,
      message: LEVEL_HAS_LESSONS_MESSAGE,
    };
  }

  if (input.entitlementCountAtOrAbove > 0) {
    return {
      ok: false,
      code: LEVEL_HAS_ENTITLEMENTS_CODE,
      status: 409,
      message: LEVEL_HAS_ENTITLEMENTS_MESSAGE,
    };
  }

  return { ok: true };
}

export function evaluateCourseAccessLevelsReadiness(input: {
  accessLevels?: ReadonlyArray<AccessLevelReadinessInput> | null;
  lessons?: ReadonlyArray<{
    required_access_level?: number | null;
    requiredAccessLevel?: number | null;
  }> | null;
}): CourseAccessLevelReadinessResult {
  const levels = input.accessLevels ?? [];

  if (levels.length === 0) {
    return { ok: true };
  }

  if (!levels.some((item) => item.level === 1)) {
    return {
      ok: false,
      code: COURSE_PUBLISH_MISSING_ACCESS_LEVEL_1_CODE,
      message: COURSE_PUBLISH_MISSING_ACCESS_LEVEL_1_MESSAGE,
    };
  }

  if (!areAccessLevelsContiguous(levels)) {
    return {
      ok: false,
      code: COURSE_PUBLISH_ACCESS_LEVELS_NOT_CONTIGUOUS_CODE,
      message: COURSE_PUBLISH_ACCESS_LEVELS_NOT_CONTIGUOUS_MESSAGE,
    };
  }

  const level1 = levels.find((item) => item.level === 1);

  if (level1 && level1.upgrade_price != null) {
    return {
      ok: false,
      code: COURSE_PUBLISH_INVALID_LEVEL_1_UPGRADE_CODE,
      message: COURSE_PUBLISH_INVALID_LEVEL_1_UPGRADE_MESSAGE,
    };
  }

  if (
    levels.some(
      (item) =>
        item.level >= 2 &&
        !(
          typeof item.upgrade_price === "number" &&
          Number.isInteger(item.upgrade_price) &&
          item.upgrade_price > 0
        ),
    )
  ) {
    return {
      ok: false,
      code: COURSE_PUBLISH_INVALID_PAID_UPGRADE_CODE,
      message: COURSE_PUBLISH_INVALID_PAID_UPGRADE_MESSAGE,
    };
  }

  const configured = new Set(levels.map((item) => item.level));
  const lessonCounts = new Map<number, number>();

  for (const lesson of input.lessons ?? []) {
    const required = normalizeRequiredAccessLevel(
      lesson.required_access_level ?? lesson.requiredAccessLevel,
    );

    if (!configured.has(required)) {
      return {
        ok: false,
        code: COURSE_PUBLISH_LESSON_LEVEL_NOT_IN_CATALOG_CODE,
        message: COURSE_PUBLISH_LESSON_LEVEL_NOT_IN_CATALOG_MESSAGE,
      };
    }

    lessonCounts.set(required, (lessonCounts.get(required) ?? 0) + 1);
  }

  for (const level of levels) {
    if (level.level < 2) {
      continue;
    }

    if ((lessonCounts.get(level.level) ?? 0) < 1) {
      return {
        ok: false,
        code: COURSE_PUBLISH_PAID_LEVEL_MISSING_LESSONS_CODE,
        message: COURSE_PUBLISH_PAID_LEVEL_MISSING_LESSONS_MESSAGE,
      };
    }
  }

  return { ok: true };
}

export function getCourseAccessLevelErrorMessage(code: string | undefined): string | null {
  switch (code) {
    case INVALID_ACCESS_LEVEL_TITLE_CODE:
      return INVALID_ACCESS_LEVEL_TITLE_MESSAGE;
    case INVALID_ACCESS_LEVEL_DESCRIPTION_CODE:
      return INVALID_ACCESS_LEVEL_DESCRIPTION_MESSAGE;
    case INVALID_REQUIRED_ACCESS_LEVEL_CODE:
      return INVALID_REQUIRED_ACCESS_LEVEL_MESSAGE;
    case INVALID_UPGRADE_PRICE_CODE:
      return INVALID_UPGRADE_PRICE_MESSAGE;
    case LEVEL_1_UPGRADE_MUST_BE_NULL_CODE:
      return LEVEL_1_UPGRADE_MUST_BE_NULL_MESSAGE;
    case ACCESS_LEVELS_BOOTSTRAP_REQUIRED_CODE:
      return ACCESS_LEVELS_BOOTSTRAP_REQUIRED_MESSAGE;
    case ACCESS_LEVELS_ALREADY_CONFIGURED_CODE:
      return ACCESS_LEVELS_ALREADY_CONFIGURED_MESSAGE;
    case ACCESS_LEVEL_NOT_FOUND_CODE:
      return ACCESS_LEVEL_NOT_FOUND_MESSAGE;
    case CANNOT_DELETE_LEVEL_1_CODE:
      return CANNOT_DELETE_LEVEL_1_MESSAGE;
    case CANNOT_DELETE_NON_HIGHEST_LEVEL_CODE:
      return CANNOT_DELETE_NON_HIGHEST_LEVEL_MESSAGE;
    case LEVEL_HAS_LESSONS_CODE:
      return LEVEL_HAS_LESSONS_MESSAGE;
    case LEVEL_HAS_ENTITLEMENTS_CODE:
      return LEVEL_HAS_ENTITLEMENTS_MESSAGE;
    case LESSON_LEVEL_NOT_CONFIGURED_CODE:
      return LESSON_LEVEL_NOT_CONFIGURED_MESSAGE;
    case LESSON_LEVEL_RAISE_LOCKED_CODE:
      return LESSON_LEVEL_RAISE_LOCKED_MESSAGE;
    case COURSE_PUBLISH_MISSING_ACCESS_LEVEL_1_CODE:
      return COURSE_PUBLISH_MISSING_ACCESS_LEVEL_1_MESSAGE;
    case COURSE_PUBLISH_ACCESS_LEVELS_NOT_CONTIGUOUS_CODE:
      return COURSE_PUBLISH_ACCESS_LEVELS_NOT_CONTIGUOUS_MESSAGE;
    case COURSE_PUBLISH_INVALID_LEVEL_1_UPGRADE_CODE:
      return COURSE_PUBLISH_INVALID_LEVEL_1_UPGRADE_MESSAGE;
    case COURSE_PUBLISH_INVALID_PAID_UPGRADE_CODE:
      return COURSE_PUBLISH_INVALID_PAID_UPGRADE_MESSAGE;
    case COURSE_PUBLISH_LESSON_LEVEL_NOT_IN_CATALOG_CODE:
      return COURSE_PUBLISH_LESSON_LEVEL_NOT_IN_CATALOG_MESSAGE;
    case COURSE_PUBLISH_PAID_LEVEL_MISSING_LESSONS_CODE:
      return COURSE_PUBLISH_PAID_LEVEL_MISSING_LESSONS_MESSAGE;
    default:
      return null;
  }
}
