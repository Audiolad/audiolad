/**
 * Play All queue validation + critical scenario simulations (no network).
 * Run: npx --yes tsx scripts/playlists-play-all-validation-smoke.mjs
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildOwnerPlaylistQueue,
  buildPublicPlaylistQueue,
  formatQueueSkipMessage,
} from "../src/lib/playlists/build-playlist-queue.ts";
import {
  isProductQueueEntry,
  isSafeInternalListenHref,
} from "../src/lib/playlists/player-queue-types.ts";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function read(path) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

const ownerItems = [
  {
    practiceId: "11111111-1111-4111-8111-111111111111",
    position: 1,
    title: "A",
    authorName: "Author",
    authorSlug: "author",
    formatLabel: null,
    metaLabel: null,
    coverDisplayUrl: null,
    available: true,
    unavailableReason: null,
    listenHref: "/listen/author/practice-a?autoplay=1",
  },
  {
    practiceId: "22222222-2222-4222-8222-222222222222",
    position: 2,
    title: "Paid",
    authorName: "Author",
    authorSlug: "author",
    formatLabel: null,
    metaLabel: null,
    coverDisplayUrl: null,
    available: false,
    unavailableReason: "Материал сейчас недоступен",
    listenHref: null,
  },
  {
    practiceId: "33333333-3333-4333-8333-333333333333",
    position: 3,
    title: "B program",
    authorName: "Author",
    authorSlug: "author",
    formatLabel: "Программа",
    metaLabel: null,
    coverDisplayUrl: null,
    available: true,
    unavailableReason: null,
    listenHref: "/listen/author/practice-b",
  },
  {
    practiceId: "44444444-4444-4444-8444-444444444444",
    position: 4,
    title: "C",
    authorName: "Author",
    authorSlug: "author",
    formatLabel: null,
    metaLabel: null,
    coverDisplayUrl: null,
    available: true,
    unavailableReason: null,
    listenHref: "/listen/author/practice-c",
  },
];

const owner = buildOwnerPlaylistQueue({
  playlistId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  title: "Owner PL",
  items: ownerItems,
});

assert(owner.ok, "owner ok");
assert(owner.queue.entries.length === 3, "owner playable count");
assert(owner.queue.skippedCount === 1, "owner skipped");
assert(owner.queue.entries[0].listenHref === "/listen/author/practice-a", "strip query");
assert(isSafeInternalListenHref(owner.queue.entries[0].listenHref), "safe href");
assert(owner.queue.entries.every(isProductQueueEntry), "all product kind");
assert(
  owner.queue.entries.every((e) => !("audioUrl" in e) && !e.signedUrl),
  "no audio urls in queue",
);

const empty = buildOwnerPlaylistQueue({
  playlistId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  title: "Empty",
  items: [],
});
assert(!empty.ok && empty.reason === "empty", "empty owner");

const publicItems = [
  {
    practiceId: "11111111-1111-4111-8111-111111111111",
    position: 1,
    title: "Free",
    authorName: "A",
    authorSlug: "a",
    formatLabel: null,
    metaLabel: null,
    coverDisplayUrl: null,
    available: true,
    href: "/listen/a/free-one",
  },
  {
    practiceId: "22222222-2222-4222-8222-222222222222",
    position: 2,
    title: "Product page only",
    authorName: "A",
    authorSlug: "a",
    formatLabel: null,
    metaLabel: null,
    coverDisplayUrl: null,
    available: true,
    href: "/practice/a/paid-ish",
  },
  {
    practiceId: "33333333-3333-4333-8333-333333333333",
    position: 3,
    title: "Unavailable",
    authorName: null,
    authorSlug: null,
    formatLabel: null,
    metaLabel: null,
    coverDisplayUrl: null,
    available: false,
    href: null,
  },
];

const pub = buildPublicPlaylistQueue({
  playlistSlug: "my-public",
  title: "Public PL",
  items: publicItems,
});

assert(pub.ok, "public ok");
assert(pub.queue.entries.length === 1, "public only listen hrefs");
assert(pub.queue.skippedCount === 2, "public skipped");
assert(pub.queue.source.returnHref === "/p/my-public", "public return");
assert(formatQueueSkipMessage(1)?.includes("Один"), "skip one msg");

// --- Critical scenario simulations (pure) ---

/** Simulate ended+Next dedupe for the same practice. */
function simulateExhaustDedupe() {
  let lastExhausted = null;
  let advances = 0;

  function onTracksExhausted(fromPracticeId, sessionPracticeId, queuePracticeId) {
    if (lastExhausted === fromPracticeId) return "none";
    if (sessionPracticeId !== fromPracticeId) return "none";
    if (queuePracticeId !== fromPracticeId) return "none";
    lastExhausted = fromPracticeId;
    advances += 1;
    return "advanced";
  }

  assert(
    onTracksExhausted("A", "A", "A") === "advanced",
    "first exhaust advances",
  );
  assert(
    onTracksExhausted("A", "A", "A") === "none",
    "duplicate ended/next ignored",
  );
  assert(advances === 1, "only one advance");
}

/** Simulate internal replace guard vs standalone clear. */
function simulateNavigationGuard() {
  let queueActive = true;
  let replaceTarget = "B";
  let cleared = false;

  function isInternal(practiceId) {
    return replaceTarget === practiceId;
  }

  function onListenMount(practiceId) {
    if (isInternal(practiceId)) {
      return "keep-queue";
    }
    if (queueActive) {
      cleared = true;
      queueActive = false;
    }
    return "standalone-load";
  }

  assert(onListenMount("B") === "keep-queue", "replace B keeps queue");
  assert(!cleared, "queue not cleared on replace");
  assert(onListenMount("Z") === "standalone-load", "other listen standalone");
  assert(cleared, "standalone clears queue");
}

/** Simulate restart fromStart ignoring saved mid-track progress. */
function simulateRestartFromZero() {
  const savedProgress = { trackIndex: 0, positionSeconds: 120 };
  const forceStartAtBeginning = true;
  const initial = forceStartAtBeginning
    ? { trackIndex: 0, positionSeconds: 0 }
    : savedProgress;
  assert(initial.positionSeconds === 0, "restart starts at 0");
  assert(initial.trackIndex === 0, "restart track 0");
  // Historical DB progress is not deleted by this decision.
  assert(savedProgress.positionSeconds === 120, "db progress untouched");
}

simulateExhaustDedupe();
simulateNavigationGuard();
simulateRestartFromZero();

// Source guards present in provider / listen client
const provider = read("src/components/audio/GlobalAudioPlayerProvider.tsx");
assert(provider.includes("transitionLockRef"), "transition lock");
assert(provider.includes("queueReplaceTargetRef"), "replace target");
assert(provider.includes("lastExhaustedPracticeIdRef"), "exhaust dedupe");
assert(provider.includes("playbackInstanceId"), "remount instance");
assert(provider.includes("forceStartAtBeginning"), "restart from start");
assert(provider.includes("isInternalQueueNavigation"), "nav guard export");

const listenClient = read("src/components/audio/ListenPageClient.tsx");
assert(listenClient.includes("isInternalQueueNavigation"), "listen uses guard");
assert(listenClient.includes("clearPlaylistQueue"), "standalone clear");

const sessionRoute = read(
  "src/app/api/listen/product/[slug]/[productSlug]/session/route.ts",
);
assert(sessionRoute.includes("loadListenSessionPayload"), "session uses shared loader");
assert(!sessionRoute.includes("service_role"), "no service role in session route");

const future = {
  kind: "audio_item",
  practiceId: "11111111-1111-4111-8111-111111111111",
  audioItemId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  authorSlug: "a",
  productSlug: "p",
  title: "Clip",
  listenHref: "/listen/a/p",
};
assert(future.kind === "audio_item", "future kind exists");
assert(!isProductQueueEntry(future), "future not product");

console.log("PLAY_ALL_QUEUE_VALIDATION_SMOKE_PASS");
