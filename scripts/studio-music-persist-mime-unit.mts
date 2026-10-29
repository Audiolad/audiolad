import assert from "node:assert/strict";

import { canonicalizeStudioUploadMimeType } from "../src/lib/studio/recording-mime";
import { validateStudioLocalFile } from "../src/lib/studio/local-file-validation";
import {
  validateStudioUpload,
} from "../src/lib/studio/server/validation";

const cases = [
  ["voice.mp3", "audio/mp3", "audio/mpeg"],
  ["music.mp3", "audio/x-mp3", "audio/mpeg"],
  ["music.mp3", "", "audio/mpeg"],
  ["music.mp3", "application/octet-stream", "audio/mpeg"],
  ["song.m4a", "audio/x-m4a", "audio/mp4"],
  ["voice.mp3", "audio/mpeg", "audio/mpeg"],
  ["voice.wav", "audio/wav", "audio/wav"],
  ["voice.wav", "audio/x-wav", "audio/x-wav"],
  ["voice.m4a", "audio/mp4", "audio/mp4"],
  ["voice.aac", "audio/aac", "audio/aac"],
  ["recording.webm", "audio/webm;codecs=opus", "audio/webm"],
] as const;

for (const [name, type, expected] of cases) {
  assert.equal(canonicalizeStudioUploadMimeType({ name, type }), expected);
  assert.equal(
    validateStudioUpload({ name, type, size: 1 } as File).mimeType,
    expected,
  );
  assert.equal(validateStudioLocalFile({ name, type, size: 1 }), null);
}

for (const name of ["voice.ogg", "voice.oga", "voice.opus"]) {
  for (const type of ["audio/ogg", "audio/opus", "application/ogg", "video/ogg", "audio/x-opus+ogg", "audio/vorbis", "audio/x-vorbis+ogg", "", "application/octet-stream"]) {
    assert.equal(canonicalizeStudioUploadMimeType({ name, type }), "audio/ogg");
    const upload = validateStudioUpload({ name, type, size: 1 });
    assert.equal(upload.mimeType, "audio/ogg");
    assert.equal(upload.filename, "voice.ogg");
    assert.equal(validateStudioLocalFile({ name, type, size: 1 }), null);
  }
}
assert.equal(
  canonicalizeStudioUploadMimeType({ name: "voice.ogg", type: "audio/ogg" }),
  "audio/ogg",
);


assert.throws(() => validateStudioUpload({ name: "fake.ogg", type: "audio/mpeg", size: 10 }));
assert.notEqual(validateStudioLocalFile({ name: "fake.ogg", type: "audio/mpeg", size: 10 }), null);

console.log("studio music persist mime checks passed");
