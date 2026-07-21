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

  assert(nav.includes('label: "Личная работа"'), "nav personal work item");
  assert(nav.includes("/author-dashboard/diagnostics"), "nav diagnostics href");
  assert(nav.indexOf("Продукты") < nav.indexOf("Личная работа"), "nav order products before personal work");
  assert(nav.indexOf("Личная работа") < nav.indexOf("Страница автора"), "nav order personal work before profile");
  assert(!nav.includes('label: "Диагностики"'), "old diagnostics section label removed");

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
  assert(list.includes("Здесь появятся персональные материалы"), "empty state");
  assert(list.includes("Создать личный материал"), "empty CTA");
  assert(list.includes("Создать личный материал"), "create button");
  assert(!list.includes("Создать диагностику"), "old create label removed");
  assert(!list.includes("Пока нет диагностик"), "old empty title removed");
  assert(list.includes("LoadingSkeleton"), "loading skeleton");
  assert(list.includes("Повторить"), "retry");
  assert(list.includes("break-words"), "long name wrapping");
  assert(list.includes("router.replace(`/author-dashboard/diagnostics"), "author switch reloads list");
}

function testCreateComponent() {
  const create = read("src/components/author-dashboard/personal-materials/AuthorDiagnosticsCreateClient.tsx");

  assert(create.includes("Сохранить и перейти к аудио"), "draft-first submit to audio");
  assert(create.includes("Сначала сохраните основную информацию"), "upload gated until draft");
  assert(create.includes("Загрузить аудиофайл"), "create shows audio placeholder");
  assert(create.includes("#audio"), "redirect to editor audio anchor");
  assert(!create.includes("Создать черновик"), "old draft-only submit removed");
  assert(create.includes("submittingRef"), "double-submit guard");
  assert(create.includes("createAuthorPersonalMaterial"), "POST create");
  assert(create.includes("router.replace"), "redirect after create");
  assert(create.includes("returnUrl"), "create passes return url");
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
  assert(editor.includes("returnUrl"), "editor saves return url");

  assert(upload.includes("isAllowedClientMp3File"), "client mp3 validation");
  assert(upload.includes("accept=\".mp3,audio/mpeg,audio/mp3,application/octet-stream\""), "mp3 accept");
  assert(upload.includes("break-all"), "filename wrap");
  assert(upload.includes("Загрузить аудиофайл"), "upload CTA");
  assert(upload.includes("Аудиофайл загружен"), "upload success label");
  assert(upload.includes("Заменить файл"), "replace action");
  assert(upload.includes("Удалить файл"), "delete action");
  assert(upload.includes('id="personal-material-audio"'), "audio anchor id");
  assert(editor.includes("Сначала загрузите аудиофайл"), "activate without audio hint");
  assert(editor.includes('hash !== "#audio"'), "scroll to audio after create");

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

  assert(form.includes("returnUrl"), "form return url field");
  assert(form.includes("htmlFor"), "labels linked to inputs");
  assert(form.includes("Возврат в чат"), "return chat section");
  assert(form.includes("break-words"), "long label wrap");

  const guestCta = read("src/components/personal-materials/PersonalMaterialReturnChatCta.tsx");
  assert(guestCta.includes("shouldShowGuestReturnChatButton"), "guest cta guard");
  assert(guestCta.includes('rel="noopener noreferrer"'), "guest cta rel");
  assert(guestCta.includes("getGuestReturnButtonLabel"), "guest default label");
  assert(!guestCta.includes("dangerouslySetInnerHTML"), "no dangerous html");
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

function testReturnUrlLayer() {
  const migration = read("supabase/migrations/20260720180000_personal_materials_return_url.sql");
  const returnUrlLib = read("src/lib/personal-materials/return-url.ts");
  const dto = read("src/lib/personal-materials/server/dto.ts");

  assert(migration.includes("return_url text NULL"), "migration return_url column");
  assert(migration.includes("return_button_label text NULL"), "migration return_button_label column");
  assert(migration.includes("invalid_return_url"), "migration url validation");
  assert(returnUrlLib.includes("javascript:"), "blocked schemes");
  assert(dto.includes("returnUrl: row.return_url"), "author dto return url");
  assert(dto.includes("returnButtonLabel: input.material.return_button_label"), "guest dto return label");
}

async function runModuleTests() {
  const { execSync } = await import("node:child_process");
  for (const script of [
    "scripts/stage-p3-personal-materials-author-ui-module-unit.mjs",
    "scripts/stage-p3-personal-materials-return-url-module-unit.mjs",
  ]) {
    const output = execSync(`npx --yes tsx ${path.join(ROOT, script)}`, { encoding: "utf8" });
    process.stdout.write(output);
  }
}

async function main() {
  testRoutesAndNav();
  testClientLayer();
  testListComponent();
  testCreateComponent();
  testEditorComponent();
  testResponsiveClasses();
  testReturnUrlLayer();
  testAccessibility();
  testSecurityNoPersistence();
  await runModuleTests();
  console.log("stage-p3-personal-materials-author-ui-unit: PASS");
}

main().catch((error) => {
  console.error(String(error?.message ?? error));
  process.exit(1);
});
