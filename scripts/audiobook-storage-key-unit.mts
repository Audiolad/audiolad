import assert from "node:assert/strict";

import {
  audiobookExtensionForMimeType,
  buildAudiobookFragmentStoragePath,
  isAudiobookFragmentStoragePath,
  validateAudiobookOriginalFilename,
} from "../src/lib/audiobooks/storage";

const authorId = "11111111-1111-4111-8111-111111111111";
const projectId = "22222222-2222-4222-8222-222222222222";
const chapterId = "33333333-3333-4333-8333-333333333333";
const fragmentId = "44444444-4444-4444-8444-444444444444";

assert.equal(audiobookExtensionForMimeType("audio/x-m4a; codecs=mp4a.40.2"), "m4a");
assert.equal(audiobookExtensionForMimeType("audio/mpeg"), "mp3");
assert.equal(audiobookExtensionForMimeType("audio/ogg"), null);

const path = buildAudiobookFragmentStoragePath(
  authorId,
  projectId,
  chapterId,
  fragmentId,
  "audio/mp4",
);
assert.equal(
  path,
  `audiobooks/${authorId}/${projectId}/${chapterId}/${fragmentId}.m4a`,
);
assert.match(path, /^[\x20-\x7e]+$/);
assert.equal(isAudiobookFragmentStoragePath(path, authorId, projectId, chapterId, fragmentId), true);
assert.equal(
  isAudiobookFragmentStoragePath(
    `audiobooks/${authorId}/${projectId}/${chapterId}/${fragmentId}/аудио.m4a`,
    authorId,
    projectId,
    chapterId,
    fragmentId,
  ),
  false,
);

assert.equal(validateAudiobookOriginalFilename("Медитация — осень.m4a"), "Медитация — осень.m4a");
assert.equal(validateAudiobookOriginalFilename("../audio.m4a"), null);
assert.equal(validateAudiobookOriginalFilename("folder/audio.m4a"), null);

console.log("audiobook-storage-key-unit: ok");
