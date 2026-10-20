import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import * as schoolStart from "../src/lib/school/start";
import { buildSchoolLandingJsonLd } from "../src/lib/school/json-ld";

const expected = {
  SCHOOL_START_LABEL: "Старт – 19 ноября 2026 года",
  SCHOOL_INTENSIVE_SCHEDULE_LINE:
    "19–20 ноября 2026 года · 18:00–20:00 по московскому времени",
  SCHOOL_INTENSIVE_STANDARD_FEATURE:
    "Два дня живого онлайн-интенсива – 19 и 20 ноября, с 18:00 до 20:00 по московскому времени",
  SCHOOL_MENTORING_PERIOD: "23 ноября – 20 декабря 2026 года",
  SCHOOL_START_FAQ_ANSWER: "Старт второго потока – 19 ноября 2026 года.",
  SCHOOL_STREAM_LABEL: "Второй поток",
} as const;

for (const key of Object.keys(expected) as (keyof typeof expected)[]) {
  assert.equal(schoolStart[key], expected[key], key);
}

const jsonLd = buildSchoolLandingJsonLd();

function checkStrings(value: unknown): void {
  if (typeof value === "string") {
    assert.doesNotMatch(value, /октября|первого потока|—/i);
  } else if (value && typeof value === "object") {
    for (const child of Object.values(value)) checkStrings(child);
  }
}

checkStrings(schoolStart);
checkStrings(jsonLd);

const graph = jsonLd["@graph"] as Record<string, unknown>[];
const instance = graph.find((node) => node["@type"] === "CourseInstance");
assert.ok(instance, "CourseInstance must exist");
assert.equal(instance.startDate, "2026-11-19");
assert.equal(instance.endDate, "2026-12-20");

for (const name of ["SchoolFirstScreen", "SchoolTariffsScreen", "SchoolFinalScreen"]) {
  const source = readFileSync(
    new URL(`../src/components/school/${name}.tsx`, import.meta.url),
    "utf8",
  );
  assert.match(source, /\bSCHOOL_STREAM_LABEL\b/, name);
}

console.log("school-start-dates-unit: ok");
