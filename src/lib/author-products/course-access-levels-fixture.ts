/**
 * Test-only two-level course catalog. Not production data and not a
 * public Product. Learner grouping (#343) must show two levels and one
 * «Доплата».
 */
export const COURSE_ACCESS_LEVELS_TEST_BASE_PRICE = 3333;

export const COURSE_ACCESS_LEVELS_TEST_L1_TITLE = "Работа с собой";
export const COURSE_ACCESS_LEVELS_TEST_L1_DESCRIPTION = "Базовый контур";
export const COURSE_ACCESS_LEVELS_TEST_L2_TITLE = "Работа с другими людьми";
export const COURSE_ACCESS_LEVELS_TEST_L2_DESCRIPTION =
  "Как выстраивать контакт";
export const COURSE_ACCESS_LEVELS_TEST_L2_UPGRADE_PRICE = 2222;
export const COURSE_ACCESS_LEVELS_TEST_L3_TITLE = "Третий уровень";
export const COURSE_ACCESS_LEVELS_TEST_L3_DESCRIPTION = "Расширенный контур";
export const COURSE_ACCESS_LEVELS_TEST_L3_UPGRADE_PRICE = 1500;

export const COURSE_ACCESS_LEVELS_TEST_L1_LESSON_TITLES = [
  "Материал 1.1",
  "Материал 1.2",
  "Материал 1.3",
] as const;

export const COURSE_ACCESS_LEVELS_TEST_L2_LESSON_TITLES = [
  "Материал 2.1",
  "Материал 2.2",
  "Материал 2.3",
] as const;

export function createCourseAccessLevelsThreeLevelTestCatalog(
  practiceId = "course-1",
) {
  const two = createCourseAccessLevelsTestCatalog(practiceId);
  const now = "2026-09-06T12:00:00.000Z";

  return {
    ...two,
    access_levels: [
      ...two.access_levels,
      {
        id: "level-3",
        practice_id: practiceId,
        level: 3,
        title: COURSE_ACCESS_LEVELS_TEST_L3_TITLE,
        description: COURSE_ACCESS_LEVELS_TEST_L3_DESCRIPTION,
        upgrade_price: COURSE_ACCESS_LEVELS_TEST_L3_UPGRADE_PRICE,
        currency: "RUB",
        created_at: now,
        updated_at: now,
      },
    ],
  };
}

export function createCourseAccessLevelsTestCatalog(practiceId = "course-1") {
  const now = "2026-09-06T12:00:00.000Z";

  return {
    basePrice: COURSE_ACCESS_LEVELS_TEST_BASE_PRICE,
    access_levels: [
      {
        id: "level-1",
        practice_id: practiceId,
        level: 1,
        title: COURSE_ACCESS_LEVELS_TEST_L1_TITLE,
        description: COURSE_ACCESS_LEVELS_TEST_L1_DESCRIPTION,
        upgrade_price: null,
        currency: "RUB",
        created_at: now,
        updated_at: now,
      },
      {
        id: "level-2",
        practice_id: practiceId,
        level: 2,
        title: COURSE_ACCESS_LEVELS_TEST_L2_TITLE,
        description: COURSE_ACCESS_LEVELS_TEST_L2_DESCRIPTION,
        upgrade_price: COURSE_ACCESS_LEVELS_TEST_L2_UPGRADE_PRICE,
        currency: "RUB",
        created_at: now,
        updated_at: now,
      },
    ],
    lessons: [
      ...COURSE_ACCESS_LEVELS_TEST_L1_LESSON_TITLES.map((title, index) => ({
        id: `l1-${index + 1}`,
        publication_id: practiceId,
        title,
        position: index,
        required_access_level: 1,
        created_at: now,
        updated_at: now,
        blocks: [
          {
            id: `l1-${index + 1}-text`,
            lesson_id: `l1-${index + 1}`,
            type: "text" as const,
            position: 0,
            asset_id: null,
            payload: { text: `L1 body ${index + 1}` },
            created_at: now,
            updated_at: now,
            audio: null,
            file: null,
          },
        ],
      })),
      ...COURSE_ACCESS_LEVELS_TEST_L2_LESSON_TITLES.map((title, index) => ({
        id: `l2-${index + 1}`,
        publication_id: practiceId,
        title,
        position: index + 3,
        required_access_level: 2,
        created_at: now,
        updated_at: now,
        blocks: [
          {
            id: `l2-${index + 1}-text`,
            lesson_id: `l2-${index + 1}`,
            type: "text" as const,
            position: 0,
            asset_id: null,
            payload: { text: `L2 body ${index + 1}` },
            created_at: now,
            updated_at: now,
            audio: null,
            file: null,
          },
        ],
      })),
    ],
  };
}
