import assert from "node:assert/strict";

import {
  classifyAuthorSignedUploadError,
  fileForSignedAuthorAudioUpload,
  readAuthorSignedUploadClientReport,
} from "../src/lib/author-products/signed-upload-client.ts";
import { MAX_CONCURRENT_MUSIC_UPLOADS } from "../src/lib/author-products/music-track-upload-queue.ts";

assert.equal(MAX_CONCURRENT_MUSIC_UPLOADS, 1);

assert.equal(
  classifyAuthorSignedUploadError({
    status: 400,
    statusCode: "InvalidJWT",
    message: '"exp" claim timestamp check failed',
  }).code,
  "upload_token_expired",
);
assert.equal(
  classifyAuthorSignedUploadError({
    status: 415,
    statusCode: "415",
    error: "invalid_mime_type",
    message: "mime type application/octet-stream is not supported",
  }).code,
  "invalid_mime_type",
);
assert.equal(
  classifyAuthorSignedUploadError(new TypeError("Failed to fetch")).code,
  "upload_network",
);

const leaked = classifyAuthorSignedUploadError({
  status: 400,
  statusCode: "InvalidJWT",
  message:
    'exp failed token=secret eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiJ9.c2ln',
});
assert.equal(leaked.code, "upload_token_expired");
assert.match(leaked.message ?? "", /token=\[redacted\]/);
assert.doesNotMatch(leaked.message ?? "", /eyJ/);

assert.equal(
  readAuthorSignedUploadClientReport({
    code: "upload_token_expired",
    status: 400,
    statusCode: "InvalidJWT",
    message: leaked.message,
  })?.code,
  "upload_token_expired",
);
assert.equal(readAuthorSignedUploadClientReport({ code: "drop_table" }), null);

assert.equal(
  fileForSignedAuthorAudioUpload(
    new Blob([Uint8Array.from([82, 73, 70, 70])], { type: "" }),
    "track.wav",
    "audio/wav",
  ).type,
  "audio/wav",
);

console.log("author-signed-upload-diagnostics-unit: ok");
