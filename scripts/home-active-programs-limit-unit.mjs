#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  HOME_ACTIVE_PROGRAMS_LIMIT,
  takeHomeActivePrograms,
} from "../src/lib/home/listening-progress.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath) {
  return readFileSync(path.join(root, relativePath), "utf8");
}

function program(id) {
  return { product: { id } };
}

assert.equal(HOME_ACTIVE_PROGRAMS_LIMIT, 5);

{
  const programs = Array.from({ length: 8 }, (_, index) =>
    program(`recent-${index + 1}`),
  );
  const selected = takeHomeActivePrograms(programs);
  assert.equal(selected.length, 5, "caps at 5 when more than 5 remain");
  assert.deepEqual(
    selected.map((item) => item.product.id),
    ["recent-1", "recent-2", "recent-3", "recent-4", "recent-5"],
    "keeps the first five already-sorted recent programs",
  );
}

{
  const programs = Array.from({ length: 5 }, (_, index) =>
    program(`exact-${index + 1}`),
  );
  assert.equal(takeHomeActivePrograms(programs).length, 5);
}

{
  const programs = Array.from({ length: 3 }, (_, index) =>
    program(`few-${index + 1}`),
  );
  const selected = takeHomeActivePrograms(programs);
  assert.equal(selected.length, 3, "does not pad below 5");
  assert.deepEqual(
    selected.map((item) => item.product.id),
    ["few-1", "few-2", "few-3"],
  );
}

assert.deepEqual(takeHomeActivePrograms([]), []);

{
  const shownIds = new Set(["shown-a", "shown-b"]);
  const programs = [
    program("shown-a"),
    program("keep-1"),
    program("shown-b"),
    program("keep-2"),
    program("keep-3"),
    program("keep-4"),
    program("keep-5"),
    program("keep-6"),
    program("keep-7"),
  ];
  const visible = programs.filter((item) => !shownIds.has(item.product.id));
  const selected = takeHomeActivePrograms(visible);
  assert.equal(selected.length, 5, "fills up to 5 after homepage dedupe");
  assert.deepEqual(
    selected.map((item) => item.product.id),
    ["keep-1", "keep-2", "keep-3", "keep-4", "keep-5"],
  );
}

const dataTs = read("src/lib/home/data.ts");
assert.match(dataTs, /takeHomeActivePrograms/);
assert.match(
  dataTs,
  /activePrograms:\s*takeHomeActivePrograms\(visibleActivePrograms\)/,
  "homepage applies the cap after existing visibleActivePrograms dedupe",
);

const section = read("src/components/home/ActiveProgramsSection.tsx");
assert.match(section, /Ваши программы/);
assert.match(section, /href="\/my-practices"/);
assert.doesNotMatch(
  section,
  /slice\(/,
  "section renders the list it is given and does not apply its own cap",
);

const library = read("src/components/my-practices/MyPracticesLibrary.tsx");
assert.doesNotMatch(
  library,
  /HOME_ACTIVE_PROGRAMS_LIMIT/,
  "library page stays unlimited",
);

console.log("home-active-programs-limit-unit: ok");
