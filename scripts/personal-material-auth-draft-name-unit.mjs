#!/usr/bin/env node
/**
 * Targeted checks: short auth toggles + optional draft first name.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function read(relativePath) {
  return readFileSync(path.join(ROOT, relativePath), "utf8");
}

function testAuthLabels() {
  const saveCta = read(
    "src/components/personal-materials/guest/PersonalMaterialSaveCta.tsx",
  );
  assert(saveCta.includes("\n          Создать\n"), "toggle Создать");
  assert(saveCta.includes("\n          Войти\n"), "toggle Войти");
  assert(saveCta.includes("Создать кабинет и сохранить диагностику"), "register CTA kept");
  assert(saveCta.includes("Войти и сохранить диагностику"), "login CTA kept");
  assert(!saveCta.includes("Зарегистрироваться"), "long register removed");
  assert(!saveCta.includes("Уже есть аккаунт"), "long login removed");
}

function testDraftName() {
  const migration = read(
    "supabase/migrations/20260721160000_personal_materials_optional_draft_first_name.sql",
  );
  const validation = read("src/lib/personal-materials/server/validation.ts");
  const clientValidation = read("src/lib/personal-materials/client/validation.ts");
  const activate = read(
    "src/app/api/author/personal-materials/[id]/activate/route.ts",
  );
  const instantiate = read(
    "src/app/api/author/personal-material-templates/[id]/instantiate/route.ts",
  );
  const form = read(
    "src/components/author-dashboard/personal-materials/AuthorDiagnosticsFormFields.tsx",
  );
  const editor = read(
    "src/components/author-dashboard/personal-materials/AuthorDiagnosticsEditorClient.tsx",
  );
  const greeting = read("src/lib/personal-materials/guest/display.ts");

  assert(migration.includes("DROP NOT NULL"), "nullable first name");
  assert(migration.includes("client_name_required"), "activate RPC name required");
  assert(migration.includes("status IN ('draft', 'deleted')"), "draft may be empty");
  assert(validation.includes("normalizeOptionalClientName"), "create allows empty name");
  assert(!validation.includes("requireNonEmptyText"), "no forced non-empty create");
  assert(clientValidation.includes("requireClientFirstName"), "activate client helper");
  assert(activate.includes("client_name_required"), "activate API name check");
  assert(instantiate.includes("clientFirstName: null"), "template instantiate empty");
  assert(!instantiate.includes('"Клиент"'), "no Клиент placeholder");
  assert(form.includes('placeholder="Имя клиента"'), "placeholder");
  assert(editor.includes("requireClientFirstName"), "editor blocks activate");
  assert(greeting.includes('return "Эта аудиодиагностика подготовлена специально для вас"'), "no Клиент greeting fallback");
}

function testParseModules() {
  const output = execSync(
    `npx --yes tsx ${path.join(ROOT, "scripts/stage-p2-personal-materials-api-module-unit.mjs")}`,
    { encoding: "utf8" },
  );
  process.stdout.write(output);
}

testAuthLabels();
testDraftName();
testParseModules();
console.log("personal-material-auth-draft-name-unit: PASS");
