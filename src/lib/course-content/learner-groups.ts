import { formatRubles } from "@/lib/products/price-format";

import type {
  LearnerCourse,
  LearnerCourseLesson,
  LearnerCourseLevel,
} from "./learner-types";

export type LearnerCourseLevelChrome = {
  heading: string;
  description: string | null;
  upgradePriceLabel: string | null;
  upgradeAction: { href: string; label: string } | null;
};

export type LearnerCourseLevelGroup = {
  requiredAccessLevel: number;
  catalog: LearnerCourseLevel | null;
  chrome: LearnerCourseLevelChrome | null;
  lessons: LearnerCourseLesson[];
};

export type LearnerCourseView =
  | { kind: "flat"; lessons: LearnerCourseLesson[] }
  | { kind: "grouped"; groups: LearnerCourseLevelGroup[] };

const UPGRADE_LABELS: Record<number, string> = {
  2: "Открыть второй уровень",
  3: "Открыть третий уровень",
  4: "Открыть четвёртый уровень",
  5: "Открыть пятый уровень",
};

export function learnerLevelUpgradeLabel(level: number): string {
  return UPGRADE_LABELS[level] ?? `Открыть уровень ${level}`;
}

export function formatLearnerLevelHeading(level: number, title: string): string {
  return `Уровень ${level}. ${title}`;
}

function catalogForLevel(
  levels: readonly LearnerCourseLevel[],
  requiredAccessLevel: number,
): LearnerCourseLevel | null {
  return levels.find((row) => row.level === requiredAccessLevel) ?? null;
}

function buildChrome(
  catalog: LearnerCourseLevel | null,
  groupLocked: boolean,
): LearnerCourseLevelChrome | null {
  if (!catalog) {
    return null;
  }

  const href = catalog.upgradeAction?.href?.trim() || "";

  return {
    heading: formatLearnerLevelHeading(catalog.level, catalog.title),
    description: catalog.description,
    upgradePriceLabel:
      groupLocked && catalog.upgradePrice
        ? `Доплата ${formatRubles(catalog.upgradePrice)}`
        : null,
    upgradeAction:
      groupLocked && href
        ? { href, label: learnerLevelUpgradeLabel(catalog.level) }
        : null,
  };
}

/**
 * Product model: one access level → many materials → one upgrade.
 * Legacy empty `practice_access_levels` stays a flat lesson list.
 * Implicit L1 (Phase 1: only L2+ configured) has no synthetic L1 chrome.
 */
export function groupLearnerCourse(course: LearnerCourse): LearnerCourseView {
  if (course.levels.length === 0) {
    return { kind: "flat", lessons: course.lessons };
  }

  const groups: LearnerCourseLevelGroup[] = [];
  const indexByLevel = new Map<number, number>();

  for (const lesson of course.lessons) {
    const existing = indexByLevel.get(lesson.requiredAccessLevel);
    if (existing != null) {
      groups[existing].lessons.push(lesson);
      continue;
    }

    groups.push({
      requiredAccessLevel: lesson.requiredAccessLevel,
      catalog: catalogForLevel(course.levels, lesson.requiredAccessLevel),
      chrome: null,
      lessons: [lesson],
    });
    indexByLevel.set(lesson.requiredAccessLevel, groups.length - 1);
  }

  for (const group of groups) {
    const groupLocked = group.lessons.every((lesson) => lesson.locked);
    group.chrome = buildChrome(group.catalog, groupLocked);
  }

  return { kind: "grouped", groups };
}
