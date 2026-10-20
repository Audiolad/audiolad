import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";

import * as schoolStart from "../src/lib/school/start";
import { SCHOOL_FAQ_ITEMS } from "../src/lib/school/faq";
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

function readComponent(name: string): string {
  return readFileSync(
    new URL(`../src/components/school/${name}.tsx`, import.meta.url),
    "utf8",
  );
}

const firstScreen = readComponent("SchoolFirstScreen");
const streamParagraph = firstScreen.match(
  /<p\s+className\s*=\s*"school-first-screen__stream"\s*>\s*\{\s*SCHOOL_STREAM_LABEL\s*\}\s*<\/p\s*>/,
);
const title = firstScreen.match(
  /<h1\s+className\s*=\s*"school-first-screen__title"\s*>\s*Школа\s+Аудиопрактик\s*<\/h1\s*>/,
);
assert.ok(streamParagraph, "First screen must render the stream paragraph");
assert.ok(title, "First screen must retain the school h1");
assert.ok(
  streamParagraph.index! < title.index!,
  "First screen stream paragraph must precede the h1",
);
assert.match(firstScreen, /\{\s*SCHOOL_START_LABEL\s*\}/);

const tariffsScreen = readComponent("SchoolTariffsScreen");
assert.match(
  tariffsScreen,
  /<div\s+className\s*=\s*"school-tariffs__schedule"[^>]*>\s*<p\s+className\s*=\s*"school-tariffs__schedule-stream"\s*>\s*\{\s*SCHOOL_STREAM_LABEL\s*\}\s*·\s*(?:<span\b[^>]*>\s*)?\{\s*SCHOOL_START_LABEL\s*\}\s*(?:<\/span\s*>\s*)?<\/p\s*>\s*<div\s+className\s*=\s*"school-tariffs__schedule-item"\s*>/,
  "Tariffs must render stream and start inside the schedule before its first item",
);
assert.match(tariffsScreen, /\{\s*SCHOOL_INTENSIVE_SCHEDULE_LINE\s*\}/);
assert.match(tariffsScreen, /\{\s*SCHOOL_MENTORING_PERIOD\s*\}/);

const finalStart = readComponent("SchoolFinalScreen").match(
  /<p\s+className\s*=\s*"school-final__start"\s*>([\s\S]*?)<\/p\s*>/,
);
assert.ok(finalStart, "Final screen must render the start paragraph");
assert.match(
  finalStart[1],
  /\{\s*SCHOOL_STREAM_LABEL\s*\}\s*·[\s\S]*?Старт\s+–[\s\S]*?\{\s*SCHOOL_START_DAY\s*\}[\s\S]*?\{\s*SCHOOL_START_MONTH\s*\}[\s\S]*?\{\s*SCHOOL_START_YEAR\s*\}/,
  "Final start paragraph must render the stream and full start date",
);

const faqAccordion = readComponent("SchoolFaqAccordion");
assert.match(faqAccordion, /Старт\s+второго\s+потока\s+–/);
assert.doesNotMatch(faqAccordion, /первого\s+потока/i);
const startDateFaq = SCHOOL_FAQ_ITEMS.find((item) => item.id === "start-date");
assert.ok(startDateFaq, "Start-date FAQ item must exist");
assert.deepEqual(startDateFaq.answer, [schoolStart.SCHOOL_START_FAQ_ANSWER]);
assert.match(
  readFileSync(new URL("../src/lib/school/faq.ts", import.meta.url), "utf8"),
  /\{\s*id\s*:\s*"start-date"\s*,[^{}]*?answer\s*:\s*\[\s*SCHOOL_START_FAQ_ANSWER\s*,?\s*\]/,
  "Start-date FAQ must use the shared answer constant",
);

for (const [directory, extension] of [
  ["../src/components/school/", ".tsx"],
  ["../src/lib/school/", ".ts"],
]) {
  const directoryUrl = new URL(directory, import.meta.url);
  for (const name of readdirSync(directoryUrl)) {
    if (!name.endsWith(extension)) continue;
    assert.doesNotMatch(
      readFileSync(new URL(name, directoryUrl), "utf8"),
      /октября|2026-10-29|2026-11-30/i,
      `${directory}${name} must not contain outdated school dates`,
    );
  }
}

console.log("school-start-dates-unit: ok");
