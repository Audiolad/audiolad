import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

class FakeClassList {
  items = new Set<string>();
  add(name: string) {
    this.items.add(name);
  }
  remove(name: string) {
    this.items.delete(name);
  }
  contains(name: string) {
    return this.items.has(name);
  }
}

const html = {
  classList: new FakeClassList(),
  style: { overflow: "" },
  className: "",
};
const body = {
  classList: new FakeClassList(),
  style: { overflow: "" },
  className: "",
};

Object.defineProperty(globalThis, "document", {
  configurable: true,
  value: {
    documentElement: html,
    body,
  },
});

const {
  SHEET_SCROLL_LOCK_CLASS,
  acquireSheetScrollLock,
  getSheetScrollLockCount,
  releaseSheetScrollLock,
  resetSheetScrollLockForTests,
} = await import("../src/lib/listener/sheet-scroll-lock");

resetSheetScrollLockForTests();
assert.equal(getSheetScrollLockCount(), 0);
assert.equal(html.classList.contains(SHEET_SCROLL_LOCK_CLASS), false);

acquireSheetScrollLock("catalog-filters");
assert.equal(getSheetScrollLockCount(), 1);
assert.equal(html.classList.contains(SHEET_SCROLL_LOCK_CLASS), true);

acquireSheetScrollLock("library-filters");
assert.equal(getSheetScrollLockCount(), 2);
assert.equal(html.classList.contains(SHEET_SCROLL_LOCK_CLASS), true);

releaseSheetScrollLock("catalog-filters");
assert.equal(getSheetScrollLockCount(), 1);
assert.equal(
  html.classList.contains(SHEET_SCROLL_LOCK_CLASS),
  true,
  "releasing one sheet must not unlock the other",
);

releaseSheetScrollLock("library-filters");
assert.equal(getSheetScrollLockCount(), 0);
assert.equal(html.classList.contains(SHEET_SCROLL_LOCK_CLASS), false);

releaseSheetScrollLock("stale");
assert.equal(getSheetScrollLockCount(), 0);
assert.equal(html.classList.contains(SHEET_SCROLL_LOCK_CLASS), false);

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const lockSource = readFileSync(
  join(repoRoot, "src/lib/listener/sheet-scroll-lock.ts"),
  "utf8",
);
const globals = readFileSync(join(repoRoot, "src/app/globals.css"), "utf8");
assert.match(lockSource, /SHEET_SCROLL_LOCK_CLASS = "catalog-sheet-lock"/);
assert.doesNotMatch(lockSource, /position:\s*["']fixed["']/);
assert.doesNotMatch(lockSource, /top:\s*-scrollY|top:\s*`-\$\{/);
assert.match(
  globals,
  /html\.catalog-sheet-lock,\s*\nhtml\.catalog-sheet-lock body \{\s*\n\s*overflow:\s*hidden;/,
);

console.log("sheet-scroll-lock-unit: ok");
