#!/usr/bin/env node
/**
 * PDF attachment unit checks for personal materials.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath) {
  return readFileSync(path.join(ROOT, relativePath), "utf8");
}

function testMigrationAndLimits() {
  const migration = read(
    "supabase/migrations/20260721170000_personal_materials_pdf_support.sql",
  );
  const types = read("src/lib/personal-materials/types.ts");

  assert.match(migration, /v_has_audio/);
  assert.match(migration, /v_has_pdf/);
  assert.match(migration, /clear_personal_material_draft_pdf/);
  assert.match(types, /maxPdfBytes: 20 \* 1024 \* 1024/);
}

function testRoutes() {
  const authorPdf = read("src/app/api/author/personal-materials/[id]/pdf/route.ts");
  const guestPdf = read("src/app/api/d/[token]/pdf/route.ts");
  const ownerPdf = read("src/app/api/my-materials/[id]/pdf/route.ts");

  assert.match(authorPdf, /uploadPersonalMaterialPdf/);
  assert.match(authorPdf, /deletePersonalMaterialPdf/);
  assert.match(authorPdf, /createAuthorPdfSignedUrl/);
  assert.match(guestPdf, /createGuestPdfSignedUrl/);
  assert.match(guestPdf, /enforceGuestPdfRateLimit/);
  assert.match(ownerPdf, /createOwnerPdfSignedUrl/);
  assert.doesNotMatch(authorPdf, /pdf_path/);
  assert.doesNotMatch(guestPdf, /pdf_path/);
}

function testUploadValidation() {
  const uploads = read("src/lib/personal-materials/server/uploads.ts");
  const validation = read("src/lib/personal-materials/server/pdf-validation.ts");
  const clientValidation = read("src/lib/personal-materials/client/validation.ts");

  assert.match(uploads, /validatePdfUpload/);
  assert.match(uploads, /buildPersonalMaterialDocumentPath/);
  assert.match(validation, /%PDF-/);
  assert.match(validation, /application\/pdf/);
  assert.match(clientValidation, /validateClientPdfFile/);
}

function testUi() {
  const guestPage = read("src/components/personal-materials/guest/PersonalMaterialGuestPage.tsx");
  const editor = read("src/components/author-dashboard/personal-materials/AuthorDiagnosticsEditorClient.tsx");
  const detail = read("src/components/personal-materials/library/MyMaterialDetailClient.tsx");
  const player = read("src/components/personal-materials/guest/PersonalMaterialAudioPlayer.tsx");
  const pdfDocument = read("src/components/personal-materials/PersonalMaterialPdfDocument.tsx");

  assert.match(guestPage, /material\.hasPdf/);
  assert.match(guestPage, /material\.hasAudio/);
  assert.match(editor, /AuthorDiagnosticsPdfUpload/);
  assert.match(editor, /hasAttachment/);
  assert.match(detail, /material\.hasPdf/);
  assert.match(player, /if \(!enabled\)/);
  assert.doesNotMatch(pdfDocument, /Скачать PDF/);
  assert.match(pdfDocument, /window\.open\("about:blank", "_blank", "noopener,noreferrer"\)/);
  assert.match(pdfDocument, /previewWindow\.location\.href = payload\.url/);
  assert.match(pdfDocument, /closePreviewWindow\(previewWindow\)/);
}

async function runModuleTests() {
  const { execSync } = await import("node:child_process");
  const output = execSync(
    `npx --yes tsx ${path.join(ROOT, "scripts/personal-materials-pdf-module-unit.mjs")}`,
    { encoding: "utf8" },
  );
  process.stdout.write(output);
}

async function main() {
  testMigrationAndLimits();
  testRoutes();
  testUploadValidation();
  testUi();
  await runModuleTests();
  console.log("personal-materials-pdf-unit: PASS");
}

main().catch((error) => {
  console.error(String(error?.message ?? error));
  process.exit(1);
});
