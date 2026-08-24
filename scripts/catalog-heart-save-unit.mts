import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  persistCatalogLibrarySave,
  resolveCatalogLibrarySaveClick,
  buildCatalogLibrarySaveRequest,
} from "../src/lib/library/use-catalog-library-save";
import {
  peekLibrarySave,
  publishLibrarySave,
  resetLibrarySaveSyncForTests,
  resolveCatalogLibrarySaveState,
  subscribeLibrarySave,
} from "../src/lib/library/saves-sync";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const PRACTICE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function read(relativePath: string) {
  return readFileSync(join(repoRoot, relativePath), "utf8");
}

function testSyncTwoSubscribers() {
  resetLibrarySaveSyncForTests();
  const received: boolean[][] = [[], []];

  const unsubscribeA = subscribeLibrarySave(PRACTICE, (isSaved) => {
    received[0].push(isSaved);
  });
  const unsubscribeB = subscribeLibrarySave(PRACTICE, (isSaved) => {
    received[1].push(isSaved);
  });

  publishLibrarySave(PRACTICE, true);

  assert.deepEqual(received[0], [true]);
  assert.deepEqual(received[1], [true]);
  assert.equal(peekLibrarySave(PRACTICE), true);

  unsubscribeA();
  unsubscribeB();
}

async function simulateHookToggle(input: {
  isSaved: boolean;
  isAuthenticated: boolean;
  fetchImpl?: (
    url: string,
    init?: RequestInit,
  ) => Promise<Pick<Response, "status" | "json">>;
}) {
  const fetchCalls: Array<{ method: string; body: unknown }> = [];
  const fetchImpl =
    input.fetchImpl ??
    (async (_url: string, init?: RequestInit) => {
      fetchCalls.push({
        method: String(init?.method),
        body: JSON.parse(String(init?.body)),
      });
      const nextSaved = String(init?.method) === "POST";
      return {
        status: nextSaved ? 201 : 200,
        json: async () => ({
          saved: nextSaved,
          created: nextSaved,
          deleted: !nextSaved,
          practiceId: PRACTICE,
        }),
      };
    });

  if (resolveCatalogLibrarySaveClick(input.isAuthenticated) === "sign_in") {
    return { isSaved: input.isSaved, fetchCalls, errorMessage: null, intent: "sign_in" };
  }

  const nextSaved = !input.isSaved;
  publishLibrarySave(PRACTICE, nextSaved);
  const result = await persistCatalogLibrarySave({
    practiceId: PRACTICE,
    nextSaved,
    fetchImpl,
  });

  if (!result.ok) {
    publishLibrarySave(PRACTICE, input.isSaved);
    return {
      isSaved: peekLibrarySave(PRACTICE),
      fetchCalls,
      errorMessage: result.errorMessage,
      intent: "toggle",
    };
  }

  return {
    isSaved: peekLibrarySave(PRACTICE),
    fetchCalls,
    errorMessage: null,
    intent: "toggle",
  };
}

async function testHookSavePosts() {
  resetLibrarySaveSyncForTests();
  const fetchCalls: Array<{ method: string; body: unknown }> = [];
  const result = await simulateHookToggle({
    isSaved: false,
    isAuthenticated: true,
    fetchImpl: async (_url, init) => {
      fetchCalls.push({
        method: String(init?.method),
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
    },
  });

  assert.equal(result.intent, "toggle");
  assert.equal(result.isSaved, true);
  assert.equal(fetchCalls.length, 1);
  assert.equal(fetchCalls[0]?.method, "POST");
  assert.deepEqual(fetchCalls[0]?.body, { practiceId: PRACTICE });
  assert.deepEqual(buildCatalogLibrarySaveRequest(PRACTICE, true).method, "POST");
}

async function testHookUnsaveDeletes() {
  resetLibrarySaveSyncForTests();
  publishLibrarySave(PRACTICE, true);
  const fetchCalls: Array<{ method: string }> = [];
  const result = await simulateHookToggle({
    isSaved: true,
    isAuthenticated: true,
    fetchImpl: async (_url, init) => {
      fetchCalls.push({ method: String(init?.method) });
      return {
        status: 200,
        json: async () => ({
          saved: false,
          deleted: true,
          practiceId: PRACTICE,
        }),
      };
    },
  });

  assert.equal(result.isSaved, false);
  assert.equal(fetchCalls.length, 1);
  assert.equal(fetchCalls[0]?.method, "DELETE");
}

async function testHookErrorRollsBack() {
  resetLibrarySaveSyncForTests();
  const result = await simulateHookToggle({
    isSaved: false,
    isAuthenticated: true,
    fetchImpl: async () => {
      throw new Error("network");
    },
  });

  assert.equal(result.isSaved, false);
  assert.equal(result.errorMessage, "Не удалось сохранить");
  assert.equal(peekLibrarySave(PRACTICE), false);
}

async function testGuestDoesNotFetch() {
  resetLibrarySaveSyncForTests();
  let fetchCount = 0;
  const result = await simulateHookToggle({
    isSaved: false,
    isAuthenticated: false,
    fetchImpl: async () => {
      fetchCount += 1;
      throw new Error("guest_must_not_fetch");
    },
  });

  assert.equal(result.intent, "sign_in");
  assert.equal(result.isSaved, false);
  assert.equal(fetchCount, 0);
  assert.equal(resolveCatalogLibrarySaveState(null, false), false);
  assert.equal(resolveCatalogLibrarySaveState(true, false), true);
}

function testNoClaimOrFavorites() {
  const hook = read("src/lib/library/use-catalog-library-save.ts");
  const button = read("src/components/products/CatalogProductHeartButton.tsx");
  const sync = read("src/lib/library/saves-sync.ts");

  for (const source of [hook, button, sync]) {
    assert.doesNotMatch(source, /useLibraryMembership/);
    assert.doesNotMatch(source, /LibraryAddButton/);
    assert.doesNotMatch(source, /claim_free_practice|\/api\/library\/claim/);
    assert.doesNotMatch(source, /\/api\/library\/remove/);
    assert.doesNotMatch(source, /access_source/);
    assert.doesNotMatch(source, /favorites|Избранн/);
    assert.doesNotMatch(source, /user_practices/);
  }

  assert.match(hook, /\/api\/library\/saves/);
  assert.match(button, /useCatalogLibrarySave/);
}

testSyncTwoSubscribers();
await testHookSavePosts();
await testHookUnsaveDeletes();
await testHookErrorRollsBack();
await testGuestDoesNotFetch();
testNoClaimOrFavorites();

console.log("catalog-heart-save-unit: ok");
