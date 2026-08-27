import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath: string) {
  return readFileSync(join(repoRoot, relativePath), "utf8");
}

const mobile = read(
  "src/components/products/practice-page/PracticePageMobile.tsx",
);
const desktop = read(
  "src/components/products/practice-page/PracticePageDesktop.tsx",
);
const hero = read(
  "src/components/products/practice-page/PracticeProductHero.tsx",
);
const parts = read(
  "src/components/products/practice-page/PracticePageParts.tsx",
);
const audioPost = read("src/components/products/audio-post/AudioPostPage.tsx");
const page = read(
  "src/app/(platform)/(listener)/practice/[...segments]/page.tsx",
);

function testPracticeHasNoClaimCta() {
  for (const [name, source] of [
    ["mobile", mobile],
    ["desktop", desktop],
    ["audio-post", audioPost],
  ] as const) {
    assert.doesNotMatch(
      source,
      /PracticeLibraryActionSection/,
      `${name} does not render claim section`,
    );
    assert.doesNotMatch(
      source,
      /LibraryAddButton/,
      `${name} does not render LibraryAddButton`,
    );
    assert.doesNotMatch(
      source,
      /Добавить в Аудиотеку/,
      `${name} has no claim label`,
    );
  }
}

function testHeartRemains() {
  assert.match(parts, /CatalogProductHeartButton/);
  assert.match(hero, /toPracticeHeartProduct\(viewModel\)/);
  assert.match(mobile, /PracticeProductHero/);
  assert.match(desktop, /PracticeProductHero/);
  assert.match(page, /listSavedPracticeIds/);
  assert.match(page, /isSaved/);
}

function testBuyRemains() {
  assert.match(parts, /BuyPracticeButton/);
  assert.match(parts, /PracticePrimaryActionSection/);
  assert.match(hero, /PracticePrimaryActionSection/);
  assert.match(mobile, /PracticeProductHero/);
  assert.match(desktop, /PracticeProductHero/);
}

function testPdpDoesNotCallLibraryClaim() {
  for (const [name, source] of [
    ["mobile", mobile],
    ["desktop", desktop],
    ["audio-post", audioPost],
    ["page", page],
    ["parts-primary", parts],
  ] as const) {
    assert.doesNotMatch(
      source,
      /\/api\/library\/claim/,
      `${name} does not POST /api/library/claim`,
    );
  }

  const button = read("src/components/LibraryAddButton.tsx");
  const membership = read("src/lib/library/use-library-membership.ts");
  assert.match(button, /useLibraryMembership/);
  assert.match(membership, /\/api\/library\/claim/);
}

function testClaimInfrastructureKept() {
  assert.match(
    parts,
    /function PracticeLibraryActionSection[\s\S]*LibraryAddButton/,
  );
  assert.match(read("src/components/LibraryAddButton.tsx"), /export default function LibraryAddButton/);
  assert.match(
    read("src/lib/library/use-library-membership.ts"),
    /useLibraryMembership/,
  );
}

testPracticeHasNoClaimCta();
testHeartRemains();
testBuyRemains();
testPdpDoesNotCallLibraryClaim();
testClaimInfrastructureKept();

console.log("pdp-single-save-unit: ok");
