/**
 * Shared A–H fixtures for course access-level moderation readiness.
 * Used by TS evaluators and isolated SQL assert_practice_moderation_ready.
 * Never a production seed.
 */

export const ACCESS_LEVEL_READINESS_CASES = [
  {
    id: "A",
    label: "legacy empty catalog",
    accessLevels: [],
    lessonLevels: [1],
    expected: { ok: true, code: null },
  },
  {
    id: "B",
    label: "valid L1+L2",
    accessLevels: [
      { level: 1, upgrade_price: null },
      { level: 2, upgrade_price: 2222 },
    ],
    lessonLevels: [1, 2],
    expected: { ok: true, code: null },
  },
  {
    id: "C",
    label: "missing L1",
    accessLevels: [{ level: 2, upgrade_price: 2222 }],
    lessonLevels: [2],
    expected: { ok: false, code: "missing_access_level_1" },
  },
  {
    id: "D",
    label: "gap 1,3",
    accessLevels: [
      { level: 1, upgrade_price: null },
      { level: 3, upgrade_price: 1500 },
    ],
    lessonLevels: [1, 3],
    expected: { ok: false, code: "access_levels_not_contiguous" },
  },
  {
    id: "E",
    label: "L1 upgrade not null",
    accessLevels: [
      { level: 1, upgrade_price: 100 },
      { level: 2, upgrade_price: 2222 },
    ],
    lessonLevels: [1, 2],
    expected: { ok: false, code: "invalid_level_1_upgrade_price" },
  },
  {
    id: "F1",
    label: "L2 upgrade null",
    accessLevels: [
      { level: 1, upgrade_price: null },
      { level: 2, upgrade_price: null },
    ],
    lessonLevels: [1, 2],
    expected: { ok: false, code: "invalid_paid_upgrade_price" },
  },
  {
    id: "F2",
    label: "L2 upgrade 0",
    accessLevels: [
      { level: 1, upgrade_price: null },
      { level: 2, upgrade_price: 0 },
    ],
    lessonLevels: [1, 2],
    expected: { ok: false, code: "invalid_paid_upgrade_price" },
  },
  {
    id: "G",
    label: "lesson level 3 with catalog 1,2",
    accessLevels: [
      { level: 1, upgrade_price: null },
      { level: 2, upgrade_price: 2222 },
    ],
    lessonLevels: [1, 2, 3],
    expected: { ok: false, code: "lesson_level_not_in_catalog" },
  },
  {
    id: "H",
    label: "L2 has no lessons",
    accessLevels: [
      { level: 1, upgrade_price: null },
      { level: 2, upgrade_price: 2222 },
    ],
    lessonLevels: [1],
    expected: { ok: false, code: "paid_level_missing_lessons" },
  },
];
