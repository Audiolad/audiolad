#!/usr/bin/env node
import assert from "node:assert/strict";

import {
  resolvePersonalMaterialDownloadFilename,
} from "../src/lib/personal-materials/server/download.ts";

const material = {
  audio_original_filename: "Ольга Полянская.mp3",
  pdf_original_filename: "Диагностика — Ольга Полянская.pdf",
};

assert.equal(
  resolvePersonalMaterialDownloadFilename(material, "audio"),
  "Ольга Полянская.mp3",
  "cyrillic audio filename preserved",
);

assert.equal(
  resolvePersonalMaterialDownloadFilename(material, "pdf"),
  "Диагностика — Ольга Полянская.pdf",
  "cyrillic pdf filename preserved",
);

assert.equal(
  resolvePersonalMaterialDownloadFilename(
    { audio_original_filename: "  ", pdf_original_filename: null },
    "audio",
  ),
  "audio.mp3",
  "audio fallback filename",
);

assert.equal(
  resolvePersonalMaterialDownloadFilename(
    { audio_original_filename: null, pdf_original_filename: "" },
    "pdf",
  ),
  "document.pdf",
  "pdf fallback filename",
);

console.log("personal-materials-author-download-module-unit: PASS");
