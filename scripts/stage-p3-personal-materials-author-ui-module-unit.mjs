#!/usr/bin/env node
import assert from "node:assert/strict";

import {
  getPersonalMaterialStatusLabel,
  getPersonalMaterialTypeLabel,
  resolvePersonalMaterialUiStatus,
  PERSONAL_MATERIAL_TYPE_OPTIONS,
} from "../src/lib/personal-materials/client/status-labels.ts";
import {
  formatFileSize,
  isAllowedClientMp3File,
  validatePersonalMaterialForm,
} from "../src/lib/personal-materials/client/validation.ts";
import { mapPersonalMaterialClientError } from "../src/lib/personal-materials/client/errors.ts";
import { assertOneTimeAccessNotPersisted } from "../src/lib/personal-materials/client/one-time-access.ts";
import { copyTextToClipboard } from "../src/lib/personal-materials/client/clipboard.ts";

assert.equal(PERSONAL_MATERIAL_TYPE_OPTIONS[0].label, "Диагностика");
assert.equal(PERSONAL_MATERIAL_TYPE_OPTIONS[1].label, "Аудиоразбор");
assert.equal(PERSONAL_MATERIAL_TYPE_OPTIONS[2].label, "Персональная медитация");
assert.equal(
  PERSONAL_MATERIAL_TYPE_OPTIONS.find((o) => o.value === "consultation_material")?.label,
  "Материал после консультации",
);
assert.equal(
  PERSONAL_MATERIAL_TYPE_OPTIONS.find((o) => o.value === "personal_music")?.label,
  "Персональная музыка",
);
assert.equal(PERSONAL_MATERIAL_TYPE_OPTIONS.find((o) => o.value === "other")?.label, "Другое");
assert.equal(getPersonalMaterialTypeLabel("diagnostic"), "Диагностика");
assert.equal(PERSONAL_MATERIAL_TYPE_OPTIONS[0].value, "diagnostic");

assert.equal(
  resolvePersonalMaterialUiStatus({ status: "draft", claimed: false }),
  "draft",
);
assert.equal(
  getPersonalMaterialStatusLabel({ status: "draft", claimed: false }),
  "Черновик",
);
assert.equal(
  getPersonalMaterialStatusLabel({ status: "active", claimed: false }),
  "Активна",
);
assert.equal(
  getPersonalMaterialStatusLabel({ status: "active", claimed: true }),
  "Сохранена клиентом",
);
assert.equal(
  getPersonalMaterialStatusLabel({ status: "revoked", claimed: false }),
  "Доступ отозван",
);

const validNoLastName = validatePersonalMaterialForm({
  materialType: "diagnostic",
  clientFirstName: "Райля",
  clientLastName: "",
  materialDate: "2026-07-15",
  title: "",
  description: "",
  personalRecommendation: "",
  returnUrl: "",
  returnButtonLabel: "",
});
assert.equal(Object.keys(validNoLastName).length, 0);

const valid = validatePersonalMaterialForm({
  materialType: "diagnostic",
  clientFirstName: "Anna",
  clientLastName: "Ivanova",
  materialDate: "2026-07-15",
  title: "",
  description: "",
  personalRecommendation: "",
  returnUrl: "",
  returnButtonLabel: "",
});
assert.equal(Object.keys(valid).length, 0);

const invalid = validatePersonalMaterialForm({
  materialType: "diagnostic",
  clientFirstName: "Bad<script>",
  clientLastName: "Ivanova",
  materialDate: "2026-07-15",
  title: "",
  description: "",
  personalRecommendation: "",
  returnUrl: "",
  returnButtonLabel: "",
});
assert.ok(invalid.clientFirstName);

assert.equal(isAllowedClientMp3File({ name: "test.mp3", type: "audio/mpeg", size: 1000 }), true);
assert.equal(isAllowedClientMp3File({ name: "Райля.mp3", type: "", size: 1000 }), true);
assert.equal(
  isAllowedClientMp3File({ name: "Райля.mp3", type: "application/octet-stream", size: 1000 }),
  true,
);
assert.equal(isAllowedClientMp3File({ name: "test.pdf", type: "application/pdf", size: 1000 }), false);

assert.equal(formatFileSize(1024 * 1024 * 2.5), "2.5 МБ");

const mapped = mapPersonalMaterialClientError("forbidden", 403);
assert.equal(mapped.code, "forbidden");
assert.equal(mapped.status, 403);

assert.equal(assertOneTimeAccessNotPersisted(), true);

if (typeof globalThis.window !== "undefined") {
  const copied = await copyTextToClipboard("https://example.test/link");
  assert.equal(typeof copied, "boolean");
}

console.log("stage-p3-personal-materials-author-ui-module-unit: PASS");
