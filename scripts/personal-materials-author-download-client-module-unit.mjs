#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { getPersonalMaterialDownloadErrorMessage } from "../src/lib/personal-materials/client/errors.ts";
import { PersonalMaterialClientError } from "../src/lib/personal-materials/client/errors.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const clientDownload = readFileSync(
  path.join(ROOT, "src/lib/personal-materials/client/download.ts"),
  "utf8",
);

assert.ok(clientDownload.includes('Accept: "application/json"'));
assert.ok(clientDownload.includes("triggerBrowserDownload"));
assert.ok(clientDownload.includes("anchor.download = filename"));
assert.ok(clientDownload.includes("sanitizePersonalMaterialDownloadFilename"));
assert.ok(!clientDownload.includes('redirect: "manual"'));
assert.ok(!clientDownload.includes("response.blob"));

assert.equal(
  getPersonalMaterialDownloadErrorMessage(new PersonalMaterialClientError("unauthorized", 401)),
  "Сессия истекла. Войдите снова.",
);

assert.equal(
  getPersonalMaterialDownloadErrorMessage(new PersonalMaterialClientError("forbidden", 403)),
  "Нет доступа к этому материалу.",
);

assert.equal(
  getPersonalMaterialDownloadErrorMessage(new PersonalMaterialClientError("not_found", 404)),
  "Файл не найден.",
);

assert.equal(
  getPersonalMaterialDownloadErrorMessage(new PersonalMaterialClientError("internal_error", 500)),
  "Не удалось подготовить файл к скачиванию.",
);

console.log("personal-materials-author-download-client-module-unit: PASS");
