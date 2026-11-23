// t1654u: cover requests share one allowed-id lookup instead of rebuilding the catalog each time.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { createAllowedIdsCache, workspaceAllowedIdsCacheKey } from "../src/lib/business-workspace/allowed-ids-cache";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const cache = createAllowedIdsCache(30_000);
let loads = 0;
const load = async () => {
  loads += 1;
  await new Promise((resolve) => setTimeout(resolve, 10));
  return ["track-a", "track-b"];
};

const key = workspaceAllowedIdsCacheKey({
  device: false,
  userId: "user-1",
  locationId: "loc-1",
  space: { id: "cafe" },
});
const [first, second] = await Promise.all([cache.get(key, load), cache.get(key, load)]);
assert.deepEqual(first, ["track-a", "track-b"]);
assert.equal(second, first);
assert.equal(loads, 1, "parallel cover requests share one catalog lookup");
const third = await cache.get(key, load);
assert.equal(third, first);
assert.equal(loads, 1, "a warm cache does not rebuild the catalog");

const other = workspaceAllowedIdsCacheKey({
  device: false,
  userId: "user-2",
  locationId: "loc-1",
  space: { id: "cafe" },
});
assert.notEqual(other, key, "sessions do not share the allowed-id list");
await cache.get(other, load);
assert.equal(loads, 2);

const short = createAllowedIdsCache(1);
let ticks = 0;
await short.get("k", async () => {
  ticks += 1;
  return ["x"];
});
await new Promise((resolve) => setTimeout(resolve, 5));
await short.get("k", async () => {
  ticks += 1;
  return ["y"];
});
assert.equal(ticks, 2, "expired entries are loaded again");

const route = read("src/app/api/business/workspace/cover/route.ts");
assert.match(route, /workspaceAllowedIdsCache\.get/);
assert.match(route, /loadWorkspaceAllowedIds\(/);
assert.doesNotMatch(route, /loadWorkspaceCatalog\(/);

console.log("business-workspace-allowed-ids-cache-unit: OK");
