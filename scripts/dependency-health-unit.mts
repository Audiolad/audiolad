import assert from "node:assert/strict";

import {
  buildDependencyHealthResult,
  DEPENDENCY_HEALTH_CACHE_CONTROL,
} from "../src/lib/health/dependencies.ts";

const ok = buildDependencyHealthResult(true);
assert.equal(ok.httpStatus, 200);
assert.deepEqual(ok.body, { status: "ok", database: "ok" });
assert.equal(ok.headers["Cache-Control"], DEPENDENCY_HEALTH_CACHE_CONTROL);
assert.equal(JSON.stringify(ok.body).includes("password"), false);
assert.equal(JSON.stringify(ok.body).includes("eyJ"), false);

const down = buildDependencyHealthResult(false);
assert.equal(down.httpStatus, 503);
assert.deepEqual(down.body, { status: "degraded", database: "unavailable" });
assert.equal(down.headers["Cache-Control"], "no-store");
assert.equal(Object.keys(down.body).sort().join(","), "database,status");

console.log("dependency-health-unit: ok");
