#!/usr/bin/env node
/**
 * IndexNow foundation unit checks — no live network to IndexNow by default.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  INDEXNOW_ENDPOINT,
  INDEXNOW_MAX_URLS_PER_BATCH,
  buildIndexNowKeyLocation,
  getIndexNowConfig,
  getIndexNowKeyFileBody,
  isValidIndexNowKey,
  matchesConfiguredIndexNowKey,
  readIndexNowKeyFromEnv,
} from "../src/lib/seo/indexnow/config.ts";
import {
  buildIndexNowPayload,
  redactIndexNowPayload,
  submitIndexNowBatch,
} from "../src/lib/seo/indexnow/client.ts";
import { notifyIndexNowUrls } from "../src/lib/seo/indexnow/notify.ts";
import {
  batchIndexNowUrls,
  normalizeIndexNowUrl,
  normalizeIndexNowUrls,
} from "../src/lib/seo/indexnow/urls.ts";
import { GET as indexNowKeyGET } from "../src/app/api/seo/indexnow-key/route.ts";

const failures = [];
const TEST_KEY = "unit-test-indexnow-key-01";

function assert(condition, message) {
  if (!condition) failures.push(message);
}

function read(relPath) {
  const root = path.dirname(fileURLToPath(import.meta.url));
  return readFileSync(path.join(root, "..", relPath), "utf8");
}

function withEnv(overrides, fn) {
  const previous = {};
  for (const key of Object.keys(overrides)) {
    previous[key] = process.env[key];
    const value = overrides[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  try {
    return fn();
  } finally {
    for (const key of Object.keys(overrides)) {
      if (previous[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previous[key];
      }
    }
  }
}

async function withEnvAsync(overrides, fn) {
  const previous = {};
  for (const key of Object.keys(overrides)) {
    previous[key] = process.env[key];
    const value = overrides[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  try {
    return await fn();
  } finally {
    for (const key of Object.keys(overrides)) {
      if (previous[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previous[key];
      }
    }
  }
}

function productionGateEnv(extra = {}) {
  return {
    NODE_ENV: "production",
    NEXT_PUBLIC_APP_URL: "https://audiolad.ru",
    SEO_INDEXING: undefined,
    INDEXNOW_ENABLED: "true",
    INDEXNOW_KEY: TEST_KEY,
    ...extra,
  };
}

function testKeyValidation() {
  assert(isValidIndexNowKey(TEST_KEY), "valid key accepted");
  assert(!isValidIndexNowKey("short"), "short key rejected");
  assert(!isValidIndexNowKey("bad_key!"), "invalid chars rejected");
  assert(!isValidIndexNowKey(""), "empty key rejected");
  assert(!isValidIndexNowKey(null), "null key rejected");
}

function testMissingKey() {
  withEnv({ INDEXNOW_KEY: undefined, INDEXNOW_ENABLED: "true" }, () => {
    assert(readIndexNowKeyFromEnv() === null, "missing key → null");
    const config = getIndexNowConfig(process.env, {
      indexingEnabled: true,
      appOrigin: "https://audiolad.ru",
    });
    assert(!config.keyValid, "missing key → keyValid false");
    assert(!config.canSubmit, "missing key → cannot submit");
  });
}

function testInvalidKey() {
  withEnv({ INDEXNOW_KEY: "@@@", INDEXNOW_ENABLED: "true" }, () => {
    assert(readIndexNowKeyFromEnv() === null, "invalid key treated as absent");
    assert(
      getIndexNowConfig(process.env, {
        indexingEnabled: true,
        appOrigin: "https://audiolad.ru",
      }).canSubmit === false,
      "invalid key blocks submit",
    );
  });
}

function testEnabledFalse() {
  withEnv(productionGateEnv({ INDEXNOW_ENABLED: "false" }), () => {
    const config = getIndexNowConfig(process.env, {
      indexingEnabled: true,
      appOrigin: "https://audiolad.ru",
    });
    assert(config.enabledFlag === false, "enabled flag false");
    assert(config.canSubmit === false, "enabled false blocks submit");
  });
}

function testNonProductionIndexingGate() {
  withEnv(productionGateEnv(), () => {
    const config = getIndexNowConfig(process.env, {
      indexingEnabled: false,
      appOrigin: "https://audiolad.ru",
    });
    assert(config.canSubmit === false, "indexing gate blocks submit");
  });

  withEnv(productionGateEnv(), () => {
    const config = getIndexNowConfig(process.env, {
      indexingEnabled: true,
      appOrigin: "http://localhost:3000",
    });
    assert(config.originIsProduction === false, "localhost not production origin");
    assert(config.canSubmit === false, "non-prod origin blocks submit");
  });
}

function testUrlRules() {
  const foreign = normalizeIndexNowUrl("https://example.com/articles/x");
  assert(!foreign.ok && foreign.reason === "foreign_host", "foreign host rejected");

  const withQuery = normalizeIndexNowUrl(
    "https://audiolad.ru/articles/kak-razvit-lyubov-k-sebe?utm_source=x",
  );
  assert(withQuery.ok, "query URL accepted after strip");
  assert(
    withQuery.url ===
      "https://audiolad.ru/articles/kak-razvit-lyubov-k-sebe",
    "query stripped",
  );

  const privateUrl = normalizeIndexNowUrl("https://audiolad.ru/author-dashboard");
  assert(!privateUrl.ok && privateUrl.reason === "private_path", "dashboard private");

  const apiUrl = normalizeIndexNowUrl("/api/seo/indexnow-key");
  assert(!apiUrl.ok && apiUrl.reason === "private_path", "api private");

  const authUrl = normalizeIndexNowUrl("/auth/sign-in");
  assert(!authUrl.ok && authUrl.reason === "private_path", "auth private");

  const preview = normalizeIndexNowUrl(
    "/practice/sergey-petrov/elixir-molodosti/preview",
  );
  assert(!preview.ok && preview.reason === "private_path", "preview path private");

  const listenPlayer = normalizeIndexNowUrl("https://audiolad.ru/listen/elixir-molodosti");
  assert(!listenPlayer.ok && listenPlayer.reason === "private_path", "listen player private");

  const listensSeo = normalizeIndexNowUrl(
    "https://audiolad.ru/listens/meditatsiya-na-dengi-slushat-onlayn-besplatno",
  );
  assert(listensSeo.ok, "SEO listen URL is indexable for IndexNow");

  const innerSupport = normalizeIndexNowUrl("/program/inner-support");
  assert(!innerSupport.ok && innerSupport.reason === "private_path", "inner-support private");

  const adminUrl = normalizeIndexNowUrl("https://audiolad.ru/admin");
  assert(!adminUrl.ok && adminUrl.reason === "private_path", "admin private");

  const okPath = normalizeIndexNowUrl("/articles/kak-razvit-lyubov-k-sebe");
  assert(
    okPath.ok &&
      okPath.url === "https://audiolad.ru/articles/kak-razvit-lyubov-k-sebe",
    "path normalized to canonical https",
  );
}

function testDedupeAndBatch() {
  const { accepted } = normalizeIndexNowUrls([
    "/articles/a",
    "https://audiolad.ru/articles/a",
    "https://www.audiolad.ru/articles/a?x=1",
    "/articles/b",
  ]);

  assert(accepted.length === 2, "dedupe keeps two unique URLs");

  const batches = batchIndexNowUrls(
    Array.from({ length: 250 }, (_, i) => `https://audiolad.ru/articles/x-${i}`),
    INDEXNOW_MAX_URLS_PER_BATCH,
  );
  assert(batches.length === 3, "250 urls → 3 batches of max 100");
  assert(batches[0].length === 100, "first batch size 100");
  assert(batches[2].length === 50, "last batch size 50");
}

function testPayloadAndKeyLocation() {
  const payload = buildIndexNowPayload(TEST_KEY, [
    "https://audiolad.ru/articles/a",
  ]);
  assert(payload.host === "audiolad.ru", "payload host");
  assert(payload.key === TEST_KEY, "payload key present internally");
  assert(
    payload.keyLocation === buildIndexNowKeyLocation(TEST_KEY),
    "keyLocation matches",
  );
  assert(
    payload.keyLocation === `https://audiolad.ru/${TEST_KEY}.txt`,
    "keyLocation URL shape",
  );

  const redacted = redactIndexNowPayload(payload);
  assert(!("key" in redacted), "redacted payload has no key field");
  const serialized = JSON.stringify(redacted);
  assert(!serialized.includes(TEST_KEY), "redacted JSON has no key value");
}

async function testHttpSuccessCodes() {
  await withEnvAsync(productionGateEnv(), async () => {
    const config = getIndexNowConfig(process.env, {
      indexingEnabled: true,
      appOrigin: "https://audiolad.ru",
    });

    for (const status of [200, 202]) {
      const { result } = await submitIndexNowBatch(
        config,
        ["https://audiolad.ru/articles/a"],
        {
          fetchImpl: async () => new Response("", { status }),
          sleepImpl: async () => {},
        },
      );
      assert(result.ok === true, `HTTP ${status} accepted`);
      assert(result.retried === false, `HTTP ${status} no retry`);
    }
  });
}

async function testRetryOn429And500() {
  await withEnvAsync(productionGateEnv(), async () => {
    const config = getIndexNowConfig(process.env, {
      indexingEnabled: true,
      appOrigin: "https://audiolad.ru",
    });

    for (const failStatus of [429, 500]) {
      let calls = 0;
      const { result } = await submitIndexNowBatch(
        config,
        ["https://audiolad.ru/articles/a"],
        {
          fetchImpl: async () => {
            calls += 1;
            if (calls === 1) return new Response("", { status: failStatus });
            return new Response("", { status: 200 });
          },
          sleepImpl: async () => {},
        },
      );
      assert(calls === 2, `${failStatus} triggers one retry`);
      assert(result.ok === true, `${failStatus} retry succeeds`);
      assert(result.retried === true, `${failStatus} marked retried`);
    }
  });
}

async function testTimeoutRetry() {
  await withEnvAsync(productionGateEnv(), async () => {
    const config = getIndexNowConfig(process.env, {
      indexingEnabled: true,
      appOrigin: "https://audiolad.ru",
    });

    let calls = 0;
    const { result } = await submitIndexNowBatch(
      config,
      ["https://audiolad.ru/articles/a"],
      {
        timeoutMs: 20,
        sleepImpl: async () => {},
        fetchImpl: async (_url, init) => {
          calls += 1;
          if (calls === 1) {
            await new Promise((_, reject) => {
              init.signal.addEventListener("abort", () => {
                const error = new Error("aborted");
                error.name = "AbortError";
                reject(error);
              });
            });
          }
          return new Response("", { status: 200 });
        },
      },
    );

    assert(calls === 2, "timeout triggers retry");
    assert(result.ok === true, "timeout retry recovers");
    assert(result.retried === true, "timeout marked retried");
  });
}

async function testNotifyDisabledNoNetwork() {
  let fetchCalled = false;
  await withEnvAsync(
    productionGateEnv({ INDEXNOW_ENABLED: "false" }),
    async () => {
      const result = await notifyIndexNowUrls(
        ["https://audiolad.ru/articles/a"],
        "unit_disabled",
        {
          fetchImpl: async () => {
            fetchCalled = true;
            return new Response("", { status: 200 });
          },
        },
      );
      assert(result.status === "disabled", "notify disabled status");
      assert(fetchCalled === false, "disabled notify does not fetch");
    },
  );
}

async function testNotifyNeverThrows() {
  await withEnvAsync(productionGateEnv(), async () => {
    const result = await notifyIndexNowUrls(
      ["https://audiolad.ru/articles/a"],
      "unit_throw",
      {
        fetchImpl: async () => {
          throw new Error("boom");
        },
        sleepImpl: async () => {},
      },
    );
    assert(
      result.status === "failed" || result.batchResults.length > 0,
      "notify swallows fetch errors",
    );
  });
}

async function testKeyRoute() {
  await withEnvAsync({ INDEXNOW_KEY: undefined }, async () => {
    const response = await indexNowKeyGET(
      new Request("https://audiolad.ru/api/seo/indexnow-key?key=anything-long-enough"),
    );
    assert(response.status === 404, "key route 404 without env");
  });

  await withEnvAsync({ INDEXNOW_KEY: TEST_KEY }, async () => {
    assert(
      matchesConfiguredIndexNowKey("wrong-key-value-xxx") === false,
      "wrong key mismatch",
    );
    assert(getIndexNowKeyFileBody() === TEST_KEY, "body equals key");

    const wrong = await indexNowKeyGET(
      new Request(
        `https://audiolad.ru/api/seo/indexnow-key?key=wrong-key-value-xxx`,
      ),
    );
    assert(wrong.status === 404, "key route 404 for wrong key");

    const ok = await indexNowKeyGET(
      new Request(
        `https://audiolad.ru/api/seo/indexnow-key?key=${TEST_KEY}`,
      ),
    );
    assert(ok.status === 200, "key route 200 for correct key");
    assert(
      ok.headers.get("content-type")?.includes("text/plain"),
      "key route content-type text/plain",
    );
    const text = await ok.text();
    assert(text === TEST_KEY, "key route body exact key");
    assert(!text.includes("\uFEFF"), "key route body has no BOM");
  });
}

function testSourceSafety() {
  const files = [
    "src/lib/seo/indexnow/config.ts",
    "src/lib/seo/indexnow/client.ts",
    "src/lib/seo/indexnow/notify.ts",
    "src/lib/seo/indexnow/urls.ts",
    "src/app/api/seo/indexnow-key/route.ts",
    "src/app/api/seo/indexnow-key/[key]/route.ts",
    "src/lib/seo/indexnow/key-response.ts",
    "scripts/indexnow-submit.mjs",
    "next.config.ts",
  ];

  for (const file of files) {
    const source = read(file);
    assert(
      !source.includes("INDEXNOW_KEY=unit-test"),
      `${file} must not hardcode test secrets as env assignment`,
    );
    assert(
      !/INDEXNOW_KEY\s*=\s*["'][A-Za-z0-9-]{8,}["']/.test(source) ||
        file.includes("indexnow-unit"),
      `${file} must not embed literal production-like keys`,
    );
  }

  const nextConfig = read("next.config.ts");
  assert(
    nextConfig.includes("/:key([A-Za-z0-9-]{8,128}).txt"),
    "next.config has narrow IndexNow rewrite",
  );
  assert(
    nextConfig.includes("beforeFiles"),
    "IndexNow rewrite uses beforeFiles",
  );
  assert(
    nextConfig.includes("/api/seo/indexnow-key/:key"),
    "rewrite targets path-param key route",
  );

  assert(
    INDEXNOW_ENDPOINT === "https://api.indexnow.org/indexnow",
    "canonical IndexNow endpoint",
  );

  const packageJson = JSON.parse(read("package.json"));
  assert(
    packageJson.scripts["indexnow:dry-run"],
    "indexnow:dry-run script present",
  );
  assert(packageJson.scripts["test:indexnow"], "test:indexnow script present");
  assert(
    !packageJson.scripts["indexnow:live"],
    "no short accidental live npm script",
  );
}

async function main() {
  testKeyValidation();
  testMissingKey();
  testInvalidKey();
  testEnabledFalse();
  testNonProductionIndexingGate();
  testUrlRules();
  testDedupeAndBatch();
  testPayloadAndKeyLocation();
  await testHttpSuccessCodes();
  await testRetryOn429And500();
  await testTimeoutRetry();
  await testNotifyDisabledNoNetwork();
  await testNotifyNeverThrows();
  await testKeyRoute();
  testSourceSafety();

  if (failures.length > 0) {
    console.error("indexnow-unit FAILED:");
    for (const failure of failures) console.error(` - ${failure}`);
    process.exit(1);
  }

  console.log("indexnow-unit: ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
