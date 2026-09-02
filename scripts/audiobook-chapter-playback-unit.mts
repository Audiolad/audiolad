import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  activeAudiobookFragmentQueue,
  audiobookFragmentEndedTransition,
  nextAudiobookFragmentIndex,
  reconcileAudiobookFragmentQueue,
} from "../src/components/studio/audiobooks/audiobook-chapter-player-queue";
import { isAudiobookActiveFragmentStoragePath } from "../src/lib/audiobooks/storage";

const authorId = "11111111-1111-4111-8111-111111111111";
const projectId = "22222222-2222-4222-8222-222222222222";
const chapterId = "33333333-3333-4333-8333-333333333333";
const fragmentId = "44444444-4444-4444-8444-444444444444";

const flatPath = `audiobooks/${authorId}/${projectId}/${chapterId}/${fragmentId}.m4a`;
const legacyPath = `audiobooks/${authorId}/${projectId}/${chapterId}/${fragmentId}/Запись-01.m4a`;
assert.equal(isAudiobookActiveFragmentStoragePath(flatPath, authorId, projectId, chapterId, fragmentId), true);
assert.equal(isAudiobookActiveFragmentStoragePath(legacyPath, authorId, projectId, chapterId, fragmentId), true);
assert.equal(isAudiobookActiveFragmentStoragePath(`${legacyPath}/extra`, authorId, projectId, chapterId, fragmentId), false);
assert.equal(isAudiobookActiveFragmentStoragePath(`audiobooks/${authorId}/${projectId}/${chapterId}/${fragmentId}/../audio.m4a`, authorId, projectId, chapterId, fragmentId), false);

const queue = activeAudiobookFragmentQueue([
  { id: "second", position: 2, status: "active" as const },
  { id: "pending", position: 1, status: "uploading" as const },
  { id: "first", position: 1, status: "active" as const },
]);
assert.deepEqual(queue.map((fragment) => fragment.id), ["first", "second"]);
assert.equal(nextAudiobookFragmentIndex(queue, 0), 1);
assert.equal(nextAudiobookFragmentIndex(queue, 1), null);
assert.deepEqual(audiobookFragmentEndedTransition(queue, 0), {
  currentIndex: 1,
  shouldReset: false,
});
assert.deepEqual(audiobookFragmentEndedTransition(queue, 1), {
  currentIndex: 0,
  shouldReset: true,
});
assert.deepEqual(reconcileAudiobookFragmentQueue(queue, 1, [
  ...queue,
  { id: "third", position: 3, status: "active" as const },
]), {
  currentIndex: 1,
  shouldReset: false,
});
assert.deepEqual(reconcileAudiobookFragmentQueue(queue, 1, [queue[0]]), {
  currentIndex: 0,
  shouldReset: true,
});

const server = readFileSync("src/lib/audiobooks/server.ts", "utf8");
const route = readFileSync("src/app/api/studio/audiobooks/projects/[projectId]/chapters/[chapterId]/fragments/[fragmentId]/playback/route.ts", "utf8");
const player = readFileSync("src/components/studio/audiobooks/AudiobookChapterPlayer.tsx", "utf8");
const workspace = readFileSync("src/components/studio/audiobooks/AudiobookProjectWorkspace.tsx", "utf8");

assert.match(server, /eq\("status", "active"\)/);
assert.match(server, /isAudiobookActiveFragmentStoragePath/);
assert.match(server, /createSignedUrl\(fragment\.storage_path, AUDIOBOOK_PLAYBACK_EXPIRES_IN\)/);
assert.match(route, /createAudiobookFragmentPlaybackUrl/);
assert.match(player, /<audio ref=\{audioRef\}/);
assert.equal((player.match(/<audio\b/g) ?? []).length, 1);
assert.match(player, /audiobookFragmentEndedTransition/);
assert.match(player, /reconcileAudiobookFragmentQueue/);
assert.match(player, /if \(transition\.shouldReset\) \{\s+reset\(\);/);
assert.match(player, /Фрагмент \$\{currentIndex \+ 1\} из \$\{queue\.length\}/);
assert.doesNotMatch(player, /current\.original_name/);
assert.match(player, /retryRef\.current === 0/);
assert.match(player, /currentIndexRef\.current = index;\s+setCurrentIndex\(index\);/);
assert.match(player, /const handleRetry = useCallback\(\(\) => \{\s+retryRef\.current = 0;\s+void playAt\(currentIndexRef\.current\);/);
assert.match(player, /function pausedPlaybackTime\(audio: HTMLAudioElement\)/);
assert.match(player, /function waitForAudioReadiness\(audio: HTMLAudioElement\)/);
assert.match(player, /audio\.addEventListener\("loadedmetadata", handleReady, \{ once: true \}\)/);
assert.match(player, /const recoverPausedPlayback = useCallback\(async/);
assert.match(player, /audio\.src = body\.url;\s+audio\.load\(\);\s+await waitForAudioReadiness\(audio\);\s+if \(requestId !== requestRef\.current \|\| recoveryRef\.current !== requestId\) return;\s+audio\.currentTime = pausedAt;\s+await audio\.play\(\);/);
assert.match(player, /if \(recoveryRef\.current !== null\) return;\s+const transition = audiobookFragmentEndedTransition/);
assert.match(player, /const pausedAt = pausedPlaybackTime\(audio\);/);
assert.match(player, /void recoverPausedPlayback\(currentIndexRef\.current, requestId, pausedAt\)/);
assert.match(player, /Нажмите «Повторить»/);
assert.match(player, /"Слушать главу"/);
assert.match(player, />Повторить</);
assert.match(player, /useEffect\(\(\) => reset, \[chapterId, reset\]\)/);
assert.match(workspace, /AudiobookChapterPlayer/);
assert.doesNotMatch(player, /createClient\(\)|uploadToSignedUrl|MediaRecorder/);

console.log("audiobook-chapter-playback-unit: ok");
