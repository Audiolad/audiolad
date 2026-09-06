import type { LearnerCourseLevel, LearnerCourseUpgradeAction } from "./learner-types";

/**
 * Native upgrade CTA belongs only on the immediate next locked level.
 * L1 with L2+L3 → L2 only. After L2 → L3. Max level / privileged → none.
 */
export function nextNativeUpgradeLevel(accessLevel: number | null): number | null {
  if (accessLevel == null || !Number.isInteger(accessLevel) || accessLevel < 1) {
    return null;
  }

  return accessLevel + 1;
}

export function attachNativeUpgradeAction(input: {
  levels: readonly LearnerCourseLevel[];
  accessLevel: number | null;
  practiceId: string;
  privileged: boolean;
}): LearnerCourseLevel[] {
  const nextLevel = input.privileged
    ? null
    : nextNativeUpgradeLevel(input.accessLevel);

  return input.levels.map((level) => {
    if (
      nextLevel == null ||
      level.level !== nextLevel ||
      !(typeof level.upgradePrice === "number" && level.upgradePrice > 0)
    ) {
      const { upgradeAction: _omit, ...rest } = level;
      void _omit;
      return rest;
    }

    const upgradeAction: LearnerCourseUpgradeAction = {
      kind: "course_upgrade",
      practiceId: input.practiceId,
      targetAccessLevel: nextLevel,
    };

    return {
      ...level,
      upgradeAction,
    };
  });
}
