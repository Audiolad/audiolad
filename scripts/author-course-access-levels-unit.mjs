#!/usr/bin/env node
/**
 * Phase 3 author course access-level editor: shared rules, sale safety,
 * readiness, security contracts. No live database.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  ACCESS_LEVELS_BOOTSTRAP_REQUIRED_CODE,
  ACCESS_LEVELS_ALREADY_CONFIGURED_CODE,
  CANNOT_DELETE_LEVEL_1_CODE,
  CANNOT_DELETE_NON_HIGHEST_LEVEL_CODE,
  COURSE_ACCESS_LEVELS_ADD_NEXT_LABEL,
  COURSE_ACCESS_LEVELS_ADD_SECOND_LABEL,
  COURSE_ACCESS_LEVELS_LEGACY_COPY,
  COURSE_ACCESS_LEVELS_SECTION_TITLE,
  COURSE_PUBLISH_LESSON_LEVEL_NOT_IN_CATALOG_CODE,
  COURSE_PUBLISH_MISSING_ACCESS_LEVEL_1_CODE,
  COURSE_PUBLISH_PAID_LEVEL_MISSING_LESSONS_CODE,
  LEVEL_HAS_ENTITLEMENTS_CODE,
  LEVEL_HAS_LESSONS_CODE,
  LESSON_LEVEL_NOT_CONFIGURED_CODE,
  LESSON_LEVEL_RAISE_LOCKED_CODE,
  areAccessLevelsContiguous,
  evaluateAccessLevelDelete,
  evaluateCourseAccessLevelsReadiness,
  evaluateLessonLevelChange,
  isConfiguredAccessLevel,
  nextAccessLevel,
  parseAppendAccessLevelInput,
  parseBootstrapAccessLevelsInput,
} from "../src/lib/author-products/course-access-levels-shared.ts";
import {
  appendCourseAccessLevel,
  assertLessonRequiredLevelAssignable,
  assertLessonRequiredLevelChangeAllowed,
  createInitialCourseAccessLevels,
  deleteCourseAccessLevel,
} from "../src/lib/author-products/course-access-levels.ts";
import {
  evaluateCoursePublishContentGate,
  evaluateCourseLessonsReadiness,
} from "../src/lib/author-products/course-builder-shared.ts";

function isBuilderError(error, code) {
  return Boolean(error && error.code === code);
}
import { evaluatePublishReadiness } from "../src/lib/author-products/publish.ts";
import { evaluateDatabaseModerationReady } from "../src/lib/author-products/database-moderation-ready.ts";
import { createCourseAccessLevelsTestCatalog } from "../src/lib/author-products/course-access-levels-fixture.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

function coursePractice(overrides = {}) {
  return {
    id: "course-1",
    author_id: "author-1",
    title: "Курс",
    slug: "kurs",
    subtitle: null,
    description: "Описание курса.",
    format: "Курс",
    product_kind: "practice",
    publication_class: "course",
    music_usage_permission: null,
    duration_minutes: 10,
    price: 3333,
    is_free: false,
    is_catalog_listed: true,
    cover_url: "https://cdn.example/cover.jpg",
    use_shared_cover: true,
    audio_url: null,
    status: "draft",
    moderation_status: "not_submitted",
    moderation_attempt: 0,
    moderation_submitted_at: null,
    moderation_review_comment: null,
    deleted_at: null,
    deleted_by: null,
    deletion_reason: null,
    currency: "RUB",
    published_at: null,
    listening_notice_enabled: false,
    listening_notice_title: "",
    listening_notice_text: "",
    promo_enabled: false,
    promo_title: null,
    promo_text: null,
    promo_button_text: null,
    promo_url: null,
    promo_open_in_new_tab: false,
    created_at: "2026-08-01T10:00:00.000Z",
    updated_at: "2026-08-01T10:00:00.000Z",
    ...overrides,
  };
}

function readyLesson(id, title, level, text) {
  return {
    id,
    title,
    required_access_level: level,
    blocks: [{ type: "text", payload: { text } }],
  };
}

assert.equal(areAccessLevelsContiguous([]), true);
assert.equal(areAccessLevelsContiguous([{ level: 1 }]), true);
assert.equal(areAccessLevelsContiguous([{ level: 1 }, { level: 2 }]), true);
assert.equal(areAccessLevelsContiguous([{ level: 2 }]), false);
assert.equal(areAccessLevelsContiguous([{ level: 1 }, { level: 3 }]), false);
assert.equal(nextAccessLevel([]), 1);
assert.equal(nextAccessLevel([{ level: 1 }, { level: 2 }]), 3);
assert.equal(isConfiguredAccessLevel([], 1), true);
assert.equal(isConfiguredAccessLevel([], 2), false);
assert.equal(isConfiguredAccessLevel([{ level: 1 }, { level: 2 }], 2), true);
assert.equal(isConfiguredAccessLevel([{ level: 1 }, { level: 2 }], 3), false);

const bootstrap = parseBootstrapAccessLevelsInput({
  levels: [
    { title: "Работа с собой", description: "Базовый контур" },
    {
      title: "Работа с другими людьми",
      description: "Как выстраивать контакт",
      upgrade_price: 2222,
    },
  ],
});
assert.equal(bootstrap.ok, true);
if (bootstrap.ok) {
  assert.equal(bootstrap.value.level1.upgrade_price, null);
  assert.equal(bootstrap.value.level2.upgrade_price, 2222);
}

assert.equal(
  parseBootstrapAccessLevelsInput({ title: "Только L1" }).ok,
  false,
);
assert.equal(
  parseBootstrapAccessLevelsInput({
    levels: [{ title: "Только L1" }],
  }).reason,
  ACCESS_LEVELS_BOOTSTRAP_REQUIRED_CODE,
);

const append = parseAppendAccessLevelInput({
  title: "Третий уровень",
  upgrade_price: 1500,
});
assert.equal(append.ok, true);
if (append.ok) {
  assert.equal(append.value.upgrade_price, 1500);
}

assert.equal(
  parseAppendAccessLevelInput({ title: "Без цены" }).ok,
  false,
);

assert.equal(
  evaluateLessonLevelChange({
    currentLevel: 1,
    nextLevel: 2,
    saleLocked: false,
  }).ok,
  true,
  "before sale: raise is free",
);
assert.equal(
  evaluateLessonLevelChange({
    currentLevel: 1,
    nextLevel: 2,
    saleLocked: true,
  }).code,
  LESSON_LEVEL_RAISE_LOCKED_CODE,
  "after sale: raise is forbidden",
);
assert.equal(
  evaluateLessonLevelChange({
    currentLevel: 2,
    nextLevel: 1,
    saleLocked: true,
  }).ok,
  true,
  "after sale: lower is allowed",
);

assert.equal(
  evaluateAccessLevelDelete({
    level: 1,
    maxLevel: 2,
    lessonCountAtLevel: 0,
    entitlementCountAtOrAbove: 0,
  }).code,
  CANNOT_DELETE_LEVEL_1_CODE,
);
assert.equal(
  evaluateAccessLevelDelete({
    level: 2,
    maxLevel: 3,
    lessonCountAtLevel: 0,
    entitlementCountAtOrAbove: 0,
  }).code,
  CANNOT_DELETE_NON_HIGHEST_LEVEL_CODE,
);
assert.equal(
  evaluateAccessLevelDelete({
    level: 2,
    maxLevel: 2,
    lessonCountAtLevel: 1,
    entitlementCountAtOrAbove: 0,
  }).code,
  LEVEL_HAS_LESSONS_CODE,
);
assert.equal(
  evaluateAccessLevelDelete({
    level: 2,
    maxLevel: 2,
    lessonCountAtLevel: 0,
    entitlementCountAtOrAbove: 1,
  }).code,
  LEVEL_HAS_ENTITLEMENTS_CODE,
);
assert.equal(
  evaluateAccessLevelDelete({
    level: 2,
    maxLevel: 2,
    lessonCountAtLevel: 0,
    entitlementCountAtOrAbove: 0,
  }).ok,
  true,
);

assert.equal(
  evaluateCourseAccessLevelsReadiness({ accessLevels: [], lessons: [] }).ok,
  true,
  "legacy empty catalog stays ready on the level axis",
);

const fixture = createCourseAccessLevelsTestCatalog();
assert.equal(fixture.basePrice, 3333);
assert.equal(fixture.access_levels[0].upgrade_price, null);
assert.equal(fixture.access_levels[1].upgrade_price, 2222);
assert.equal(
  fixture.lessons.filter((lesson) => lesson.required_access_level === 1).length,
  3,
);
assert.equal(
  fixture.lessons.filter((lesson) => lesson.required_access_level === 2).length,
  3,
);

assert.equal(
  evaluateCourseAccessLevelsReadiness({
    accessLevels: fixture.access_levels,
    lessons: fixture.lessons,
  }).ok,
  true,
);

assert.equal(
  evaluateCourseAccessLevelsReadiness({
    accessLevels: fixture.access_levels.filter((row) => row.level === 2),
    lessons: fixture.lessons,
  }).code,
  COURSE_PUBLISH_MISSING_ACCESS_LEVEL_1_CODE,
);

assert.equal(
  evaluateCourseAccessLevelsReadiness({
    accessLevels: fixture.access_levels,
    lessons: fixture.lessons.filter((lesson) => lesson.required_access_level === 1),
  }).code,
  COURSE_PUBLISH_PAID_LEVEL_MISSING_LESSONS_CODE,
);

assert.equal(
  evaluateCourseAccessLevelsReadiness({
    accessLevels: fixture.access_levels,
    lessons: [
      ...fixture.lessons,
      { required_access_level: 9 },
    ],
  }).code,
  COURSE_PUBLISH_LESSON_LEVEL_NOT_IN_CATALOG_CODE,
);

assert.equal(
  evaluateCoursePublishContentGate({
    publicationClass: "course",
    productKind: "practice",
    lessons: fixture.lessons,
    accessLevels: fixture.access_levels,
  }).ok,
  true,
);

assert.equal(
  evaluateCoursePublishContentGate({
    publicationClass: "course",
    productKind: "practice",
    lessons: [readyLesson("legacy", "Урок 1", 1, "Текст")],
    accessLevels: [],
  }).ok,
  true,
  "single-level readiness is unchanged",
);

assert.equal(
  evaluateCourseLessonsReadiness([readyLesson("legacy", "Урок 1", 1, "Текст")])
    .ok,
  true,
);

const publishReady = evaluatePublishReadiness(coursePractice(), [], {
  activeTopicCount: 1,
  courseContent: {
    lessonCount: fixture.lessons.length,
    blockCount: fixture.lessons.length,
    lessons: fixture.lessons,
    access_levels: fixture.access_levels,
  },
});
assert.equal(publishReady.ok, true);

const publishMissingL2 = evaluatePublishReadiness(coursePractice(), [], {
  activeTopicCount: 1,
  courseContent: {
    lessonCount: 3,
    blockCount: 3,
    lessons: fixture.lessons.filter((lesson) => lesson.required_access_level === 1),
    access_levels: fixture.access_levels,
  },
});
assert.equal(publishMissingL2.ok, false);
assert.equal(
  publishMissingL2.firstFailure?.code,
  COURSE_PUBLISH_PAID_LEVEL_MISSING_LESSONS_CODE,
);

const dbReady = evaluateDatabaseModerationReady({
  practice: coursePractice(),
  audioItems: [],
  accessStatus: "approved",
  activeTopicCount: 1,
  courseContent: {
    lessonCount: fixture.lessons.length,
    blockCount: fixture.lessons.length,
    lessons: fixture.lessons,
    access_levels: fixture.access_levels,
  },
});
assert.equal(dbReady.ok, true);

function createCatalogClient(initialRows = []) {
  const rows = [...initialRows];
  const lessons = [];
  const entitlements = [];
  let lastInsert = [];

  function matches(row, filters) {
    return filters.every((filter) => filter(row));
  }

  function tableApi(table) {
    const filters = [];
    let countHead = false;
    let pending = null;
    const api = {
      select(_columns, options) {
        countHead = options?.head === true;
        return api;
      },
      eq(column, value) {
        filters.push((row) => row[column] === value);
        return api;
      },
      gte(column, value) {
        filters.push((row) => row[column] >= value);
        return api;
      },
      order() {
        return api;
      },
      insert(payload) {
        pending = () => {
          const items = Array.isArray(payload) ? payload : [payload];
          lastInsert = items.map((item, index) => ({
            id: `new-${rows.length + index + 1}`,
            currency: "RUB",
            created_at: "2026-09-06T12:00:00.000Z",
            updated_at: "2026-09-06T12:00:00.000Z",
            ...item,
          }));
          rows.push(...lastInsert);
        };
        return api;
      },
      update(payload) {
        pending = () => {
          for (const row of rows) {
            if (matches(row, filters)) {
              Object.assign(row, payload);
            }
          }
        };
        return api;
      },
      delete() {
        pending = () => {
          for (let index = rows.length - 1; index >= 0; index -= 1) {
            if (table === "practice_access_levels" && matches(rows[index], filters)) {
              rows.splice(index, 1);
            }
          }
        };
        return api;
      },
      single() {
        pending?.();
        pending = null;
        return Promise.resolve({ data: lastInsert[0] ?? null, error: null });
      },
      maybeSingle() {
        pending?.();
        pending = null;
        const source =
          table === "practice_access_levels"
            ? rows
            : table === "course_lessons"
              ? lessons
              : entitlements;
        return Promise.resolve({
          data: source.find((row) => matches(row, filters)) ?? null,
          error: null,
        });
      },
      then(onFulfilled, onRejected) {
        pending?.();
        pending = null;
        const source =
          table === "practice_access_levels"
            ? rows
            : table === "course_lessons"
              ? lessons
              : entitlements;
        const data = source.filter((row) => matches(row, filters));
        if (countHead) {
          return Promise.resolve({
            data: null,
            count: data.length,
            error: null,
          }).then(onFulfilled, onRejected);
        }
        return Promise.resolve({
          data: table === "practice_access_levels" ? data.sort((a, b) => a.level - b.level) : data,
          count: data.length,
          error: null,
        }).then(onFulfilled, onRejected);
      },
    };
    return api;
  }

  return {
    rows,
    lessons,
    entitlements,
    from(table) {
      return tableApi(table);
    },
  };
}

const emptyCatalog = createCatalogClient();
const created = await createInitialCourseAccessLevels(emptyCatalog, "course-1", {
  level1: {
    title: "Работа с собой",
    description: null,
    upgrade_price: null,
  },
  level2: {
    title: "Работа с другими людьми",
    description: "Как выстраивать контакт",
    upgrade_price: 2222,
  },
});
assert.equal(created.length, 2);
assert.equal(created[0].level, 1);
assert.equal(created[0].upgrade_price, null);
assert.equal(created[1].level, 2);
assert.equal(emptyCatalog.rows.length, 2);

await assert.rejects(
  () =>
    createInitialCourseAccessLevels(emptyCatalog, "course-1", {
      level1: { title: "A", description: null, upgrade_price: null },
      level2: { title: "B", description: null, upgrade_price: 1 },
    }),
  (error) => isBuilderError(error, ACCESS_LEVELS_ALREADY_CONFIGURED_CODE),
);

const l3 = await appendCourseAccessLevel(emptyCatalog, "course-1", {
  title: "Третий уровень",
  description: null,
  upgrade_price: 900,
});
assert.equal(l3.level, 3);
assert.equal(emptyCatalog.rows.length, 3);

const emptyForAppend = createCatalogClient();
await assert.rejects(
  () =>
    appendCourseAccessLevel(emptyForAppend, "course-1", {
      title: "Слишком рано",
      description: null,
      upgrade_price: 100,
    }),
  (error) => isBuilderError(error, ACCESS_LEVELS_BOOTSTRAP_REQUIRED_CODE),
);

emptyCatalog.lessons.push({
  id: "lesson-l3",
  publication_id: "course-1",
  required_access_level: 3,
});
await assert.rejects(
  () => deleteCourseAccessLevel(emptyCatalog, "course-1", 3),
  (error) => isBuilderError(error, LEVEL_HAS_LESSONS_CODE),
);
emptyCatalog.lessons.length = 0;
emptyCatalog.entitlements.push({
  id: "up-1",
  practice_id: "course-1",
  access_level: 3,
});
await assert.rejects(
  () => deleteCourseAccessLevel(emptyCatalog, "course-1", 3),
  (error) => isBuilderError(error, LEVEL_HAS_ENTITLEMENTS_CODE),
);
emptyCatalog.entitlements.length = 0;
await deleteCourseAccessLevel(emptyCatalog, "course-1", 3);
assert.equal(emptyCatalog.rows.some((row) => row.level === 3), false);

await assert.rejects(
  () =>
    assertLessonRequiredLevelAssignable({
      accessLevels: fixture.access_levels,
      requiredAccessLevel: 999,
    }),
  (error) => isBuilderError(error, LESSON_LEVEL_NOT_CONFIGURED_CODE),
);
await assertLessonRequiredLevelAssignable({
  accessLevels: [],
  requiredAccessLevel: 1,
});

const unlockedSale = createCatalogClient();
await assertLessonRequiredLevelChangeAllowed({
  service: unlockedSale,
  practiceId: "course-1",
  currentLevel: 1,
  nextLevel: 2,
});

const soldCatalog = createCatalogClient();
soldCatalog.entitlements.push({
  id: "buyer-1",
  practice_id: "course-1",
  access_level: 1,
});
await assert.rejects(
  () =>
    assertLessonRequiredLevelChangeAllowed({
      service: soldCatalog,
      practiceId: "course-1",
      currentLevel: 1,
      nextLevel: 2,
    }),
  (error) => isBuilderError(error, LESSON_LEVEL_RAISE_LOCKED_CODE),
);
await assertLessonRequiredLevelChangeAllowed({
  service: soldCatalog,
  practiceId: "course-1",
  currentLevel: 2,
  nextLevel: 1,
});
await assertLessonRequiredLevelAssignable({
  accessLevels: fixture.access_levels,
  requiredAccessLevel: 2,
});

const builder = read("src/components/author-dashboard/AuthorCourseBuilder.tsx");
assert.match(builder, /AuthorCourseAccessLevels/);
assert.match(builder, /requiredAccessLevel/);
assert.doesNotMatch(builder, /publication_class !== "course"/);
assert.doesNotMatch(builder, /Код женской притягательности/);

const levelsUi = read(
  "src/components/author-dashboard/AuthorCourseAccessLevels.tsx",
);
assert.match(levelsUi, /data-author-course-access-levels/);
assert.match(levelsUi, /COURSE_ACCESS_LEVELS_SECTION_TITLE/);
assert.match(levelsUi, /COURSE_ACCESS_LEVELS_LEGACY_COPY/);
assert.match(levelsUi, /COURSE_ACCESS_LEVELS_ADD_SECOND_LABEL/);
assert.match(levelsUi, /COURSE_ACCESS_LEVELS_ADD_NEXT_LABEL/);
assert.match(levelsUi, /COURSE_ACCESS_LEVELS_BASE_PRICE_LABEL/);
assert.equal(COURSE_ACCESS_LEVELS_SECTION_TITLE, "Уровни доступа");
assert.equal(
  COURSE_ACCESS_LEVELS_LEGACY_COPY,
  "По умолчанию весь аудиокурс доступен после одной покупки.",
);
assert.equal(COURSE_ACCESS_LEVELS_ADD_SECOND_LABEL, "Добавить второй уровень");
assert.equal(COURSE_ACCESS_LEVELS_ADD_NEXT_LABEL, "Добавить следующий уровень");
assert.doesNotMatch(levelsUi, /practices\.price/);
assert.doesNotMatch(levelsUi, /checkout|tochka|order_kind/i);

const form = read("src/components/author-dashboard/AuthorProductForm.tsx");
assert.match(form, /basePrice=\{form\.price\}/);
assert.match(form, /accessLevels: courseContentSnapshot\.access_levels/);

const shared = read("src/lib/author-products/course-builder-shared.ts");
assert.match(shared, /required_access_level: number/);
assert.match(shared, /access_levels: CourseBuilderAccessLevelDto/);
assert.match(shared, /evaluateCourseAccessLevelsReadiness/);

const server = read("src/lib/author-products/course-builder.ts");
assert.match(
  server,
  /id, publication_id, title, position, required_access_level, created_at, updated_at/,
);
assert.match(server, /required_access_level: required/);
assert.match(server, /assertLessonRequiredLevelChangeAllowed/);
assert.doesNotMatch(server, /order_kind|target_access_level/);

const accessRoute = read(
  "src/app/api/author/products/[id]/course/access-levels/route.ts",
);
const accessLevelRoute = read(
  "src/app/api/author/products/[id]/course/access-levels/[level]/route.ts",
);
const lessonRoute = read(
  "src/app/api/author/products/[id]/course/lessons/route.ts",
);
const lessonIdRoute = read(
  "src/app/api/author/products/[id]/course/lessons/[lessonId]/route.ts",
);

for (const source of [accessRoute, accessLevelRoute]) {
  assert.match(source, /requireCourseBuilderMutationAccess|requireCourseBuilderReadAccess/);
  assert.match(source, /createServiceRoleClient/);
  assert.doesNotMatch(source, /NEXT_PUBLIC_SUPABASE_SERVICE/);
  assert.doesNotMatch(source, /service_role_key/);
}

assert.match(accessRoute, /createInitialCourseAccessLevels/);
assert.match(accessRoute, /appendCourseAccessLevel/);
assert.match(accessLevelRoute, /updateCourseAccessLevel/);
assert.match(accessLevelRoute, /deleteCourseAccessLevel/);
assert.match(lessonRoute, /requiredAccessLevel/);
assert.match(lessonIdRoute, /requiredAccessLevel/);

const migration = read(
  "supabase/migrations/20260923120100_course_access_levels_foundation.sql",
);
assert.match(
  migration,
  /authenticated must not INSERT practice_access_levels/,
);
assert.match(
  migration,
  /authenticated must not UPDATE practice_access_levels/,
);
assert.doesNotMatch(
  migration,
  /CREATE POLICY[\s\S]*practice_access_levels[\s\S]*INSERT/,
);
assert.doesNotMatch(accessRoute, /createPolicy|ENABLE ROW LEVEL SECURITY/);
assert.doesNotMatch(accessLevelRoute, /GRANT INSERT ON TABLE public\.practice_access_levels TO authenticated/);

assert.equal(
  existsSync(
    join(root, "src/app/api/author/products/[id]/course/access-levels/route.ts"),
  ),
  true,
);
assert.doesNotMatch(read("src/lib/payments/fulfill-payment.ts"), /target_access_level/);
assert.doesNotMatch(
  read("src/lib/author-products/course-access-levels.ts"),
  /from\("practice_access_levels"\)[\s\S]{0,80}supabase\.(from|auth)/,
);

const accessTs = read("src/lib/author-products/course-access-levels.ts");
assert.match(accessTs, /createInitialCourseAccessLevels/);
assert.match(accessTs, /insert\(\[/);
assert.match(accessTs, /getPracticeSaleLock/);
assert.doesNotMatch(accessTs, /from\("practices"\)/);
assert.doesNotMatch(accessTs, /window\.|localStorage/);

console.log("author-course-access-levels-unit: ok");
