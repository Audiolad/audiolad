import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  StudioAutosaveController,
  type StudioAutosaveSnapshot,
} from "../src/lib/studio/autosave";

const assetId = "22222222-2222-4222-8222-222222222222";
const document = (currentTime = 0) => ({
  schemaVersion: 2 as const,
  studioVersion: 1 as const,
  editor: { currentTime },
  slots: [{ id: "slot-1", name: "Голос", audioTrackId: "track-1" }],
  tracks: [{
    id: "track-1", assetId, name: "voice.mp3", volume: 1, muted: false,
    clips: [{ id: "clip-1", startTime: 0, offset: 0, duration: 2, fadeInDuration: 0, fadeOutDuration: 0 }],
  }],
});

let now = 0;
let nextTimer = 0;
const timers = new Map<number, { at: number; callback: () => void }>();
const fakeTimers = {
  setTimeout(callback: () => void, delay: number) {
    const id = ++nextTimer;
    timers.set(id, { at: now + delay, callback });
    return id as unknown as ReturnType<typeof setTimeout>;
  },
  clearTimeout(id: ReturnType<typeof setTimeout>) {
    timers.delete(id as unknown as number);
  },
};
function advance(ms: number) {
  now += ms;
  for (const [id, timer] of [...timers]) {
    if (timer.at <= now) {
      timers.delete(id);
      timer.callback();
    }
  }
}
const tick = () => new Promise<void>((resolve) => queueMicrotask(resolve));

let snapshot: StudioAutosaveSnapshot = { name: "Монтаж", document: document() };
const calls: Array<{ expectedRevision: number; name: string; projectData: unknown }> = [];
let resolveRequest: ((value: { revision: number }) => void) | null = null;
let rejectRequest: ((reason?: unknown) => void) | null = null;
const states: string[] = [];
const controller = new StudioAutosaveController({
  getSnapshot: () => snapshot,
  timers: fakeTimers,
  onChange: (state) => states.push(state.status),
  update: (input) => {
    calls.push(input);
    return new Promise((resolve, reject) => {
      resolveRequest = resolve;
      rejectRequest = reject;
    });
  },
});

controller.hydrate({ revision: 4, name: "Монтаж", document: document(), complete: true });
controller.markDirty();
advance(1499);
assert.equal(calls.length, 0, "uses a 1500 ms debounce");
advance(1);
assert.equal(calls.length, 0, "equal document does not PUT");

snapshot = { name: "Монтаж v2", document: document(12) };
controller.markDirty();
advance(1500);
assert.equal(calls.length, 1);
assert.deepEqual(calls[0], {
  expectedRevision: 4,
  name: "Монтаж v2",
  projectData: document(12),
}, "sends name, document and expected revision together");
snapshot = { name: "Монтаж v3", document: document(18) };
controller.markDirty();
controller.markDirty();
advance(1500);
assert.equal(calls.length, 1, "never starts a parallel PUT");
(resolveRequest as unknown as (value: { revision: number }) => void)({ revision: 5 });
await tick();
assert.equal(controller.getState().revision, 5);
advance(1500);
assert.equal(calls.length, 2, "queues exactly one later PUT after in-flight edits");
assert.equal(calls[1].expectedRevision, 5);
(resolveRequest as unknown as (value: { revision: number }) => void)({ revision: 6 });
await tick();

snapshot = { name: "Монтаж v4", document: document(20) };
controller.markDirty();
advance(1500);
(rejectRequest as unknown as (reason?: unknown) => void)({ status: 409 });
await tick();
assert.equal(controller.getState().status, "conflict");
controller.markDirty();
advance(2000);
assert.equal(calls.length, 3, "conflict prevents automatic overwrite");

const blocked = new StudioAutosaveController({
  getSnapshot: () => ({ ...snapshot, blocked: "assets" }),
  update: async () => ({ revision: 1 }),
  timers: fakeTimers,
});
blocked.hydrate({ revision: 1, name: "Монтаж", document: document(), complete: true });
blocked.markDirty();
assert.equal(blocked.getState().status, "asset-uploading", "pending audio blocks document PUT");
const partial = new StudioAutosaveController({
  getSnapshot: () => ({ ...snapshot, blocked: "partial" }),
  update: async () => ({ revision: 1 }),
  timers: fakeTimers,
});
partial.hydrate({ revision: 1, name: "Монтаж", document: document(), complete: false });
partial.markDirty();
assert.equal(partial.getState().status, "partial-disabled", "partial hydration disables autosave");

let failedAttempts = 0;
const retryable = new StudioAutosaveController({
  getSnapshot: () => ({ name: "Сеть", document: document(25) }),
  timers: fakeTimers,
  update: async () => {
    failedAttempts += 1;
    if (failedAttempts === 1) throw { status: 500 };
    return { revision: 2 };
  },
});
retryable.hydrate({ revision: 1, name: "Монтаж", document: document(), complete: true });
retryable.markDirty();
advance(1500);
await tick();
assert.equal(retryable.getState().status, "error");
retryable.retry();
await tick();
assert.equal(retryable.getState().status, "saved", "manual Save retries network/server failures");

let navigationSnapshot: StudioAutosaveSnapshot = {
  name: "Навигация",
  document: document(),
};
const navigationRequests: Array<(value: { revision: number }) => void> = [];
const navigationSave = new StudioAutosaveController({
  getSnapshot: () => navigationSnapshot,
  timers: fakeTimers,
  update: () => new Promise((resolve) => navigationRequests.push(resolve)),
});
navigationSave.hydrate({
  revision: 1,
  name: "Навигация",
  document: document(),
  complete: true,
});
navigationSnapshot = { name: "Навигация v2", document: document(30) };
navigationSave.markDirty();
const settledNavigation = navigationSave.flushAndWait();
assert.equal(navigationRequests.length, 1, "navigation flush starts the pending save immediately");
navigationSnapshot = { name: "Навигация v3", document: document(35) };
navigationSave.markDirty();
navigationRequests.shift()?.({ revision: 2 });
await tick();
assert.equal(
  navigationRequests.length,
  1,
  "navigation flush saves edits made while the first request was in flight",
);
navigationRequests.shift()?.({ revision: 3 });
assert.equal(await settledNavigation, true, "navigation waits for a clean save state");

const failedNavigation = new StudioAutosaveController({
  getSnapshot: () => ({ name: "Ошибка", document: document(40) }),
  timers: fakeTimers,
  update: async () => {
    throw { status: 500 };
  },
});
failedNavigation.hydrate({ revision: 1, name: "Ошибка", document: document(), complete: true });
failedNavigation.markDirty();
assert.equal(
  await failedNavigation.flushAndWait(),
  false,
  "navigation flush refuses to settle after a save error",
);


// Race: assets unblock -> pending debounce with stale asset-uploading -> flushAndWait
// must save immediately instead of clearing the timer and returning false.
{
  let raceSnapshot: StudioAutosaveSnapshot = {
    name: "Race",
    document: document(50),
    blocked: "assets",
  };
  const raceCalls: Array<{ expectedRevision: number; name: string }> = [];
  let resolveRace: ((value: { revision: number }) => void) | null = null;
  const race = new StudioAutosaveController({
    getSnapshot: () => raceSnapshot,
    timers: fakeTimers,
    debounceMs: 1500,
    update: (input) => {
      raceCalls.push({ expectedRevision: input.expectedRevision, name: input.name });
      return new Promise((resolve) => {
        resolveRace = resolve;
      });
    },
  });
  race.hydrate({ revision: 10, name: "Race", document: document(), complete: true });
  race.markDirty();
  assert.equal(race.getState().status, "asset-uploading", "blocked assets set asset-uploading");
  assert.equal(timers.size, 0, "blocked schedule arms no debounce timer");

  raceSnapshot = {
    name: "Race ready",
    document: document(51),
    blocked: undefined,
  };
  race.notifyAssetBound();
  assert.equal(timers.size, 1, "unblocked notifyAssetBound arms debounce");
  assert.notEqual(
    race.getState().status,
    "asset-uploading",
    "unblocked schedule clears stale asset-uploading before debounce",
  );
  assert.equal(raceCalls.length, 0, "debounce has not fired yet");

  const flushed = race.flushAndWait();
  assert.equal(timers.size, 0, "flushAndWait clears the pending debounce timer");
  assert.equal(raceCalls.length, 1, "flushAndWait immediately PUTs after assets are saved");
  assert.equal(raceCalls[0].name, "Race ready");
  assert.equal(race.getState().status, "saving");
  (resolveRace as unknown as (value: { revision: number }) => void)({ revision: 11 });
  await tick();
  assert.equal(await flushed, true, "flushAndWait resolves true after the revision save");
  assert.equal(race.getState().status, "saved");
  assert.equal(race.getState().revision, 11);
  assert.equal(race.getState().dirty, false);
}

// flushAndWait while assets are still uploading waits, then saves after notifyAssetBound.
{
  let waitSnapshot: StudioAutosaveSnapshot = {
    name: "Wait",
    document: document(60),
    blocked: "assets",
  };
  const waitCalls: Array<{ name: string }> = [];
  let resolveWait: ((value: { revision: number }) => void) | null = null;
  const waiting = new StudioAutosaveController({
    getSnapshot: () => waitSnapshot,
    timers: fakeTimers,
    debounceMs: 1500,
    update: (input) => {
      waitCalls.push({ name: input.name });
      return new Promise((resolve) => {
        resolveWait = resolve;
      });
    },
  });
  waiting.hydrate({ revision: 1, name: "Wait", document: document(), complete: true });
  waiting.markDirty();
  const pendingFlush = waiting.flushAndWait();
  assert.equal(waitCalls.length, 0, "still-uploading flush does not PUT yet");
  assert.equal(waiting.getState().status, "asset-uploading");

  waitSnapshot = {
    name: "Wait saved",
    document: document(61),
  };
  waiting.notifyAssetBound();
  assert.equal(waitCalls.length, 1, "waiter skips debounce and saves as soon as assets bind");
  assert.equal(waitCalls[0].name, "Wait saved");
  (resolveWait as unknown as (value: { revision: number }) => void)({ revision: 2 });
  await tick();
  assert.equal(await pendingFlush, true, "one Create MP3 click can wait through upload+save");
  assert.equal(waiting.getState().revision, 2);
}

// Asset error must fail flush as a recoverable error, not a "please wait" hang.
{
  let errorSnapshot: StudioAutosaveSnapshot = {
    name: "Asset err",
    document: document(70),
    blocked: "asset-error",
  };
  const errored = new StudioAutosaveController({
    getSnapshot: () => errorSnapshot,
    timers: fakeTimers,
    update: async () => ({ revision: 99 }),
  });
  errored.hydrate({ revision: 1, name: "Asset err", document: document(), complete: true });
  errored.markDirty();
  assert.equal(errored.getState().status, "error");
  assert.equal(
    await errored.flushAndWait(),
    false,
    "asset-error flush returns false immediately",
  );
  assert.equal(errored.getState().status, "error");

  // Retry path: uploading -> saved -> Create MP3 flush succeeds on the first click.
  errorSnapshot = {
    name: "Asset err",
    document: document(70),
    blocked: "assets",
  };
  errored.notifyAssetBound();
  assert.equal(errored.getState().status, "asset-uploading");
  const afterRetryFlush = errored.flushAndWait();
  errorSnapshot = {
    name: "Asset fixed",
    document: document(71),
  };
  errored.notifyAssetBound();
  await tick();
  assert.equal(await afterRetryFlush, true, "retry then one flush saves revision");
  assert.equal(errored.getState().revision, 99);
  assert.equal(errored.getState().status, "saved");
}

assert(states.includes("saving") && states.includes("saved") && states.includes("conflict"));
const shell = await readFile(
  new URL("../src/components/studio/StudioEditorShell.tsx", import.meta.url), "utf8",
);
const client = await readFile(
  new URL("../src/lib/studio/persistence-client.ts", import.meta.url), "utf8",
);
assert.match(shell, /beforeunload/);
assert.match(shell, /Есть несохранённые изменения\. Если выйти сейчас, они могут быть потеряны\./);
assert.match(shell, /Проект открыт не полностью\. Сохранение отключено\./);
assert.match(shell, /currentTime: exportEditingState\(\)\.position/);
assert.match(shell, /onClipGestureCommit/);
assert.match(shell, /Сохранить/);
assert.match(shell, /Есть несохранённые изменения/);
assert.match(shell, /autosaveState\?\.isInFlight/);
assert.match(shell, /saveButtonDisabled/);
assert.match(shell, /Сохранено/);
assert.match(shell, /assetPersistenceStatus !== "saved"/);
assert.match(shell, /useRouter/);
assert.match(shell, /flushAndWait\(\)/);
assert.match(shell, /navigationInProgressRef/);
assert.match(shell, /createMp3Disabled/);
assert.match(shell, /hasAssetPersistenceError/);
assert.match(shell, /exportPhase === "flushing"/);
assert.match(shell, /Сохраняем проект…/);
assert.match(shell, /Не удалось сохранить аудио/);
assert.match(shell, /Нажмите «Повторить» у дорожки/);
assert.doesNotMatch(
  shell,
  /throw new Error\("Сначала дождитесь сохранения проекта и аудиофайлов\."\)/,
  "export no longer uses the misleading wait message as the primary failure",
);
assert.match(
  shell,
  /Не удалось сохранить проект\. Нажмите «Сохранить» и попробуйте снова\./,
);
assert.match(
  shell,
  /href="\/studio\/projects"\s+onClick=\{\(event\) => void navigateToMyProjects\(event\)\}/,
  "My Projects has its own autosave-aware navigation handler",
);
assert.match(
  shell,
  /router\.push\("\/studio\/projects"\)/,
  "My Projects navigation uses the Project Library route",
);
assert.match(client, /export async function updateStudioProject/);
assert.match(client, /revision_conflict/);

console.log("studio autosave checks passed");
