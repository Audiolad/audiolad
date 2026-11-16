import assert from "node:assert/strict";

import {
  needsLatestProjectLookup,
  pickLatestWorkspaceId,
  pickStudioWorkspace,
  studioAuthorNames,
} from "../src/lib/studio/home-workspace";

// t1477u/t1478u: workspaces are sorted by name, so "АудиоЛад" (new, 0 projects)
// sorts before "Аурафон" (58 projects). The studio must follow the cabinet's
// selected author, then the latest project, then the first workspace.
const audiolad = { id: "b7ddb68b-8569-4987-a734-6c6e5502529e", slug: "audiolad" };
const aurafon = { id: "59c7e5b8-eae4-4394-82fb-b815a10be6c2", slug: "aurafon" };
const zoya = { id: "8e4b0d23-5c9f-4e32-ad7b-2f35e7c9b1d0", slug: "zoya" };
const all = [audiolad, aurafon, zoya];
const aurafonLatest = [{ authorId: aurafon.id, latestActivityAt: "2026-11-12T17:26:34.887Z" }];

// 1. query slug from the cabinet link wins over cookie and latest project
assert.equal(pickStudioWorkspace(all, { querySlug: "zoya", cookieSlug: "audiolad", candidates: aurafonLatest }), zoya);
// 2. cookie when no (valid) query
assert.equal(pickStudioWorkspace(all, { cookieSlug: "audiolad", candidates: aurafonLatest }), audiolad);
assert.equal(pickStudioWorkspace(all, { querySlug: "foreign", cookieSlug: "zoya" }), zoya);
// 3. latest active project when nothing selected (Sergey's prod case)
assert.equal(pickStudioWorkspace(all, { candidates: aurafonLatest }), aurafon);
assert.equal(pickStudioWorkspace(all, { querySlug: "foreign", cookieSlug: "gone", candidates: aurafonLatest }), aurafon);
// 4. first workspace when there are no projects
assert.equal(pickStudioWorkspace(all, {}), audiolad);
// foreign authors in candidates are ignored
assert.equal(pickLatestWorkspaceId([audiolad.id], [{ authorId: "foreign", latestActivityAt: "2026-11-16T07:00:00Z" }]), undefined);
assert.equal(pickStudioWorkspace([], {}), undefined);
// DB lookup only when no valid explicit selection and >1 workspace
assert.equal(needsLatestProjectLookup(all, null, null), true);
assert.equal(needsLatestProjectLookup(all, "aurafon", null), false);
assert.equal(needsLatestProjectLookup(all, null, "zoya"), false);
assert.equal(needsLatestProjectLookup(all, "foreign", " "), true);
assert.equal(needsLatestProjectLookup([aurafon], null, null), false);
// t1484u: the combined list labels each project with its author's name
assert.deepEqual(
  studioAuthorNames([
    { id: aurafon.id, name: "Аурафон" },
    { id: "7f3a9c12-4b8e-4d21-9c6a-1e2f4d6b8a0c", name: "Сергей Петров" },
  ]),
  { [aurafon.id]: "Аурафон", "7f3a9c12-4b8e-4d21-9c6a-1e2f4d6b8a0c": "Сергей Петров" },
);
assert.deepEqual(studioAuthorNames([]), {});
console.log("studio-home-workspace-unit: ok");
