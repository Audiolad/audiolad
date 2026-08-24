import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  PENDING_LIBRARY_SAVE_STORAGE_KEY,
  PENDING_LIBRARY_SAVE_TTL_MS,
  clearPendingLibrarySave,
  createMemoryPendingLibrarySaveStorage,
  readPendingLibrarySave,
  resolvePendingLibrarySaveReturnPath,
  writePendingLibrarySave,
} from "../src/lib/library/pending-library-save";
import {
  consumePendingLibrarySave,
  peekCatalogLibrarySaveForTests,
  resetCatalogLibrarySaveSyncForTests,
  resetPendingLibrarySaveConsumeForTests,
  startCatalogLibrarySaveSignIn,
} from "../src/lib/library/use-catalog-library-save";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const PRACTICE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function read(relativePath: string) {
  return readFileSync(join(repoRoot, relativePath), "utf8");
}

function testGuestHeartWritesPendingAndDoesNotPost() {
  const storage = createMemoryPendingLibrarySaveStorage();
  let fetchCount = 0;
  const started = startCatalogLibrarySaveSignIn({
    practiceId: PRACTICE,
    signInReturnPath: "/catalog",
    currentPath: "/practice/anna/morning",
    now: 1_700_000_000_000,
    storage,
  });

  assert.equal(started.href, "/auth/sign-in?next=%2Fpractice%2Fanna%2Fmorning");
  assert.deepEqual(started.pending, {
    practiceId: PRACTICE,
    returnPath: "/practice/anna/morning",
    ts: 1_700_000_000_000,
  });
  assert.equal(
    storage.getItem(PENDING_LIBRARY_SAVE_STORAGE_KEY),
    JSON.stringify(started.pending),
  );
  assert.equal(fetchCount, 0);
}

function testReturnPathPrefersPracticePage() {
  assert.equal(
    resolvePendingLibrarySaveReturnPath("/catalog", "/practice/anna/morning"),
    "/practice/anna/morning",
  );
  assert.equal(
    resolvePendingLibrarySaveReturnPath("/practice/anna/morning", ""),
    "/practice/anna/morning",
  );
  assert.equal(
    resolvePendingLibrarySaveReturnPath("/catalog", "/catalog?topic=sleep"),
    "/catalog?topic=sleep",
  );
}

async function testLoginConsumesPendingOnce() {
  resetCatalogLibrarySaveSyncForTests();
  resetPendingLibrarySaveConsumeForTests();
  const storage = createMemoryPendingLibrarySaveStorage();
  writePendingLibrarySave({
    practiceId: PRACTICE,
    returnPath: "/practice/anna/morning",
    ts: Date.now(),
    storage,
  });

  const fetchCalls: Array<{ method: string; url: string; body: unknown }> = [];
  const fetchImpl = async (url: string, init?: RequestInit) => {
    fetchCalls.push({
      method: String(init?.method),
      url,
      body: JSON.parse(String(init?.body)),
    });
    return {
      status: 201,
      json: async () => ({
        saved: true,
        created: true,
        practiceId: PRACTICE,
      }),
    };
  };

  const first = await consumePendingLibrarySave({
    isAuthenticated: true,
    fetchImpl,
    storage,
  });
  const second = await consumePendingLibrarySave({
    isAuthenticated: true,
    fetchImpl,
    storage,
  });

  assert.equal(first.consumed, true);
  assert.equal(first.posted, true);
  assert.equal(first.practiceId, PRACTICE);
  assert.equal(second.consumed, false);
  assert.equal(second.posted, false);
  assert.equal(fetchCalls.length, 1);
  assert.equal(fetchCalls[0]?.method, "POST");
  assert.equal(fetchCalls[0]?.url, "/api/library/saves");
  assert.deepEqual(fetchCalls[0]?.body, { practiceId: PRACTICE });
  assert.equal(readPendingLibrarySave({ storage }), null);
}

async function testHeartIsActiveAfterConsume() {
  resetCatalogLibrarySaveSyncForTests();
  resetPendingLibrarySaveConsumeForTests();
  const storage = createMemoryPendingLibrarySaveStorage();
  writePendingLibrarySave({
    practiceId: PRACTICE,
    returnPath: "/catalog",
    ts: Date.now(),
    storage,
  });

  const result = await consumePendingLibrarySave({
    isAuthenticated: true,
    storage,
    fetchImpl: async () => ({
      status: 200,
      json: async () => ({
        saved: true,
        created: false,
        practiceId: PRACTICE,
      }),
    }),
  });

  assert.equal(result.consumed, true, JSON.stringify(result));
  assert.equal(peekCatalogLibrarySaveForTests(PRACTICE), true);
}

async function testExpiredPendingIsIgnored() {
  resetCatalogLibrarySaveSyncForTests();
  resetPendingLibrarySaveConsumeForTests();
  const storage = createMemoryPendingLibrarySaveStorage();
  const now = 1_700_000_000_000;
  writePendingLibrarySave({
    practiceId: PRACTICE,
    returnPath: "/practice/anna/morning",
    ts: now - PENDING_LIBRARY_SAVE_TTL_MS - 1,
    storage,
  });

  let fetchCount = 0;
  const pending = readPendingLibrarySave({ storage, now });
  const result = await consumePendingLibrarySave({
    isAuthenticated: true,
    storage,
    now,
    fetchImpl: async () => {
      fetchCount += 1;
      throw new Error("expired_must_not_fetch");
    },
  });

  assert.equal(pending, null);
  assert.equal(result.posted, false);
  assert.equal(fetchCount, 0);
  assert.equal(storage.getItem(PENDING_LIBRARY_SAVE_STORAGE_KEY), null);
}

async function testGuestConsumeDoesNotPost() {
  resetPendingLibrarySaveConsumeForTests();
  const storage = createMemoryPendingLibrarySaveStorage();
  writePendingLibrarySave({
    practiceId: PRACTICE,
    returnPath: "/catalog",
    ts: Date.now(),
    storage,
  });

  let fetchCount = 0;
  const result = await consumePendingLibrarySave({
    isAuthenticated: false,
    storage,
    fetchImpl: async () => {
      fetchCount += 1;
      throw new Error("guest_must_not_fetch");
    },
  });

  assert.equal(result.consumed, false);
  assert.equal(fetchCount, 0);
  assert.ok(readPendingLibrarySave({ storage }));
  clearPendingLibrarySave({ storage });
}

function testWiringAndBoundaries() {
  const hook = read("src/lib/library/use-catalog-library-save.ts");
  const helper = read("src/lib/library/pending-library-save.ts");
  const grid = read("src/components/products/CatalogProductGrid.tsx");
  const buy = read("src/components/BuyPracticeButton.tsx");
  const claim = read("src/lib/library/use-library-membership.ts");

  assert.match(hook, /startCatalogLibrarySaveSignIn/);
  assert.match(hook, /useFlushPendingLibrarySave/);
  assert.match(hook, /consumePendingLibrarySave/);
  assert.match(grid, /useFlushPendingLibrarySave/);
  assert.match(helper, /audiolad:pending-library-save/);
  assert.doesNotMatch(hook, /\/api\/library\/claim|LibraryAddButton/);
  assert.doesNotMatch(helper, /\/api\/library\/claim|entitlement|checkout/);
  assert.doesNotMatch(buy, /pending-library-save|consumePendingLibrarySave/);
  assert.doesNotMatch(claim, /pending-library-save|consumePendingLibrarySave/);
}

testGuestHeartWritesPendingAndDoesNotPost();
testReturnPathPrefersPracticePage();
await testLoginConsumesPendingOnce();
await testHeartIsActiveAfterConsume();
await testExpiredPendingIsIgnored();
await testGuestConsumeDoesNotPost();
testWiringAndBoundaries();

console.log("pending-heart-after-login-unit: ok");
