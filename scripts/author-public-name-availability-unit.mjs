#!/usr/bin/env node
/**
 * Exact author-name duplicates: normalization, claim matching, and the
 * availability endpoint contract. No database and no personal data.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { AUTHOR_APPLICATION_STATUSES } from "../src/lib/author-applications/types.ts";
import { isAuthorPublicNameCheckRateLimited } from "../src/lib/author-names/rate-limit.ts";
import {
  AUTHOR_PUBLIC_NAME_CHECK_DEBOUNCE_MS,
  AUTHOR_PUBLIC_NAME_CHECK_FAILED_MESSAGE,
  AUTHOR_PUBLIC_NAME_RESERVED_APPLICATION_STATUSES,
  AUTHOR_PUBLIC_NAME_TAKEN_MESSAGE,
  authorNameAvailabilityBody,
  authorPublicNamesMatch,
  isAuthorPublicNameTakenInClaims,
  isReservedAuthorApplicationStatus,
  normalizeAuthorPublicName,
} from "../src/lib/author-names/public-name.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath) {
  return readFileSync(path.join(ROOT, relativePath), "utf8");
}

const takenName = "Музыка для медитации";

assert.equal(normalizeAuthorPublicName(`  ${takenName}  `), "музыка для медитации");
assert.equal(
  normalizeAuthorPublicName("Музыка   для\t\nмедитации"),
  "музыка для медитации",
);
assert.equal(normalizeAuthorPublicName("МУЗЫКА ДЛЯ МЕДИТАЦИИ"), "музыка для медитации");
assert.equal(normalizeAuthorPublicName("«Музыка для медитации»"), "музыка для медитации");
assert.equal(normalizeAuthorPublicName('"Музыка для медитации"'), "музыка для медитации");
assert.equal(
  normalizeAuthorPublicName("« « Музыка для медитации » »"),
  "музыка для медитации",
);
assert.equal(normalizeAuthorPublicName("Ёлка"), normalizeAuthorPublicName("Елка"));
assert.equal(normalizeAuthorPublicName("мёд"), normalizeAuthorPublicName("мед"));
assert.equal(authorPublicNamesMatch("  Ёлка ", "«елка»"), true);

assert.equal(
  authorPublicNamesMatch("Музыка для медитаций", "Музыка для медитации"),
  false,
);
assert.equal(
  authorPublicNamesMatch("Музыка «для» медитации", "Музыка для медитации"),
  false,
);
assert.equal(authorPublicNamesMatch("Музыка.", "Музыка"), false);
assert.equal(authorPublicNamesMatch("мой", "мои"), false);
assert.equal(normalizeAuthorPublicName("   "), "");
assert.equal(authorPublicNamesMatch("", "Музыка"), false);

const claims = [
  {
    kind: "author",
    id: "author-1",
    normalizedName: normalizeAuthorPublicName(takenName),
  },
  {
    kind: "application",
    id: "app-1",
    normalizedName: normalizeAuthorPublicName("Тишина"),
  },
  {
    kind: "application",
    id: "app-own",
    normalizedName: normalizeAuthorPublicName(takenName),
  },
];

assert.equal(isAuthorPublicNameTakenInClaims("«музыка   для медитации»", claims), true);
assert.equal(
  isAuthorPublicNameTakenInClaims("Музыка для медитаций", claims),
  false,
);
assert.equal(
  isAuthorPublicNameTakenInClaims(takenName, claims, {
    applicationIds: ["app-own"],
  }),
  true,
  "another workspace still holds the name",
);
assert.equal(
  isAuthorPublicNameTakenInClaims("Тишина", claims, { applicationIds: ["app-1"] }),
  false,
);
assert.equal(
  isAuthorPublicNameTakenInClaims(takenName, claims, { authorIds: ["author-1"] }),
  true,
  "own application still holds the name when the workspace is excluded",
);
assert.equal(
  isAuthorPublicNameTakenInClaims(takenName, claims, {
    authorIds: ["author-1"],
    applicationIds: ["app-own"],
  }),
  false,
);
assert.equal(isAuthorPublicNameTakenInClaims("   ", claims), false);

for (const status of AUTHOR_PUBLIC_NAME_RESERVED_APPLICATION_STATUSES) {
  assert.equal(isReservedAuthorApplicationStatus(status), true);
  assert.ok(AUTHOR_APPLICATION_STATUSES.includes(status));
}

for (const status of ["rejected", "withdrawn", "draft"]) {
  assert.equal(isReservedAuthorApplicationStatus(status), false);
  assert.equal(
    AUTHOR_PUBLIC_NAME_RESERVED_APPLICATION_STATUSES.includes(status),
    false,
  );
}

assert.equal(
  AUTHOR_PUBLIC_NAME_TAKEN_MESSAGE,
  "Такое название уже занято, придумайте другое",
);
assert.equal(AUTHOR_PUBLIC_NAME_TAKEN_MESSAGE.includes("\u2014"), false);
assert.equal(AUTHOR_PUBLIC_NAME_CHECK_FAILED_MESSAGE.includes("\u2014"), false);
assert.equal(AUTHOR_PUBLIC_NAME_CHECK_DEBOUNCE_MS, 400);

const availableBody = authorNameAvailabilityBody(true);
const takenBody = authorNameAvailabilityBody(false);
assert.deepEqual(availableBody, { available: true });
assert.deepEqual(takenBody, { available: false });
assert.deepEqual(Object.keys(availableBody), ["available"]);
assert.deepEqual(Object.keys(takenBody), ["available"]);

const rateRequest = new Request("https://audiolad.ru/api/author/name-availability", {
  headers: { "x-real-ip": "203.0.113.44" },
});
const rateUserId = "availability-unit-user";
for (let attempt = 0; attempt < 60; attempt += 1) {
  assert.equal(isAuthorPublicNameCheckRateLimited(rateRequest, rateUserId), false);
}
assert.equal(isAuthorPublicNameCheckRateLimited(rateRequest, rateUserId), true);

const route = read("src/app/api/author/name-availability/route.ts");
assert.match(route, /export async function POST/);
assert.doesNotMatch(route, /export async function GET/);
assert.match(route, /authorNameAvailabilityBody/);
assert.match(route, /isAuthorPublicNameCheckRateLimited/);
assert.match(route, /status: 429|429/);
assert.match(route, /private, no-store/);
assert.match(route, /authors\.manage/);
assert.match(route, /\.select\("role"\)/);
assert.doesNotMatch(route, /\.select\([^)]*(email|phone|display_name|contact|user_id|full_name)/);
assert.doesNotMatch(route, /json\(\{[^}]*(email|phone|display_name|user_id|contact|owner)/);

const lookup = read("src/lib/author-names/lookup.server.ts");
assert.match(lookup, /\.select\("id, name"\)/);
assert.match(lookup, /\.select\("id, display_name"\)/);
assert.match(lookup, /\.select\("user_id"\)/);
assert.match(lookup, /\.select\("id"\)/);
assert.doesNotMatch(lookup, /\.select\([^)\n]*email/);
assert.doesNotMatch(lookup, /contact_details|phone|full_name/);
assert.match(lookup, /fresh:\s*true/);
assert.match(
  lookup,
  /AUTHOR_PUBLIC_NAME_RESERVED_APPLICATION_STATUSES/,
);

const hook = read("src/lib/author-names/use-author-public-name-availability.ts");
assert.match(hook, /AUTHOR_PUBLIC_NAME_CHECK_DEBOUNCE_MS/);
assert.match(hook, /AUTHOR_PUBLIC_NAME_TAKEN_MESSAGE/);
assert.match(hook, /method:\s*"POST"/);
assert.doesNotMatch(hook, /\u2014/);

const applicationForm = read("src/components/become-author/AuthorApplicationPanel.tsx");
const createForm = read("src/components/author-dashboard/AuthorCreateProjectForm.tsx");
const profileForm = read("src/components/author-dashboard/AuthorProfileClient.tsx");
const studioForm = read("src/components/admin/CreateStudioWorkspaceForm.tsx");
for (const source of [applicationForm, createForm, profileForm, studioForm]) {
  assert.match(source, /useAuthorPublicNameAvailability/);
  assert.match(source, /AUTHOR_PUBLIC_NAME_TAKEN_MESSAGE|nameAvailability\.message/);
  assert.doesNotMatch(source, /Такое название уже занято[^\n]*\u2014/);
}
assert.match(applicationForm, /nameAvailability\.taken/);
assert.match(applicationForm, /scope:\s*"application"/);
assert.match(createForm, /scope:\s*"project"/);
assert.match(profileForm, /scope:\s*"profile"/);
assert.match(profileForm, /ownName:\s*savedName/);
assert.match(studioForm, /scope:\s*"studio"/);

const applicationAction = read("src/app/(platform)/become-author/actions.ts");
const submitStart = applicationAction.indexOf("const errors = validateAuthorApplicationFormValues");
const submitWrite = applicationAction.indexOf("mapApplicationUpdatePayload", submitStart);
assert.ok(submitStart > 0 && submitWrite > submitStart);
const submitSlice = applicationAction.slice(submitStart, submitWrite);
assert.match(submitSlice, /assertApplicationDisplayNameAvailable/);

const projectServer = read("src/lib/author-projects/server.ts");
const createStart = projectServer.indexOf("export async function createAuthorProjectViaRpc");
const createRpc = projectServer.indexOf("callAuthorUserRpc", createStart);
assert.ok(createStart > 0 && createRpc > createStart);
const createSlice = projectServer.slice(createStart, createRpc);
assert.match(createSlice, /assertNewAuthorWorkspaceNameAvailable/);

const profileRoute = read("src/app/api/author/profile/route.ts");
assert.match(profileRoute, /assertAuthorWorkspaceRenameAvailable/);
const projectsRoute = read("src/app/api/author/projects/route.ts");
assert.match(projectsRoute, /AuthorPublicNameTakenError/);
assert.match(projectsRoute, /AUTHOR_PUBLIC_NAME_TAKEN_MESSAGE/);

const studioAction = read("src/app/(platform)/admin/authors/new/actions.ts");
assert.match(studioAction, /assertNewAuthorWorkspaceNameAvailable/);
assert.match(studioAction, /ownerUserId:\s*owner\.id/);

console.log("author-public-name-availability-unit: ok");
