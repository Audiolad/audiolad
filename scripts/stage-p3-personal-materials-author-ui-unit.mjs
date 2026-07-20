#!/usr/bin/env node
/**
 * P3 unit checks for personal materials author UI.
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

function testRoutesAndNav() {
  const nav = read("src/components/author-dashboard/AuthorDashboardNav.tsx");
  const listPage = read("src/app/author-dashboard/diagnostics/page.tsx");
  const newPage = read("src/app/author-dashboard/diagnostics/new/page.tsx");
  const editPage = read("src/app/author-dashboard/diagnostics/[id]/page.tsx");

  assert(nav.includes('label: "Диагностики"'), "nav diagnostics item");
  assert(nav.includes("/author-dashboard/diagnostics"), "nav diagnostics href");
  assert(nav.indexOf("Продукты") < nav.indexOf("Диагностики"), "nav order products before diagnostics");
  assert(nav.indexOf("Диагностики") < nav.indexOf("Страница автора"), "nav order diagnostics before profile");

  assert(listPage.includes("AuthorDiagnosticsClient"), "list page client");
  assert(newPage.includes("AuthorDiagnosticsCreateClient"), "new page client");
  assert(editPage.includes("AuthorDiagnosticsEditorClient"), "edit page client");
}

function testClientLayer() {
  const api = read("src/lib/personal-materials/client/api.ts");
  const errors = read("src/lib/personal-materials/client/errors.ts");
  const oneTime = read("src/lib/personal-materials/client/one-time-access.ts");

  assert(api.includes("listAuthorPersonalMaterials"), "list api");
  assert(api.includes("createAuthorPersonalMaterial"), "create api");
  assert(api.includes("uploadAuthorPersonalMaterialAudio"), "upload api multipart");
  assert(api.includes("activateAuthorPersonalMaterial"), "activate api");
  assert(api.includes("rotateAuthorPersonalMaterial"), "rotate api");
  assert(api.includes("cache: \"no-store\""), "no-store requests");
  assert(!api.includes("console.log"), "api no logging");

  assert(errors.includes("forbidden"), "forbidden message");
  assert(!errors.includes("SQL"), "no sql in errors");

  assert(oneTime.includes("Intentionally no-op"), "one-time access not persisted");
}

function testListComponent() {
  const list = read("src/components/author-dashboard/personal-materials/AuthorDiagnosticsClient.tsx");

  assert(list.includes("listAuthorPersonalMaterials"), "list fetch");
  assert(list.includes("Здесь появятся персональные аудиодиагностики"), "empty state");
  assert(list.includes("Создать первую диагностику"), "empty CTA");
  assert(list.includes("LoadingSkeleton"), "loading skeleton");
  assert(list.includes("Повторить"), "retry");
  assert(list.includes("break-words"), "long name wrapping");
  assert(list.includes("router.replace(`/author-dashboard/diagnostics"), "author switch reloads list");
}

function testCreateComponent() {
  const create = read("src/components/author-dashboard/personal-materials/AuthorDiagnosticsCreateClient.tsx");

  assert(create.includes("Создать черновик"), "draft-first submit");
  assert(create.includes("submittingRef"), "double-submit guard");
  assert(create.includes("createAuthorPersonalMaterial"), "POST create");
  assert(create.includes("router.replace"), "redirect after create");
  assert(!create.includes("uploadAuthorPersonalMaterialAudio"), "no upload before create");
}

function testEditorComponent() {
  const editor = read("src/components/author-dashboard/personal-materials/AuthorDiagnosticsEditorClient.tsx");
  const upload = read("src/components/author-dashboard/personal-materials/AuthorDiagnosticsAudioUpload.tsx");
  const oneTime = read("src/components/author-dashboard/personal-materials/AuthorDiagnosticsOneTimeLinkPanel.tsx");

  assert(editor.includes("updateAuthorPersonalMaterial"), "PATCH save");
  assert(editor.includes("activateAuthorPersonalMaterial"), "activate");
  assert(editor.includes("rotateAuthorPersonalMaterial"), "rotate");
  assert(editor.includes("revokeAuthorPersonalMaterial"), "revoke");
  assert(editor.includes("deleteAuthorPersonalMaterial"), "delete");
  assert(editor.includes("setOneTimeAccessUrl"), "one-time url in state only");
  assert(editor.includes("Персональная ссылка показывается только один раз"), "no fake link on reload");
  assert(editor.includes("material.authorId !== selectedAuthor.id"), "author workspace guard");
  assert(editor.includes("isDirty"), "dirty indicator");

  assert(upload.includes("isAllowedClientMp3File"), "client mp3 validation");
  assert(upload.includes("accept=\".mp3,audio/mpeg\""), "mp3 accept");
  assert(upload.includes("break-all"), "filename wrap");

  assert(oneTime.includes("copyTextToClipboard"), "clipboard copy");
  assert(oneTime.includes("openExternalUrl"), "open link action");
  const clipboard = read("src/lib/personal-materials/client/clipboard.ts");
  assert(clipboard.includes("noopener,noreferrer"), "open link privacy");
  assert(oneTime.includes("Ссылка скопирована"), "copy feedback");
  assert(oneTime.includes("break-all"), "long url wrap");
}

function testResponsiveClasses() {
  const shell = read("src/components/author-dashboard/AuthorShell.tsx");
  const list = read("src/components/author-dashboard/personal-materials/AuthorDiagnosticsClient.tsx");
  const editor = read("src/components/author-dashboard/personal-materials/AuthorDiagnosticsEditorClient.tsx");

  assert(shell.includes("min-w-0"), "shell min-w-0");
  assert(shell.includes("truncate"), "shell truncate");
  assert(list.includes("flex-col"), "list mobile stack");
  assert(editor.includes("flex-col gap-3"), "editor mobile actions");
}

function testAccessibility() {
  const form = read("src/components/author-dashboard/personal-materials/AuthorDiagnosticsFormFields.tsx");
  const modal = read("src/components/author-dashboard/personal-materials/AuthorDiagnosticsConfirmModal.tsx");
  const upload = read("src/components/author-dashboard/personal-materials/AuthorDiagnosticsAudioUpload.tsx");

  assert(form.includes("htmlFor") || form.includes("<label"), "labels");
  assert(modal.includes("role=\"dialog\""), "modal dialog");
  assert(modal.includes("aria-modal=\"true\""), "modal aria");
  assert(upload.includes("aria-live"), "upload live region");
}

function testSecurityNoPersistence() {
  const editor = read("src/components/author-dashboard/personal-materials/AuthorDiagnosticsEditorClient.tsx");
  const api = read("src/lib/personal-materials/client/api.ts");

  assert(!editor.includes("localStorage"), "editor no localStorage");
  assert(!editor.includes("sessionStorage"), "editor no sessionStorage");
  assert(!api.includes("accessUrl"), "api client does not log accessUrl");
}

async function runModuleTests() {
  const { execSync } = await import("node:child_process");
  const output = execSync(
    `npx --yes tsx ${path.join(ROOT, "scripts/stage-p3-personal-materials-author-ui-module-unit.mjs")}`,
    { encoding: "utf8" },
  );
  process.stdout.write(output);
}

async function main() {
  testRoutesAndNav();
  testClientLayer();
  testListComponent();
  testCreateComponent();
  testEditorComponent();
  testResponsiveClasses();
  testAccessibility();
  testSecurityNoPersistence();
  await runModuleTests();
  console.log("stage-p3-personal-materials-author-ui-unit: PASS");
}

main().catch((error) => {
  console.error(String(error?.message ?? error));
  process.exit(1);
});
