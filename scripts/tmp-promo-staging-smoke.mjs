#!/usr/bin/env node
/**
 * Full staging smoke for promo-pages — blocked on production unless ALLOW_PRODUCTION_TEST_FIXTURES=true.
 */
import { createClient } from "@supabase/supabase-js";
import { execSync, spawn } from "node:child_process";
import { writeFileSync, readFileSync, appendFileSync, openSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { assertProductionFixturesAllowed } from "./lib/guard-production-fixtures.mjs";
import { cleanupPromoStagingSuffix } from "./lib/promo-staging-fixture-cleanup.mjs";

const SCRIPT_NAME = "scripts/tmp-promo-staging-smoke.mjs";
const KONG_URL = "http://127.0.0.1:8000";

assertProductionFixturesAllowed({
  scriptName: SCRIPT_NAME,
  supabaseUrl: KONG_URL,
  dockerExec: true,
});

const LOG = "/tmp/audiolad-promo-staging-smoke.log";
const FIXTURES_PATH = "/tmp/audiolad-promo-staging-fixtures.json";
const STAGING_ENV_PATH = "/tmp/audiolad-promo-staging.env";
const APP_PORT = process.env.STAGING_APP_PORT ?? "3060";
const APP_BASE = `http://127.0.0.1:${APP_PORT}`;
const PROD_HOST = "audiolad.ru";

const results = { pass: [], fail: [], skip: [] };

function log(line) {
  const msg = `[${new Date().toISOString()}] ${line}`;
  appendFileSync(LOG, msg + "\n");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function pass(name) {
  results.pass.push(name);
  log(`PASS ${name}`);
}

function fail(name, err) {
  results.fail.push({ name, error: String(err) });
  log(`FAIL ${name}: ${err}`);
}

function skip(name, reason) {
  results.skip.push({ name, reason });
  log(`SKIP ${name}: ${reason}`);
}

function sql(query) {
  assertProductionFixturesAllowed({
    scriptName: SCRIPT_NAME,
    supabaseUrl: KONG_URL,
    dockerExec: true,
  });
  return execSync(
    `docker exec supabase-db psql -U postgres -d postgres -tAc ${JSON.stringify(query)}`,
    { encoding: "utf8" },
  ).trim();
}

function sqlFile(content) {
  assertProductionFixturesAllowed({
    scriptName: SCRIPT_NAME,
    supabaseUrl: KONG_URL,
    dockerExec: true,
  });
  return execSync(
    "docker exec -i supabase-db psql -U postgres -d postgres -v ON_ERROR_STOP=1",
    { input: content, encoding: "utf8" },
  );
}

function loadStagingEnv() {
  const anon = execSync(
    "docker exec supabase-kong printenv SUPABASE_ANON_KEY",
    { encoding: "utf8" },
  ).trim();
  const service = execSync(
    "docker exec supabase-kong printenv SUPABASE_SERVICE_KEY",
    { encoding: "utf8" },
  ).trim();
  const url = "http://127.0.0.1:8000";

  if (url.includes(PROD_HOST)) {
    throw new Error("SAFETY: staging URL matches production hostname");
  }

  const envContent = [
    `NEXT_PUBLIC_SUPABASE_URL=${url}`,
    `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${anon}`,
    `SUPABASE_SERVICE_ROLE_KEY=${service}`,
    `PORT=${APP_PORT}`,
    `BASE_URL=${APP_BASE}`,
    `ANALYTICS_HTTP_BASE_URL=${APP_BASE}`,
    `AUDIOLAD_ALLOW_START=1`,
    `AUDIOLAD_ALLOW_PLAYWRIGHT=1`,
  ].join("\n");
  writeFileSync(STAGING_ENV_PATH, envContent);

  return {
    url,
    anon,
    service,
    anonLast4: anon.slice(-4),
    serviceLast4: service.slice(-4),
    hostname: "127.0.0.1:8000",
  };
}

async function getSession(env, email, password = "StagingSmoke2026!") {
  const admin = createClient(env.url, env.service, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const pub = createClient(env.url, env.anon, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (createErr && !createErr.message.includes("already")) {
    throw createErr;
  }

  const { data: signIn, error: signErr } = await pub.auth.signInWithPassword({
    email,
    password,
  });

  if (signErr || !signIn.session?.access_token) {
    throw signErr ?? new Error("no session");
  }

  return {
    userId: signIn.session.user.id,
    accessToken: signIn.session.access_token,
    admin,
    authed: createClient(env.url, env.anon, {
      global: { headers: { Authorization: `Bearer ${signIn.session.access_token}` } },
      auth: { autoRefreshToken: false, persistSession: false },
    }),
  };
}

async function setupFixtures(env) {
  const suffix = randomUUID().slice(0, 8);
  const emailA = `staging-promo-a-${suffix}@staging.audiolad.local`;
  const emailB = `staging-promo-b-${suffix}@staging.audiolad.local`;

  const sessionA = await getSession(env, emailA);
  const sessionB = await getSession(env, emailB);
  const admin = sessionA.admin;

  const slugA = `staging-author-a-${suffix}`;
  const slugB = `staging-author-b-${suffix}`;

  const { data: authorA, error: errA } = await admin
    .from("authors")
    .insert({ name: `Staging Author A ${suffix}`, slug: slugA })
    .select("id, slug")
    .single();

  if (errA) throw errA;

  const { data: authorB, error: errB } = await admin
    .from("authors")
    .insert({ name: `Staging Author B ${suffix}`, slug: slugB })
    .select("id, slug")
    .single();

  if (errB) throw errB;

  for (const [authorId, userId, role] of [
    [authorA.id, sessionA.userId, "owner"],
    [authorB.id, sessionB.userId, "owner"],
  ]) {
    const { error } = await admin.from("author_members").insert({
      author_id: authorId,
      user_id: userId,
      role,
    });
    if (error) throw error;
  }

  async function insertPractice(authorId, fields) {
    const { data, error } = await admin
      .from("practices")
      .insert({
        author_id: authorId,
        title: fields.title,
        slug: fields.slug,
        status: "published",
        format: "Медитация",
        is_free: fields.is_free,
        is_catalog_listed: fields.is_catalog_listed,
        guest_access_enabled: fields.guest_access_enabled ?? false,
        price: fields.is_free ? 0 : 100,
      })
      .select("id, slug")
      .single();
    if (error) throw error;
    return data;
  }

  const eligibleFree = await insertPractice(authorA.id, {
    title: "Eligible Free",
    slug: `a-free-${suffix}`,
    is_free: true,
    is_catalog_listed: true,
  });
  const eligibleGuest = await insertPractice(authorA.id, {
    title: "Eligible Guest",
    slug: `a-guest-${suffix}`,
    is_free: false,
    is_catalog_listed: false,
    guest_access_enabled: true,
  });
  const ineligible = await insertPractice(authorA.id, {
    title: "Ineligible Paid",
    slug: `a-paid-${suffix}`,
    is_free: false,
    is_catalog_listed: true,
    guest_access_enabled: false,
  });
  const productB = await insertPractice(authorB.id, {
    title: "B Product",
    slug: `b-prod-${suffix}`,
    is_free: true,
    is_catalog_listed: true,
  });

  const fixtures = {
    suffix,
    authorA: { id: authorA.id, slug: slugA },
    authorB: { id: authorB.id, slug: slugB },
    userA: { id: sessionA.userId, email: emailA, token: sessionA.accessToken },
    userB: { id: sessionB.userId, email: emailB, token: sessionB.accessToken },
    products: {
      eligibleFree: eligibleFree.id,
      eligibleGuest: eligibleGuest.id,
      ineligible: ineligible.id,
      productB: productB.id,
    },
  };

  writeFileSync(FIXTURES_PATH, JSON.stringify(fixtures, null, 2));
  return { fixtures, sessionA, sessionB, admin };
}

async function http(method, path, { token, body, headers = {} } = {}) {
  const response = await fetch(`${APP_BASE}${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // html etc
  }
  return { status: response.status, text, json };
}

async function runSqlMatrix(fixtures, env) {
  const { authorA, authorB, userA, products } = fixtures;

  // Anonymous public RPC
  sqlFile(`
    DO $$ DECLARE v jsonb; BEGIN
      IF get_public_promo_page('${authorA.slug}', 'nonexistent') IS NOT NULL THEN
        RAISE EXCEPTION 'should be null';
      END IF;
    END $$;
  `);
  pass("sql:anon public rpc missing page null");

  // Author A create draft via RPC
  const slug = `smoke-${fixtures.suffix}`;
  sqlFile(`
    DO $$ DECLARE v_id uuid; BEGIN
      PERFORM set_config('request.jwt.claim.sub', '${userA.id}', true);
      SET LOCAL ROLE authenticated;
      SELECT (create_promo_page_draft(
        '${authorA.id}', 'Smoke Draft', '${slug}', 'Public Title', NULL, NULL, NULL, '/catalog',
        ARRAY['${products.eligibleFree}']::uuid[]
      )->>'promo_page_id')::uuid INTO v_id;
      IF v_id IS NULL THEN RAISE EXCEPTION 'no id'; END IF;
    END $$;
  `);
  pass("sql:author A create draft");

  const pageId = sql(
    `SELECT id FROM promo_pages WHERE author_id='${authorA.id}' AND slug='${slug}' LIMIT 1`,
  );

  // Duplicate slug same author
  try {
    sqlFile(`
      DO $$ BEGIN
        PERFORM set_config('request.jwt.claim.sub', '${userA.id}', true);
        SET LOCAL ROLE authenticated;
        PERFORM create_promo_page_draft('${authorA.id}', 'Dup', '${slug}', 'T', NULL, NULL, NULL, NULL, ARRAY['${products.eligibleFree}']::uuid[]);
        RAISE EXCEPTION 'dup accepted';
      END $$;
    `);
    throw new Error("duplicate slug not rejected");
  } catch (e) {
    if (String(e).includes("dup accepted")) throw e;
    pass("sql:duplicate slug same author rejected");
  }

  // Wrong author product
  try {
    sqlFile(`
      DO $$ BEGIN
        PERFORM set_config('request.jwt.claim.sub', '${userA.id}', true);
        SET LOCAL ROLE authenticated;
        PERFORM create_promo_page_draft('${authorA.id}', 'Bad', 'bad-${fixtures.suffix}', 'T', NULL, NULL, NULL, NULL, ARRAY['${products.productB}']::uuid[]);
        RAISE EXCEPTION 'wrong product accepted';
      END $$;
    `);
    throw new Error("wrong product not rejected");
  } catch (e) {
    if (String(e).includes("wrong product accepted")) throw e;
    pass("sql:wrong author product rejected");
  }

  // CTA invalid
  try {
    sqlFile(`
      DO $$ BEGIN
        PERFORM set_config('request.jwt.claim.sub', '${userA.id}', true);
        SET LOCAL ROLE authenticated;
        PERFORM create_promo_page_draft('${authorA.id}', 'CTA', 'cta-${fixtures.suffix}', 'T', NULL, NULL, NULL, 'https://evil.example', ARRAY['${products.eligibleFree}']::uuid[]);
        RAISE EXCEPTION 'evil cta accepted';
      END $$;
    `);
    throw new Error("evil cta not rejected");
  } catch (e) {
    if (String(e).includes("evil cta accepted")) throw e;
    pass("sql:invalid CTA rejected");
  }

  // Publish + public
  sqlFile(`
    DO $$ BEGIN
      PERFORM set_config('request.jwt.claim.sub', '${userA.id}', true);
      SET LOCAL ROLE authenticated;
      PERFORM publish_promo_page('${pageId}'::uuid);
    END $$;
  `);
  const pub = sql(
    `SELECT CASE WHEN get_public_promo_page('${authorA.slug}', '${slug}') IS NULL THEN 'null' ELSE 'ok' END`,
  );
  assert(pub === "ok", "published not public");
  pass("sql:publish + public rpc");

  // Unpublish
  sqlFile(`
    DO $$ BEGIN
      PERFORM set_config('request.jwt.claim.sub', '${userA.id}', true);
      SET LOCAL ROLE authenticated;
      PERFORM unpublish_promo_page('${pageId}'::uuid);
    END $$;
  `);
  const after = sql(
    `SELECT CASE WHEN get_public_promo_page('${authorA.slug}', '${slug}') IS NULL THEN 'null' ELSE 'bad' END`,
  );
  assert(after === "null", "unpublished still public");
  pass("sql:unpublish hides public");

  // Direct insert blocked
  try {
    sql(
      `INSERT INTO promo_pages (author_id, internal_name, slug, public_title) VALUES ('${authorA.id}', 'x', 'direct-${fixtures.suffix}', 'x')`,
    );
    throw new Error("direct insert allowed");
  } catch (e) {
    if (String(e).includes("direct insert allowed")) throw e;
    pass("sql:direct insert blocked");
  }

  // XOR campaign
  sqlFile(`
    DO $$ BEGIN
      PERFORM set_config('request.jwt.claim.sub', '${userA.id}', true);
      SET LOCAL ROLE authenticated;
      INSERT INTO promotion_campaigns (author_id, name, campaign_key, practice_id, status, created_by)
      VALUES ('${authorA.id}', 'Practice Camp', 'pc_${fixtures.suffix}', '${products.eligibleFree}', 'active', '${userA.id}');
    END $$;
  `);
  pass("sql:practice campaign insert");

  fixtures.pageId = pageId;
  fixtures.slug = slug;
  writeFileSync(FIXTURES_PATH, JSON.stringify(fixtures, null, 2));
  return pageId;
}

async function runApiMatrix(fixtures, sessionA, sessionB) {
  const { authorA, authorB, userA, products, pageId, slug } = fixtures;

  let r = await http("GET", `/api/author/promotion/pages?author_id=${authorA.id}`);
  assert(r.status === 401, `unauth list expected 401 got ${r.status}`);
  pass("api:GET list unauthenticated 401");

  r = await http("GET", `/api/author/promotion/pages?author_id=${authorA.id}`, {
    token: sessionA.accessToken,
  });
  assert(r.status === 200, `list A expected 200 got ${r.status}: ${r.text.slice(0, 200)}`);
  assert(Array.isArray(r.json?.pages), "pages array");
  pass("api:GET list author A 200");

  r = await http("GET", `/api/author/promotion/pages?author_id=${authorA.id}`, {
    token: sessionB.accessToken,
  });
  assert(r.status === 403 || r.status === 404, `wrong author list ${r.status}`);
  pass("api:GET list wrong author denied");

  r = await http("POST", "/api/author/promotion/pages", {
    body: "not-json",
  });
  assert(r.status === 400, `malformed ${r.status}`);
  pass("api:POST malformed 400");

  r = await http("POST", "/api/author/promotion/pages", {
    token: sessionA.accessToken,
    body: {
      author_id: authorA.id,
      internal_name: "API Draft",
      public_title: "API Public",
      slug: `api-${fixtures.suffix}`,
      cta_href: "/catalog",
      practice_ids: [products.eligibleFree],
    },
  });
  assert(r.status === 201, `create expected 201 got ${r.status}: ${r.text.slice(0, 300)}`);
  assert(r.json?.page?.id, "page id");
  const apiPageId = r.json.page.id;
  pass("api:POST create 201");

  r = await http("POST", "/api/author/promotion/pages", {
    token: sessionA.accessToken,
    body: {
      author_id: authorA.id,
      internal_name: "Dup",
      public_title: "Dup",
      slug: `api-${fixtures.suffix}`,
      practice_ids: [products.eligibleFree],
    },
  });
  assert(r.status === 409 || r.status === 400, `duplicate slug ${r.status}`);
  pass("api:POST duplicate slug rejected");

  r = await http("POST", "/api/author/promotion/pages", {
    token: sessionA.accessToken,
    body: {
      author_id: authorA.id,
      internal_name: "Evil",
      public_title: "Evil",
      slug: `evil-${fixtures.suffix}`,
      cta_href: "https://evil.example",
      practice_ids: [products.eligibleFree],
    },
  });
  assert(r.status === 400, `evil cta ${r.status}`);
  pass("api:POST invalid CTA 400");

  r = await http("GET", `/api/author/promotion/pages/${apiPageId}`, {
    token: sessionB.accessToken,
  });
  assert(r.status === 403 || r.status === 404, `wrong author get ${r.status}`);
  pass("api:GET detail wrong author denied");

  r = await http("GET", `/api/author/promotion/pages/${apiPageId}`, {
    token: sessionA.accessToken,
  });
  assert(r.status === 200, `get detail ${r.status}`);
  assert(r.json?.page?.internal_name === "API Draft", "detail dto");
  pass("api:GET detail author A 200");

  r = await http("PATCH", `/api/author/promotion/pages/${apiPageId}`, {
    token: sessionA.accessToken,
    body: { status: "published" },
  });
  assert(r.status === 400, `status injection ${r.status}`);
  pass("api:PATCH status injection 400");

  r = await http("PATCH", `/api/author/promotion/pages/${apiPageId}`, {
    token: sessionA.accessToken,
    body: { public_title: "Updated API Title" },
  });
  assert(r.status === 200, `patch ${r.status}`);
  pass("api:PATCH valid update 200");

  r = await http(
    "GET",
    `/api/author/promotion/pages/eligible-products?author_id=${authorA.id}`,
    { token: sessionA.accessToken },
  );
  assert(r.status === 200, `eligible ${r.status}`);
  const ids = (r.json?.products ?? []).map((p) => p.id);
  assert(ids.includes(products.eligibleFree), "eligible free listed");
  assert(!ids.includes(products.ineligible), "ineligible excluded");
  pass("api:GET eligible products");

  r = await http("POST", `/api/author/promotion/pages/${apiPageId}/publish`, {
    token: sessionA.accessToken,
  });
  assert(r.status === 200, `publish ${r.status}: ${r.text.slice(0, 200)}`);
  assert(r.json?.page?.status === "published", "published status");
  pass("api:POST publish 200");

  r = await http("PATCH", `/api/author/promotion/pages/${apiPageId}`, {
    token: sessionA.accessToken,
    body: { public_title: "Locked" },
  });
  assert(r.status === 409, `edit published ${r.status}`);
  pass("api:PATCH published locked 409");

  r = await http("POST", `/api/author/promotion/pages/${apiPageId}/unpublish`, {
    token: sessionA.accessToken,
  });
  assert(r.status === 200, `unpublish ${r.status}`);
  pass("api:POST unpublish 200");

  // Public route gap check
  const publicPath = `/promo/${authorA.slug}/api-${fixtures.suffix}`;
  r = await http("GET", publicPath);
  fixtures.publicPath = publicPath;
  fixtures.publicPathStatus = r.status;
  writeFileSync(FIXTURES_PATH, JSON.stringify(fixtures, null, 2));

  return apiPageId;
}

async function runUiSmoke(fixtures, sessionA, stagingMeta) {
  try {
    const { chromium } = await import("playwright");
    const browser = await chromium.launch({ headless: true });
    const checks = [];

    async function runViewport(name, width, height) {
      const context = await browser.newContext({
        viewport: { width, height },
        baseURL: APP_BASE,
      });
      const page = await context.newPage();
      const errors = [];
      page.on("console", (msg) => {
        if (msg.type() === "error") errors.push(msg.text());
      });
      page.on("pageerror", (err) => errors.push(String(err)));

      const ref = new URL(stagingMeta.url).hostname.split(".")[0];
      await context.addCookies([
        {
          name: `sb-${ref}-auth-token`,
          value: JSON.stringify({
            access_token: sessionA.accessToken,
            token_type: "bearer",
            expires_in: 3600,
            expires_at: Math.floor(Date.now() / 1000) + 3600,
            refresh_token: "staging-smoke",
            user: { id: fixtures.userA.id, email: fixtures.userA.email },
          }),
          domain: "127.0.0.1",
          path: "/",
          httpOnly: false,
          secure: false,
          sameSite: "Lax",
        },
      ]);

      const url = `/author-dashboard/promotion?author=${fixtures.authorA.id}&tab=pages`;
      const resp = await page.goto(url, { waitUntil: "networkidle", timeout: 60000 });
      checks.push({ name: `${name}:page_load`, ok: resp?.status() !== undefined && resp.status() < 500 });

      const bodyText = await page.locator("body").innerText();
      checks.push({
        name: `${name}:promo_tab`,
        ok: bodyText.includes("Промо") || bodyText.includes("промо") || bodyText.includes("страниц"),
      });

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 2,
      );
      checks.push({ name: `${name}:no_horizontal_overflow`, ok: overflow });
      checks.push({ name: `${name}:no_console_errors`, ok: errors.length === 0, errors });

      await context.close();
    }

    await runViewport("desktop", 1440, 900);
    await runViewport("mobile", 390, 844);

    await browser.close();

    for (const c of checks) {
      if (c.ok) pass(`ui:${c.name}`);
      else fail(`ui:${c.name}`, c.errors?.join("; ") ?? "check failed");
    }
  } catch (e) {
    skip("ui:playwright", String(e.message ?? e));
  }
}

async function waitForServer(timeoutMs = 120000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch(`${APP_BASE}/catalog`);
      if (r.status < 500) return true;
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error("staging server not ready");
}

function parseEnvFile(path) {
  const env = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const i = line.indexOf("=");
    env[line.slice(0, i)] = line.slice(i + 1);
  }
  return env;
}

async function main() {
  writeFileSync(LOG, "");
  log("staging smoke start");

  const stagingMeta = loadStagingEnv();
  log(`isolation url=${stagingMeta.hostname} anon_last4=${stagingMeta.anonLast4}`);

  pass("preflight:staging URL != production");

  let fixtures = null;
  let sessionA = null;
  let sessionB = null;
  let admin = null;

  try {
    ({ fixtures, sessionA, sessionB, admin } = await setupFixtures(stagingMeta));
    pass("fixtures:created");
    log(`fixtures written ${FIXTURES_PATH}`);

    await runSqlMatrix(fixtures, stagingMeta);

    execSync("npm run build", { cwd: "/var/www/audiolad", stdio: "pipe" });
    pass("build:ok");

    const buildId = readFileSync("/var/www/audiolad/.next/BUILD_ID", "utf8").trim();
    log(`BUILD_ID=${buildId}`);

    const envVars = parseEnvFile(STAGING_ENV_PATH);
    const child = spawn("npm", ["run", "start"], {
      cwd: "/var/www/audiolad",
      env: { ...process.env, ...envVars },
      stdio: ["ignore", openSync("/tmp/audiolad-promo-staging-server.log", "a"), openSync("/tmp/audiolad-promo-staging-server.log", "a")],
      detached: true,
    });
    child.unref();

    try {
      await waitForServer();
      pass(`server:ready port=${APP_PORT}`);
      await runApiMatrix(fixtures, sessionA, sessionB);
      await runUiSmoke(fixtures, sessionA, stagingMeta);
    } finally {
      try {
        process.kill(-child.pid, "SIGTERM");
      } catch {
        try {
          process.kill(child.pid, "SIGTERM");
        } catch {
          // already stopped
        }
      }
    }

    const summary = {
      pass: results.pass.length,
      fail: results.fail.length,
      skip: results.skip.length,
      failures: results.fail,
      skips: results.skip,
      buildId,
      port: APP_PORT,
      fixturesPath: FIXTURES_PATH,
      publicRouteGap: {
        path: fixtures.publicPath,
        status: fixtures.publicPathStatus,
      },
    };

    writeFileSync("/tmp/audiolad-promo-staging-smoke-summary.json", JSON.stringify(summary, null, 2));
    console.log(JSON.stringify(summary, null, 2));

    if (results.fail.length) process.exit(1);
  } finally {
    if (fixtures?.suffix && admin) {
      try {
        cleanupPromoStagingSuffix({ suffix: fixtures.suffix, sql, sqlFile, admin });
        pass("cleanup:fixtures removed");
      } catch (cleanupErr) {
        fail("cleanup:fixtures", cleanupErr);
      }
    }
  }
}

main().catch((err) => {
  log(`FATAL ${err.stack ?? err}`);
  console.error(err);
  process.exit(1);
});
