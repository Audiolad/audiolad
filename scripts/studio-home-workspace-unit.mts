import assert from "node:assert/strict";

import { pickStudioHomeWorkspaceId } from "../src/lib/studio/home-workspace";

// t1477u: a new author sorted first by name must not hide existing projects.
const audiolad = "b7ddb68b-8569-4987-a734-6c6e5502529e"; // created 15.11, 0 projects
const aurafon = "59c7e5b8-eae4-4394-82fb-b815a10be6c2"; // 58 projects
const zoya = "8e4b0d23-5c9f-4e32-ad7b-2f35e7c9b1d0";

assert.equal(
  pickStudioHomeWorkspaceId([audiolad, aurafon, zoya], [
    { authorId: aurafon, latestActivityAt: "2026-11-12T17:26:34.887Z" },
  ]),
  aurafon,
);
assert.equal(pickStudioHomeWorkspaceId([audiolad, aurafon], []), audiolad);
assert.equal(
  pickStudioHomeWorkspaceId([audiolad, aurafon], [
    { authorId: aurafon, latestActivityAt: "2026-11-12T17:26:34.887Z" },
    { authorId: audiolad, latestActivityAt: "2026-11-16T07:00:00Z" },
  ]),
  audiolad,
);
assert.equal(
  pickStudioHomeWorkspaceId([audiolad], [
    { authorId: "foreign", latestActivityAt: "2026-11-16T07:00:00Z" },
  ]),
  audiolad,
);
assert.equal(pickStudioHomeWorkspaceId([], []), undefined);
console.log("studio-home-workspace-unit: ok");
