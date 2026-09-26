#!/usr/bin/env node
/**
 * Author project / workspace name must be Russian Cyrillic.
 * Safe without a database: shared rule, API/source gates, and the SQL function.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { mapAuthorApplicationRpcError } from "../src/lib/admin/author-application-rpc.ts";
import {
  mapStudioProvisionError,
  validateStudioProvisionInput,
} from "../src/lib/admin/studio-author-provisioning.ts";
import {
  normalizeAuthorApplicationFormValues,
  validateAuthorApplicationFormValues,
} from "../src/lib/author-applications/validation.ts";
import {
  AUTHOR_PROJECT_NAME_CYRILLIC_HINT,
  AUTHOR_PROJECT_NAME_CYRILLIC_PLACEHOLDER,
  AUTHOR_PROJECT_NAME_LATIN_CLASS,
  AUTHOR_PROJECT_NAME_LATIN_ERROR,
  getAuthorProjectNameCyrillicError,
} from "../src/lib/author-projects/cyrillic-name.ts";
import { validateAuthorProjectName } from "../src/lib/author-projects/slug.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath) {
  return readFileSync(path.join(ROOT, relativePath), "utf8");
}

function indexBefore(source, earlier, later, label) {
  const earlierAt = source.indexOf(earlier);
  const laterAt = source.indexOf(later);
  assert.ok(earlierAt >= 0, `${label}: missing ${earlier}`);
  assert.ok(laterAt >= 0, `${label}: missing ${later}`);
  assert.ok(earlierAt < laterAt, `${label}: ${earlier} must run before ${later}`);
}

const allowed = [
  "Джаз Релакс",
  "Музыка 528 Гц",
  "Сергей и Зоя",
  "Сергей & Зоя",
  "Ёлка",
  "Джаз-Релакс",
  "Джаз — вечер",
  "Музыка: сон",
  "Проект (вечер)",
  "«Тишина»",
  "Сон, тишина",
  "Джаз + блюз",
];

const rejected = ["Jazz Relax", "Джаз Relax", "Sergey", "  Jazz  "];

for (const name of allowed) {
  assert.equal(getAuthorProjectNameCyrillicError(name), null, name);
  assert.equal(validateAuthorProjectName(name), null, name);
}

for (const name of rejected) {
  assert.equal(
    getAuthorProjectNameCyrillicError(name),
    AUTHOR_PROJECT_NAME_LATIN_ERROR,
    name,
  );
  assert.equal(validateAuthorProjectName(name), AUTHOR_PROJECT_NAME_LATIN_ERROR, name);
}

assert.equal(
  validateAuthorProjectName("А"),
  "Название проекта: от 2 до 80 символов.",
);

function applicationValues(displayName) {
  const formData = new FormData();
  formData.set("displayName", displayName);
  formData.append("directionOptions", "Медитации");
  formData.set(
    "about",
    "Я создаю медитации и практики для спокойствия более десяти лет.",
  );
  formData.set("contactEmail", "author@yandex.ru");
  formData.set("contactDetails", "+7 900 000-00-00");
  formData.set("consentPersonalData", "on");
  return normalizeAuthorApplicationFormValues(formData);
}

assert.equal(
  validateAuthorApplicationFormValues(applicationValues("Джаз Релакс")).displayName,
  undefined,
);
assert.equal(
  validateAuthorApplicationFormValues(applicationValues("Jazz Relax")).displayName,
  AUTHOR_PROJECT_NAME_LATIN_ERROR,
);
assert.equal(
  validateAuthorApplicationFormValues(applicationValues("Sergey")).displayName,
  AUTHOR_PROJECT_NAME_LATIN_ERROR,
);

assert.equal(
  validateStudioProvisionInput({
    name: "Музыка для души",
    slug: "muzyka",
    owner: "author@yandex.ru",
  }).ok,
  true,
);
const studioLatin = validateStudioProvisionInput({
  name: "Jazz Relax",
  slug: "jazz-relax",
  owner: "author@yandex.ru",
});
assert.equal(studioLatin.ok, false);
assert.equal(studioLatin.error, AUTHOR_PROJECT_NAME_LATIN_ERROR);

assert.equal(
  mapAuthorApplicationRpcError(
    "invalid_project_name_latin: Используйте только русские буквы.",
  ),
  AUTHOR_PROJECT_NAME_LATIN_ERROR,
);
assert.equal(
  mapStudioProvisionError("invalid_project_name_latin"),
  AUTHOR_PROJECT_NAME_LATIN_ERROR,
);

function apiBypassRejection(name) {
  const message = validateAuthorProjectName(name.trim());
  if (!message) {
    return null;
  }
  return { error: "invalid_project_name", message, status: 400 };
}

assert.equal(apiBypassRejection("Джаз Релакс"), null);
assert.equal(apiBypassRejection("Музыка 528 Гц"), null);
assert.equal(apiBypassRejection("Сергей и Зоя"), null);
assert.deepEqual(apiBypassRejection("Jazz Relax"), {
  error: "invalid_project_name",
  message: AUTHOR_PROJECT_NAME_LATIN_ERROR,
  status: 400,
});
assert.deepEqual(apiBypassRejection("Джаз Relax"), {
  error: "invalid_project_name",
  message: AUTHOR_PROJECT_NAME_LATIN_ERROR,
  status: 400,
});
assert.deepEqual(apiBypassRejection("Sergey"), {
  error: "invalid_project_name",
  message: AUTHOR_PROJECT_NAME_LATIN_ERROR,
  status: 400,
});

const projectsRoute = read("src/app/api/author/projects/route.ts");
const projectsPost = projectsRoute.slice(projectsRoute.indexOf("export async function POST"));
indexBefore(
  projectsPost,
  "validateAuthorProjectName",
  "createAuthorProjectViaRpc",
  "create project API",
);
assert.match(projectsRoute, /error: "invalid_project_name", message: nameError/);
assert.match(projectsRoute, /invalid_project_name_latin/);

const profileRoute = read("src/app/api/author/profile/route.ts");
const profilePatch = profileRoute.slice(profileRoute.indexOf("export async function PATCH"));
indexBefore(
  profilePatch,
  "getAuthorProjectNameCyrillicError",
  '.from("authors")',
  "rename project API",
);
assert.match(profileRoute, /error: "invalid_project_name"/);
assert.match(profileRoute, /invalid_project_name_latin/);

const createForm = read("src/components/author-dashboard/AuthorCreateProjectForm.tsx");
const profileForm = read("src/components/author-dashboard/AuthorProfileClient.tsx");
const applicationForm = read("src/components/become-author/AuthorApplicationPanel.tsx");
const studioForm = read("src/components/admin/CreateStudioWorkspaceForm.tsx");

for (const source of [createForm, profileForm, applicationForm, studioForm]) {
  assert.match(source, /AUTHOR_PROJECT_NAME_CYRILLIC_HINT/);
  assert.match(source, /getAuthorProjectNameCyrillicError/);
  assert.match(source, /AUTHOR_PROJECT_NAME_CYRILLIC_PLACEHOLDER/);
}

assert.equal(
  AUTHOR_PROJECT_NAME_CYRILLIC_HINT,
  "Название проекта – только на русском языке, кириллицей.",
);
assert.equal(
  AUTHOR_PROJECT_NAME_CYRILLIC_PLACEHOLDER,
  "Например: Музыка для души",
);

const migration = read(
  "supabase/migrations/20261126120000_author_project_name_cyrillic.sql",
);
assert.match(migration, /assert_author_project_name_cyrillic/);
assert.match(migration, /authors_enforce_cyrillic_project_name/);
assert.match(
  migration,
  /BEFORE INSERT OR UPDATE OF name ON public\.authors/,
);
assert.match(
  migration,
  new RegExp(AUTHOR_PROJECT_NAME_LATIN_CLASS.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
);
assert.doesNotMatch(migration, /\[A-Za-z\]/);
assert.doesNotMatch(migration, /^\s*UPDATE\b/im);

const cyrillicSource = read("src/lib/author-projects/cyrillic-name.ts");
assert.match(cyrillicSource, new RegExp(AUTHOR_PROJECT_NAME_LATIN_CLASS));

const applicationValidation = read("src/lib/author-applications/validation.ts");
const applicationValidate = applicationValidation.slice(
  applicationValidation.indexOf("export function validateAuthorApplicationFormValues"),
);
indexBefore(
  applicationValidate,
  "getAuthorProjectNameCyrillicError",
  "displayNameMin",
  "application validation",
);

const studioValidation = read("src/lib/admin/studio-author-provisioning.ts");
const studioValidate = studioValidation.slice(
  studioValidation.indexOf("export function validateStudioProvisionInput"),
);
indexBefore(
  studioValidate,
  "getAuthorProjectNameCyrillicError",
  "Название студии должно содержать",
  "studio provisioning",
);

console.log("author-project-cyrillic-name-unit: ok");
