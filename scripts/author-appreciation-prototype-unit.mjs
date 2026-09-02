#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath) {
  return readFileSync(path.join(root, relativePath), "utf8");
}

const prototype = read(
  "src/components/author-appreciation/AuthorAppreciationPrototype.tsx",
);
assert.ok(prototype.includes("🙏 Поблагодарить автора ❤️"));
assert.ok(prototype.includes("Благодарность возвращается изобилием"));
assert.ok(prototype.includes('surface: "author" | "product"'));
assert.ok(prototype.includes('role="dialog"'));
assert.ok(prototype.includes('aria-modal="true"'));
assert.ok(prototype.includes("items-end"));
assert.ok(prototype.includes("sm:items-center"));
assert.ok(prototype.includes("env(safe-area-inset-bottom)"));
assert.ok(prototype.includes('!isAuthenticated ? ('));
assert.ok(prototype.includes("Email для получения чека"));
assert.ok(prototype.includes("100, 300, 500, 1000"));
assert.ok(prototype.includes("Своя сумма"));
assert.ok(prototype.includes("Поблагодарить на {resolveAmountLabel(selectedAmount)}"));
assert.ok(prototype.includes("Вы перейдёте на защищённую страницу оплаты."));
assert.ok(!prototype.includes("GetCourse"));
assert.ok(prototype.includes('fetch("/api/author-appreciation/checkout"'));
assert.ok(prototype.includes("idempotency-key"));
assert.ok(!prototype.includes("—"), "use en-dash, not em-dash");

const authorPage = read(
  "src/app/(platform)/(listener)/authors/[slug]/page.tsx",
);
assert.ok(authorPage.includes('author_appreciation_preview?: string'));
assert.ok(authorPage.includes("resolveAuthorAppreciationVisibility"));
assert.ok(
  authorPage.indexOf("<AuthorAppreciationPrototype") <
    authorPage.indexOf("<AuthorFeaturedSection"),
  "author block must follow the public header and precede featured products",
);

const practicePage = read(
  "src/app/(platform)/(listener)/practice/[...segments]/page.tsx",
);
assert.ok(practicePage.includes('author_appreciation_preview?: string'));
assert.ok(practicePage.includes("resolveAuthorAppreciationVisibility"));

const practiceContent = read(
  "src/components/products/practice-page/PracticePageContent.tsx",
);
assert.ok(
  practiceContent.indexOf("<AuthorAppreciationPrototype") <
    practiceContent.indexOf("<ProductTopicLinks"),
  "product block must follow hero and precede topics",
);

const audioPost = read("src/components/products/audio-post/AudioPostPage.tsx");
assert.equal(
  (audioPost.match(/<AuthorAppreciationPrototype/g) ?? []).length,
  2,
  "audio post needs mobile and desktop placements",
);

console.log("author-appreciation-prototype-unit: ok");
