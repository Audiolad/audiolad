import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  AUTH_NETWORK_ERROR_MESSAGE,
  AUTH_NETWORK_TIMEOUT_MS,
  AuthNetworkTimeoutError,
  isAuthNetworkFailure,
  withAuthNetworkTimeout,
} from "../src/lib/auth/network-timeout";

assert.equal(AUTH_NETWORK_TIMEOUT_MS, 20_000);
assert.equal(
  AUTH_NETWORK_ERROR_MESSAGE,
  "Нет связи с сервером. Проверьте интернет или отключите VPN и попробуйте снова.",
);
assert.equal(new AuthNetworkTimeoutError().name, "AuthNetworkTimeoutError");

assert.equal(await withAuthNetworkTimeout(Promise.resolve(42)), 42);

const rejection = new Error("task failed");
await assert.rejects(
  withAuthNetworkTimeout(Promise.reject(rejection)),
  (error: unknown) => error === rejection,
);

let factoryCalls = 0;
assert.equal(
  await withAuthNetworkTimeout(() => {
    factoryCalls += 1;
    return Promise.resolve("factory result");
  }),
  "factory result",
);
assert.equal(factoryCalls, 1);
await assert.rejects(
  withAuthNetworkTimeout(() => {
    throw rejection;
  }),
  (error: unknown) => error === rejection,
);

const startedAt = Date.now();
const never = new Promise<never>(() => {});
let deadlineTimer: ReturnType<typeof setTimeout> | undefined;
const deadline = new Promise<never>((_, reject) => {
  deadlineTimer = setTimeout(() => reject(new Error("Timeout took over 1s")), 1000);
});

try {
  await assert.rejects(
    Promise.race([withAuthNetworkTimeout(never, 30), deadline]),
    AuthNetworkTimeoutError,
  );
  assert.ok(Date.now() - startedAt < 1000);
} finally {
  clearTimeout(deadlineTimer);
}

for (const error of [
  new AuthNetworkTimeoutError(),
  new TypeError("Failed to fetch"),
  new TypeError("NetworkError"),
  new TypeError("Load failed"),
  { name: "AuthRetryableFetchError" },
  { status: 0 },
]) {
  assert.equal(isAuthNetworkFailure(error), true);
}

for (const error of [
  { name: "AuthApiError", status: 400 },
  null,
  new Error("x"),
  new TypeError("Cannot read properties of undefined"),
]) {
  assert.equal(isAuthNetworkFailure(error), false);
}

for (const page of ["sign-in", "sign-up", "forgot-password"]) {
  const source = readFileSync(
    new URL(`../src/app/(platform)/auth/${page}/page.tsx`, import.meta.url),
    "utf8",
  );
  const networkImport = source.match(
    /import\s*\{([^}]+)\}\s*from\s*"@\/lib\/auth\/network-timeout";/,
  );
  assert.ok(networkImport, `${page} imports the network timeout module`);
  assert.match(networkImport[1], /\bwithAuthNetworkTimeout\b/);
  assert.match(networkImport[1], /\bAUTH_NETWORK_ERROR_MESSAGE\b/);
}

for (const path of [
  "../src/lib/auth/network-timeout.ts",
  "./auth-network-timeout-unit.mts",
]) {
  const source = readFileSync(new URL(path, import.meta.url), "utf8");
  assert.ok(!source.includes("\u2014"), `${path} contains no U+2014`);
}

console.log("auth-network-timeout-unit: ok");
