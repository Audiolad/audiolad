import assert from "node:assert/strict";

import { continueOwnerRebuild, type OwnerRebuildDeps } from "../src/lib/business-app/atmosphere-rebuild-flow";

type RebuildResult = "applied" | "deferred" | "failed";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}

/** One settings page: shared generation, mounted flag, in-flight token, restart marker and events. */
function page() {
  const state = {
    generation: 0,
    mounted: true,
    inFlight: { current: null as number | null },
    marker: false,
    stored: [] as number[],
    announced: 0,
    cancelled: 0,
  };
  const deps = (gen: number, rebuild: () => Promise<RebuildResult>): OwnerRebuildDeps => ({
    gen,
    currentGeneration: () => state.generation,
    isMounted: () => state.mounted,
    inFlight: state.inFlight,
    storeProfile: () => { state.stored.push(gen); },
    markRestart: () => { state.marker = true; },
    clearRestart: () => { state.marker = false; },
    announceSaved: () => { state.announced += 1; },
    rebuild,
  });
  /** What the component does on unmount. */
  const unmount = () => {
    state.mounted = false;
    if (state.inFlight.current !== null) state.cancelled += 1;
  };
  return { state, deps, unmount };
}

const tick = () => new Promise((r) => setTimeout(r, 0));

// Saved and still on the page: stored, marker set, rebuilt, applied.
{
  const { state, deps } = page();
  const gen = ++state.generation;
  const out = await continueOwnerRebuild(null, deps(gen, async () => "applied"));
  assert.equal(out, "applied");
  assert.deepEqual(state.stored, [gen]);
  assert.equal(state.marker, true);
  assert.equal(state.inFlight.current, null);
  assert.equal(state.announced, 0);
}

// Refused save: nothing changes.
{
  const { state, deps } = page();
  const gen = ++state.generation;
  let called = false;
  const out = await continueOwnerRebuild("Только владелец", deps(gen, async () => { called = true; return "applied"; }));
  assert.equal(out, "failed");
  assert.equal(called, false);
  assert.equal(state.marker, false);
  assert.deepEqual(state.stored, []);
}

// Failed local rebuild: reported, marker cleared (not shown as success).
{
  const { state, deps } = page();
  const gen = ++state.generation;
  assert.equal(await continueOwnerRebuild(null, deps(gen, async () => "failed")), "player-failed");
  assert.equal(state.marker, false);
}

// Left the page before the save answered: no settings request, the music page takes over.
{
  const { state, deps, unmount } = page();
  const gen = ++state.generation;
  unmount();
  let called = false;
  assert.equal(await continueOwnerRebuild(null, deps(gen, async () => { called = true; return "applied"; })), "deferred");
  assert.equal(called, false);
  assert.equal(state.marker, true, "marker kept for the music page");
  assert.equal(state.announced, 1);
}

// Left the page during the queue request: the request is cancelled (player drops it as "failed"),
// the marker stays and the open music page is told to fetch the queue itself.
{
  const { state, deps, unmount } = page();
  const gen = ++state.generation;
  const request = deferred<RebuildResult>();
  const run = continueOwnerRebuild(null, deps(gen, () => request.promise));
  await tick();
  assert.equal(state.inFlight.current, gen);
  unmount();
  assert.equal(state.cancelled, 1);
  request.resolve("failed");
  assert.equal(await run, "deferred");
  assert.equal(state.marker, true);
  assert.equal(state.announced, 1);
  assert.equal(state.inFlight.current, null);
}

// Stale completion: rebuild A is superseded by a chip change and rebuild B; A resolves after B
// started its request. A must not clear B's flag or marker, so leaving the page still cancels B.
{
  const { state, deps, unmount } = page();
  const genA = ++state.generation;
  const requestA = deferred<RebuildResult>();
  const runA = continueOwnerRebuild(null, deps(genA, () => requestA.promise));
  await tick();
  state.generation += 1; // chip change
  state.marker = false; // onChange clears the marker
  const genB = ++state.generation;
  const requestB = deferred<RebuildResult>();
  const runB = continueOwnerRebuild(null, deps(genB, () => requestB.promise));
  await tick();
  assert.equal(state.inFlight.current, genB);
  requestA.resolve("failed");
  assert.equal(await runA, "stale");
  assert.equal(state.inFlight.current, genB, "A leaves B's flag alone");
  assert.equal(state.marker, true, "A leaves B's marker alone");
  unmount();
  assert.equal(state.cancelled, 1, "B's request is cancelled on leaving");
  requestB.resolve("failed");
  assert.equal(await runB, "deferred");
  assert.equal(state.marker, true);
  assert.equal(state.announced, 1);
}

// A newer action while the save is pending: the old save does not touch the queue.
{
  const { state, deps } = page();
  const gen = ++state.generation;
  state.generation += 1;
  let called = false;
  assert.equal(await continueOwnerRebuild(null, deps(gen, async () => { called = true; return "applied"; })), "stale");
  assert.equal(called, false);
  assert.deepEqual(state.stored, []);
  assert.equal(state.marker, false);
}

console.log("business atmosphere rebuild flow: ok");
