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
assert.ok(prototype.includes("❤️ Поблагодарить автора"));
assert.ok(prototype.includes("Благодарность возвращается изобилием 🙏"));
assert.ok(!prototype.includes("🙏 Поблагодарить автора ❤️"));
assert.ok(!prototype.includes("🙏 Поблагодарить автора"));
assert.ok(!prototype.includes("Поблагодарить автора ❤️"));
assert.ok(prototype.includes("FEATURED_CARD_PRIMARY_CTA_CLASS"));
assert.ok(prototype.includes("author-appreciation-cta"));
assert.ok(prototype.includes("author-appreciation-cta__heart"));
assert.ok(
  prototype.indexOf("author-appreciation-cta__heart") <
    prototype.indexOf("APPRECIATION_CTA_LABEL.slice"),
  "heart class must wrap the leading ❤️ before the remaining CTA text",
);
assert.ok(
  prototype.indexOf("author-appreciation-cta__heart") <
    prototype.indexOf("Благодарность возвращается изобилием 🙏"),
);
assert.ok(
  prototype.indexOf("</button>") <
    prototype.indexOf("Благодарность возвращается изобилием 🙏"),
  "caption must stay a separate non-clickable line under the button",
);
assert.ok(
  prototype.indexOf("🙏") > prototype.indexOf("</button>"),
  "folded-hands emoji belongs to the caption, not the CTA button",
);
assert.ok(
  !prototype
    .slice(
      prototype.indexOf("author-appreciation-cta__heart"),
      prototype.indexOf("</button>"),
    )
    .includes("🙏"),
  "caption 🙏 must not be wrapped by the heart pulse class",
);
assert.ok(prototype.includes('surface: "author" | "product"'));
assert.ok(prototype.includes('role="dialog"'));
assert.ok(prototype.includes('aria-modal="true"'));
assert.ok(prototype.includes("items-end"));
assert.ok(prototype.includes("sm:items-center"));
assert.ok(prototype.includes("env(safe-area-inset-bottom)"));
assert.ok(prototype.includes('!isAuthenticated ? ('));
assert.ok(prototype.includes("Email для получения чека"));
assert.ok(prototype.includes("100, 300, 500, 1000"));
assert.ok(prototype.includes("parseAppreciationAmount"));
assert.ok(prototype.includes('useState("500")'));
assert.ok(prototype.includes("setAmountInput(String(quickAmount))"));
assert.ok(prototype.includes("selectedAmount === quickAmount"));
assert.ok(prototype.includes("Сумма"));
assert.ok(!prototype.includes("Своя сумма"));
assert.ok(prototype.includes("Поблагодарить на {resolveAmountLabel(selectedAmount)}"));
assert.ok(prototype.includes("amount_minor: selectedAmount * 100"));
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

const globalsCss = read("src/app/globals.css");
assert.ok(globalsCss.includes(".author-appreciation-cta"));
assert.ok(globalsCss.includes("author-appreciation-cta-breathe"));
assert.ok(globalsCss.includes("author-appreciation-cta-heart"));
assert.ok(globalsCss.includes("author-appreciation-cta-glow"));
assert.ok(globalsCss.includes("author-appreciation-cta-sheen"));
assert.match(
  globalsCss,
  /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\.author-appreciation-cta,[\s\S]*?animation:\s*none/,
);

console.log("author-appreciation-prototype-unit: ok");
