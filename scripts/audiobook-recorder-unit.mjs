import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const recorder = readFileSync("src/lib/audiobooks/recorder.ts", "utf8");
const store = readFileSync("src/lib/audiobooks/recorder-store.ts", "utf8");
const sync = readFileSync("src/lib/audiobooks/recorder-sync.ts", "utf8");
const hook = readFileSync("src/components/studio/audiobooks/useAudiobookRecorder.ts", "utf8");
const component = readFileSync("src/components/studio/audiobooks/AudiobookRecorder.tsx", "utf8");

assert.match(store, /indexedDB\.open/);
assert.match(store, /projectCreated/);
assert.match(store, /blob: Blob/);
assert.match(sync, /for \(const draft of await listAudiobookRecordingDrafts\(projectId\)\)/);
assert.match(sync, /uploadToSignedUrl/);
assert.match(sync, /sourceType: "recording"/);
assert.match(sync, /deleteAudiobookRecordingDraft\(draft\.id\)/);
assert.match(recorder, /AUDIOBOOK_RECORDER_AUTO_STOP_MARGIN_MS/);
assert.match(recorder, /audio\/webm/);
assert.match(hook, /recorder\.stop\(\)/);
assert.match(hook, /statusRef\.current !== "recording"/);
assert.match(hook, /getUserMedia\(\{ audio: AUDIOBOOK_MICROPHONE_CONSTRAINTS \}\)/);
assert.doesNotMatch(hook, /useStudioRecorder/);
assert.match(component, /Удалить локальный черновик/);
assert.match(component, /Восстановить запись будет невозможно/);

console.log("audiobook-recorder-unit: ok");
