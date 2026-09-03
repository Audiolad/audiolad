import assert from "node:assert/strict";

import {
  audiobookRenderSnapshotSha256,
  createAudiobookRenderSnapshot,
  parseAudiobookRenderSnapshot,
} from "../src/lib/audiobooks/render-snapshot";

const context = {
  authorId: "11111111-1111-4111-8111-111111111111",
  projectId: "22222222-2222-4222-8222-222222222222",
  chapterId: "33333333-3333-4333-8333-333333333333",
};
const firstId = "44444444-4444-4444-8444-444444444444";
const secondId = "55555555-5555-4555-8555-555555555555";
const firstPath = `audiobooks/${context.authorId}/${context.projectId}/${context.chapterId}/${firstId}.wav`;
const secondPath = `audiobooks/${context.authorId}/${context.projectId}/${context.chapterId}/${secondId}.m4a`;

const canonical = createAudiobookRenderSnapshot([
  { id: secondId, storagePath: secondPath, position: 2, mimeType: "audio/mp4", sizeBytes: 20 },
  { id: firstId, storagePath: firstPath, position: 1, mimeType: "audio/wav", sizeBytes: 10 },
], context);

// jsonb may return object keys in an arbitrary order. Array order is semantic,
// object-property order is not.
const jsonbLike = {
  fragments: canonical.fragments.map((fragment) => ({
    sizeBytes: fragment.sizeBytes,
    mimeType: fragment.mimeType,
    position: fragment.position,
    storagePath: fragment.storagePath,
    id: fragment.id,
  })),
  version: 1,
};
const parsed = parseAudiobookRenderSnapshot(jsonbLike, context);
assert.deepEqual(parsed, canonical);
assert.equal(audiobookRenderSnapshotSha256(parsed!), audiobookRenderSnapshotSha256(canonical));

assert.equal(parseAudiobookRenderSnapshot({
  version: 1,
  fragments: [{ ...canonical.fragments[0], storagePath: `audiobooks/${context.authorId}/wrong` }],
}, context), null);
assert.equal(parseAudiobookRenderSnapshot({
  version: 1,
  fragments: [{ ...canonical.fragments[0], sizeBytes: 0 }],
}, context), null);
assert.equal(parseAudiobookRenderSnapshot({
  version: 1,
  fragments: [canonical.fragments[0], { ...canonical.fragments[0], position: 2 }],
}, context), null);
assert.equal(parseAudiobookRenderSnapshot({
  version: 1,
  fragments: [canonical.fragments[0], { ...canonical.fragments[1], position: 1 }],
}, context), null);
assert.equal(parseAudiobookRenderSnapshot({
  version: 1,
  fragments: [{ ...canonical.fragments[0], mimeType: "audio/mp4" }],
}, context), null);

console.log("audiobook chapter render behavior: ok");
