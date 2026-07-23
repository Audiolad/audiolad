#!/usr/bin/env node
import assert from "node:assert/strict";

import {
  maybeDecodePercentEncodedFilename,
  sanitizePersonalMaterialDownloadFilename,
} from "../src/lib/personal-materials/download-filename.ts";

assert.equal(
  sanitizePersonalMaterialDownloadFilename("Ольга Полянская.mp3", "audio.mp3"),
  "Ольга Полянская.mp3",
  "cyrillic audio filename stays readable",
);

assert.equal(
  sanitizePersonalMaterialDownloadFilename(
    "Илья Бердышев, диагностика.pdf",
    "document.pdf",
  ),
  "Илья Бердышев, диагностика.pdf",
  "cyrillic pdf filename with comma stays readable",
);

assert.equal(
  sanitizePersonalMaterialDownloadFilename(
    "%D0%9E%D0%BB%D1%8C%D0%B3%D0%B0%20%D0%9F%D0%BE%D0%BB%D1%8F%D0%BD%D1%81%D0%BA%D0%B0%D1%8F.mp3",
    "audio.mp3",
  ),
  "Ольга Полянская.mp3",
  "percent-encoded filename is decoded safely",
);

assert.equal(
  sanitizePersonalMaterialDownloadFilename("100% complete.mp3", "audio.mp3"),
  "100% complete.mp3",
  "literal percent sign is preserved",
);

assert.equal(
  sanitizePersonalMaterialDownloadFilename("../../etc/passwd.pdf", "document.pdf"),
  "passwd.pdf",
  "path traversal basename is kept without directories",
);

assert.equal(
  sanitizePersonalMaterialDownloadFilename("evil\r\nname.mp3", "audio.mp3"),
  "evilname.mp3",
  "control characters are stripped",
);

assert.equal(
  sanitizePersonalMaterialDownloadFilename("", "audio.mp3"),
  "audio.mp3",
  "empty filename falls back",
);

assert.equal(
  maybeDecodePercentEncodedFilename("100% complete.mp3"),
  "100% complete.mp3",
  "maybeDecode keeps literal percent",
);

console.log("personal-materials-download-filename-unit: PASS");
