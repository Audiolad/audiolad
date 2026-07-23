#!/usr/bin/env node
/**
 * Unit checks for author personal material attachment download.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function read(relativePath) {
  return readFileSync(path.join(ROOT, relativePath), "utf8");
}

function testDownloadRoutes() {
  const audioDownload = read(
    "src/app/api/author/personal-materials/[id]/audio/download/route.ts",
  );
  const pdfDownload = read(
    "src/app/api/author/personal-materials/[id]/pdf/download/route.ts",
  );

  assert(audioDownload.includes("requirePersonalMaterialAccess"), "audio download auth");
  assert(audioDownload.includes('createAuthorAttachmentDownloadSignedUrl(material, "audio")'), "audio kind from db");
  assert(audioDownload.includes("redirectToAttachmentDownload"), "audio redirect download");
  assert(!audioDownload.includes("searchParams"), "audio no client path param");
  assert(!audioDownload.includes("storagePath"), "audio no client storage path");

  assert(pdfDownload.includes("requirePersonalMaterialAccess"), "pdf download auth");
  assert(pdfDownload.includes('createAuthorAttachmentDownloadSignedUrl(material, "pdf")'), "pdf kind from db");
  assert(pdfDownload.includes("redirectToAttachmentDownload"), "pdf redirect download");
  assert(!pdfDownload.includes("searchParams"), "pdf no client path param");
}

function testDownloadServerLayer() {
  const download = read("src/lib/personal-materials/server/download.ts");

  assert(download.includes("resolvePersonalMaterialDownloadFilename"), "filename helper");
  assert(download.includes("audio_original_filename"), "audio original filename");
  assert(download.includes("pdf_original_filename"), "pdf original filename");
  assert(download.includes("getTrustedAttachmentPath"), "trusted path only");
  assert(download.includes("isPathInsidePersonalMaterialRoot"), "path guard");
  assert(download.includes('download: filename'), "signed url download disposition");
  assert(download.includes("PERSONAL_MATERIALS_BUCKET"), "private bucket");
  assert(download.includes("createServiceRoleClient"), "service role signing");
  assert(download.includes('material.status === "deleted"'), "deleted guard");
  assert(!download.includes("service_role"), "no secret leak");
}

function testClientDownloadLayer() {
  const clientDownload = read("src/lib/personal-materials/client/download.ts");

  assert(clientDownload.includes("downloadAuthorPersonalMaterialAudio"), "audio client download");
  assert(clientDownload.includes("downloadAuthorPersonalMaterialPdf"), "pdf client download");
  assert(clientDownload.includes('redirect: "manual"'), "manual redirect for errors");
  assert(clientDownload.includes("/audio/download"), "audio download endpoint");
  assert(clientDownload.includes("/pdf/download"), "pdf download endpoint");
  assert(!clientDownload.includes("storage"), "client no storage path");
}

function testUploadUi() {
  const audioUpload = read(
    "src/components/author-dashboard/personal-materials/AuthorDiagnosticsAudioUpload.tsx",
  );
  const pdfUpload = read(
    "src/components/author-dashboard/personal-materials/AuthorDiagnosticsPdfUpload.tsx",
  );
  const editor = read(
    "src/components/author-dashboard/personal-materials/AuthorDiagnosticsEditorClient.tsx",
  );

  assert(audioUpload.includes("Скачать файл"), "audio download button");
  assert(audioUpload.includes("Скачивание…"), "audio downloading state");
  assert(audioUpload.includes("flex-wrap"), "audio buttons wrap on mobile");
  assert(audioUpload.indexOf("Заменить файл") < audioUpload.indexOf("Скачать файл"), "audio replace before download");
  assert(audioUpload.indexOf("Скачать файл") < audioUpload.indexOf("Удалить файл"), "audio download before delete");
  assert(audioUpload.includes("onDownload"), "audio onDownload prop");
  assert(!audioUpload.includes("Скачать файл") || audioUpload.includes("{hasAudio ?"), "download only when uploaded");

  assert(pdfUpload.includes("Скачать файл"), "pdf download button");
  assert(pdfUpload.includes("Заменить файл"), "pdf replace label");
  assert(pdfUpload.includes("Удалить файл"), "pdf delete label");
  assert(pdfUpload.indexOf("Заменить файл") < pdfUpload.indexOf("Скачать файл"), "pdf replace before download");
  assert(pdfUpload.indexOf("Скачать файл") < pdfUpload.indexOf("Удалить файл"), "pdf download before delete");

  assert(editor.includes("downloadAuthorPersonalMaterialAudio"), "editor audio download wiring");
  assert(editor.includes("downloadAuthorPersonalMaterialPdf"), "editor pdf download wiring");
  assert(editor.includes("onDownload={handleDownloadAudio}"), "editor passes audio download");
  assert(editor.includes("onDownload={handleDownloadPdf}"), "editor passes pdf download");
  assert(editor.includes("onDelete={handleDeleteAudio}"), "replace/delete still wired");
  assert(editor.includes("onDelete={handleDeletePdf}"), "pdf delete still wired");
}

function testAccessAndErrors() {
  const auth = read("src/lib/personal-materials/server/auth.ts");
  const errors = read("src/lib/personal-materials/client/errors.ts");

  assert(auth.includes("author_members"), "membership check");
  assert(auth.includes("requireAuthenticatedUser"), "session required");

  assert(errors.includes("unauthorized"), "unauthorized message");
  assert(errors.includes("forbidden"), "forbidden message");
  assert(errors.includes("not_found"), "not found message");
}

async function runModuleTests() {
  const { execSync } = await import("node:child_process");
  const output = execSync(
    `npx --yes tsx ${path.join(ROOT, "scripts/personal-materials-author-download-module-unit.mjs")}`,
    { encoding: "utf8" },
  );
  process.stdout.write(output);
}

async function main() {
  testDownloadRoutes();
  testDownloadServerLayer();
  testClientDownloadLayer();
  testUploadUi();
  testAccessAndErrors();
  await runModuleTests();
  console.log("personal-materials-author-download-unit: PASS");
}

main().catch((error) => {
  console.error(String(error?.message ?? error));
  process.exit(1);
});
