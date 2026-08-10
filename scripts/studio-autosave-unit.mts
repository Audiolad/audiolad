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
assert.match(client, /export async function updateStudioProject/);
assert.match(client, /revision_conflict/);

console.log("studio autosave checks passed");
