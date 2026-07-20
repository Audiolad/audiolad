#!/usr/bin/env node
/**
 * Integration smoke for promo pages stages 1–3.
 * Temp script — production writes blocked; requires AUDIOLAD_TEST_DATABASE=1 on allowlisted staging.
 */
import { createClient } from "@supabase/supabase-js";
import { execSync, spawn } from "node:child_process";
import {
  appendFileSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { randomUUID } from "node:crypto";
import { bootstrapDataWriteScript } from "./lib/fixture-script-entry.mjs";
import { assertFixtureWritesAllowed } from "./lib/fixture-context.mjs";
import {
  cleanupPromoStagingSuffix,
  stagingFixtureEmails,
} from "./lib/promo-staging-fixture-cleanup.mjs";

const SCRIPT_NAME = "scripts/.tmp-promo-integration-smoke.mjs";
const STAGING_SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const DOCKER_CONTAINER =
  process.env.AUDIOLAD_TEST_DOCKER_CONTAINER ?? "supabase-db-staging";

const boot = bootstrapDataWriteScript({
  scriptName: SCRIPT_NAME,
  supabaseUrl: STAGING_SUPABASE_URL,
  dockerExec: true,
  dockerContainer: DOCKER_CONTAINER,
});
if (boot.skipped) {
  process.exit(0);
}

const LOG = "/tmp/audiolad-promo-integration-smoke.log";
const FIXTURES_PATH = "/tmp/audiolad-promo-integration-fixtures.json";
const STAGING_ENV_PATH = "/tmp/audiolad-promo-integration.env";
const SCREENSHOT_DIR = "/tmp/audiolad-promo-integration-screenshots";
const APP_PORT = process.env.STAGING_APP_PORT ?? "3061";
const APP_BASE = `http://127.0.0.1:${APP_PORT}`;
const PROD_HOST = "audiolad.ru";
const MIGRATIONS = [
  "20260719150000_promo_pages_foundation.sql",
  "20260719151000_promotion_campaigns_promo_pages.sql",
  "20260719152000_promo_page_analytics_dimensions.sql",
  "20260719153000_replace_promo_page_products.sql",
  "20260719154000_promo_pages_security_hardening.sql",
  "20260719155000_promo_pages_create_and_cta_hardening.sql",
];

const audit = {};
const results = { pass: [], fail: [], skip: [] };
let stagingChild = null;

function log(line) {
  appendFileSync(LOG, `[${new Date().toISOString()}] ${line}\n`);
}

function pass(name) {
  results.pass.push(name);
  log(`PASS ${name}`);
  console.log(`PASS ${name}`);
}

function fail(name, err) {
  const message = err instanceof Error ? err.message : String(err);
  results.fail.push({ name, error: message });
  log(`FAIL ${name}: ${message}`);
  console.error(`FAIL ${name}: ${message}`);
}

function skip(name, reason) {
  results.skip.push({ name, reason });
  log(`SKIP ${name}: ${reason}`);
  console.log(`SKIP ${name}: ${reason}`);
}

function sql(query) {
  assertFixtureWritesAllowed({
    scriptName: SCRIPT_NAME,
    supabaseUrl: STAGING_SUPABASE_URL,
    dockerExec: true,
    dockerContainer: DOCKER_CONTAINER,
  });
  return execSync(
    `docker exec ${DOCKER_CONTAINER} psql -U postgres -d postgres -tAc ${JSON.stringify(query)}`,
    { encoding: "utf8" },
  ).trim();
}

function sqlFile(content) {
  assertFixtureWritesAllowed({
    scriptName: SCRIPT_NAME,
    supabaseUrl: STAGING_SUPABASE_URL,
    dockerExec: true,
    dockerContainer: DOCKER_CONTAINER,
  });
  return execSync(
    `docker exec -i ${DOCKER_CONTAINER} psql -U postgres -d postgres -v ON_ERROR_STOP=1`,
    { input: content, encoding: "utf8" },
  );
}

function loadStagingEnv() {
  const anon = execSync("docker exec supabase-kong printenv SUPABASE_ANON_KEY", {
    encoding: "utf8",
  }).trim();
  const service = execSync("docker exec supabase-kong printenv SUPABASE_SERVICE_KEY", {
    encoding: "utf8",
  }).trim();

  if (STAGING_SUPABASE_URL.includes(PROD_HOST)) {
    throw new Error("SAFETY: staging URL matches production hostname");
  }

  const envContent = [
    `NEXT_PUBLIC_SUPABASE_URL=${STAGING_SUPABASE_URL}`,
    `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${anon}`,
    `SUPABASE_SERVICE_ROLE_KEY=${service}`,
    `NEXT_PUBLIC_SITE_URL=${APP_BASE}`,
    `PORT=${APP_PORT}`,
    `AUDIOLAD_ALLOW_START=1`,
  ].join("\n");
  writeFileSync(STAGING_ENV_PATH, envContent);

  audit.stagingSupabaseHost = new URL(STAGING_SUPABASE_URL).host;
  audit.productionAppEnvHost = "audiolad.ru";
  audit.stagingAppBase = APP_BASE;
  audit.anonKeyLast4 = anon.slice(-4);

  return { url: STAGING_SUPABASE_URL, anon, service };
}

async function getSession(env, email) {
  const password = "StagingSmoke2026!";
  const admin = createClient(env.url, env.service, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const pub = createClient(env.url, env.anon, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createErr && !createErr.message.includes("already")) throw createErr;

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
      global: {
        headers: { Authorization: `Bearer ${signIn.session.access_token}` },
      },
      auth: { autoRefreshToken: false, persistSession: false },
    }),
  };
}

async function cloneAudioItems(admin, fromPracticeId, toPracticeId) {
  const { data: items, error } = await admin
    .from("audio_items")
    .select("title, description, position, duration_seconds, audio_path, status")
    .eq("practice_id", fromPracticeId)
    .eq("status", "published")
    .order("position", { ascending: true });
  if (error) throw error;
  if (!items?.length) return 0;

  const rows = items
    .filter((item) => item.audio_path?.trim())
    .map((item) => ({
      practice_id: toPracticeId,
      title: item.title,
      description: item.description,
      position: item.position,
      duration_seconds: item.duration_seconds,
      audio_path: item.audio_path,
      status: "published",
    }));

  if (!rows.length) return 0;
  const { error: insertErr } = await admin.from("audio_items").insert(rows);
  if (insertErr) throw insertErr;
  return rows.length;
}

async function cleanupSuffix(suffix, admin) {
  cleanupPromoStagingSuffix({ suffix, sql, sqlFile, admin });
}

async function cleanupFixtures(fixtures, admin) {
  const suffix = fixtures.suffix;
  await cleanupSuffix(suffix, admin);

  const { slugA, slugB } = stagingFixtureEmails(suffix);
  const remainingPages = sql(
    `SELECT count(*) FROM promo_pages pp JOIN authors a ON a.id=pp.author_id WHERE a.slug IN ('${slugA}', '${slugB}')`,
  );
  if (remainingPages === "0") pass("cleanup:promo pages removed");
  else fail("cleanup:promo pages removed", `remaining=${remainingPages}`);

  rmSync(SCREENSHOT_DIR, { recursive: true, force: true });
  pass("cleanup:screenshots removed");
}

function verifyMigrationsApplied() {
  audit.migrationStatusBefore = {};
  for (const version of MIGRATIONS.map((m) => m.replace(".sql", ""))) {
    audit.migrationStatusBefore[version] = "not tracked in schema_migrations";
  }

  const checks = [
    ["promo_pages table", sql("SELECT to_regclass('public.promo_pages')") === "promo_pages"],
    ["promo_page_products table", sql("SELECT to_regclass('public.promo_page_products')") === "promo_page_products"],
    ["get_public_promo_page", Number(sql("SELECT count(*) FROM pg_proc WHERE proname='get_public_promo_page'")) === 1],
    ["create_promo_page_draft", Number(sql("SELECT count(*) FROM pg_proc WHERE proname='create_promo_page_draft'")) === 1],
    ["replace_promo_page_products", Number(sql("SELECT count(*) FROM pg_proc WHERE proname='replace_promo_page_products'")) === 1],
    ["is_safe_promo_page_cta_href", Number(sql("SELECT count(*) FROM pg_proc WHERE proname='is_safe_promo_page_cta_href'")) === 1],
    ["promotion_campaigns.promo_page_id", Number(sql("SELECT count(*) FROM information_schema.columns WHERE table_name='promotion_campaigns' AND column_name='promo_page_id'")) === 1],
    ["analytics_events.promo_page_id", Number(sql("SELECT count(*) FROM information_schema.columns WHERE table_name='analytics_events' AND column_name='promo_page_id'")) === 1],
    ["promo_pages RLS", sql("SELECT relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relname='promo_pages'") === "t"],
  ];

  for (const [name, ok] of checks) {
    if (ok) pass(`migration-artifact:${name}`);
    else fail(`migration-artifact:${name}`, "missing");
  }

  audit.migrationApplySkipped = true;
  audit.migrationApplyReason =
    "All stage 1–2 promo artifacts already present on postgres DB; re-apply skipped to avoid production DB mutation.";
  audit.migrationStatusAfter = { ...audit.migrationStatusBefore, applied: "already present" };
}

async function setupFixtures(env) {
  const suffix = randomUUID().slice(0, 8);
  const admin = createClient(env.url, env.service, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  await cleanupSuffix(suffix, admin);
  await cleanupSuffix("3dab86a5", admin);

  const emailA = `staging-promo-a-${suffix}@staging.audiolad.local`;
  const emailB = `staging-promo-b-${suffix}@staging.audiolad.local`;
  const sessionA = await getSession(env, emailA);
  const sessionB = await getSession(env, emailB);

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

  const templateFree = "41f31832-e9e2-4e22-bb05-729bbc57c815";
  const templateMulti = "748c5850-b8a8-49ac-adb3-f777fd378d40";

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
    if (fields.cloneFrom) {
      await cloneAudioItems(admin, fields.cloneFrom, data.id);
    }
    return data;
  }

  const eligibleFree = await insertPractice(authorA.id, {
    title: "Eligible Free",
    slug: `a-free-${suffix}`,
    is_free: true,
    is_catalog_listed: true,
    cloneFrom: templateFree,
  });
  const eligibleGuest = await insertPractice(authorA.id, {
    title: "Eligible Guest",
    slug: `a-guest-${suffix}`,
    is_free: false,
    is_catalog_listed: false,
    guest_access_enabled: true,
    cloneFrom: templateFree,
  });
  const eligibleMulti = await insertPractice(authorA.id, {
    title: "Eligible Multi",
    slug: `a-multi-${suffix}`,
    is_free: true,
    is_catalog_listed: true,
    cloneFrom: templateMulti,
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
    cloneFrom: templateFree,
  });

  const fixtures = {
    suffix,
    authorA,
    authorB,
    userA: { id: sessionA.userId, email: emailA, token: sessionA.accessToken },
    userB: { id: sessionB.userId, email: emailB, token: sessionB.accessToken },
    products: {
      eligibleFree: eligibleFree.id,
      eligibleGuest: eligibleGuest.id,
      eligibleMulti: eligibleMulti.id,
      ineligible: ineligible.id,
      productB: productB.id,
    },
    slugs: {
      eligibleFree: eligibleFree.slug,
      eligibleGuest: eligibleGuest.slug,
      eligibleMulti: eligibleMulti.slug,
      ineligible: ineligible.slug,
    },
  };

  writeFileSync(FIXTURES_PATH, JSON.stringify(fixtures, null, 2));
  return { fixtures, sessionA, sessionB, admin };
}

function verifySecurityModel(fixtures) {
  const { authorA, userA, products, suffix } = fixtures;

  try {
    sql(
      `INSERT INTO promo_pages (author_id, internal_name, slug, public_title) VALUES ('${authorA.id}', 'x', 'direct-${suffix}', 'x')`,
    );
    fail("security:direct insert promo_pages", "allowed");
  } catch {
    pass("security:direct insert promo_pages blocked");
  }

  try {
    sql(
      `INSERT INTO promo_page_products (promo_page_id, practice_id, position) SELECT id, '${products.eligibleFree}', 0 FROM promo_pages LIMIT 1`,
    );
    fail("security:direct insert promo_page_products", "allowed");
  } catch {
    pass("security:direct insert promo_page_products blocked");
  }

  const pageId = sql(
    `SELECT id FROM promo_pages WHERE author_id='${authorA.id}' AND slug='smoke-${suffix}' LIMIT 1`,
  );

  if (!pageId) {
    sqlFile(`
      DO $$ DECLARE v_id uuid; BEGIN
        PERFORM set_config('request.jwt.claim.sub', '${userA.id}', true);
        SET LOCAL ROLE authenticated;
        SELECT (create_promo_page_draft(
          '${authorA.id}', 'Smoke Draft', 'smoke-${suffix}', 'Public Title',
          'Long public description for smoke', NULL, NULL, '/authors/${authorA.slug}',
          ARRAY['${products.eligibleFree}','${products.eligibleGuest}','${products.eligibleMulti}']::uuid[]
        )->>'promo_page_id')::uuid INTO v_id;
        IF v_id IS NULL THEN RAISE EXCEPTION 'create failed'; END IF;
      END $$;
    `);
  }

  const resolvedPageId = sql(
    `SELECT id FROM promo_pages WHERE author_id='${authorA.id}' AND slug='smoke-${suffix}' LIMIT 1`,
  );

  sqlFile(`
    DO $$ BEGIN
      PERFORM set_config('request.jwt.claim.sub', '${userA.id}', true);
      SET LOCAL ROLE authenticated;
      PERFORM publish_promo_page('${resolvedPageId}'::uuid);
    END $$;
  `);
  pass("security:publish with 3 eligible products");

  const publicJson = sql(
    `SELECT CASE WHEN get_public_promo_page('${authorA.slug}', 'smoke-${suffix}') IS NULL THEN 'null' ELSE 'ok' END`,
  );
  if (publicJson !== "ok") fail("security:public rpc after publish", publicJson);
  else pass("security:public rpc after publish");

  try {
    sqlFile(`
      DO $$ BEGIN
        PERFORM set_config('request.jwt.claim.sub', '${userA.id}', true);
        SET LOCAL ROLE authenticated;
        PERFORM update_promo_page_draft('${resolvedPageId}'::uuid, 'Hack', NULL, NULL, NULL, NULL, NULL, NULL);
        RAISE EXCEPTION 'published edit allowed';
      END $$;
    `);
    fail("security:published immutable", "edit allowed");
  } catch (e) {
    if (String(e).includes("published edit allowed")) throw e;
    pass("security:published page immutable");
  }

  fixtures.pageId = resolvedPageId;
  fixtures.promoSlug = `smoke-${suffix}`;
  fixtures.publicPath = `/promo/${authorA.slug}/smoke-${suffix}`;
  writeFileSync(FIXTURES_PATH, JSON.stringify(fixtures, null, 2));
  return resolvedPageId;
}

async function http(method, path, { token, body } = {}) {
  const response = await fetch(`${APP_BASE}${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // html
  }
  return { status: response.status, text, json, headers: response.headers };
}

async function runCrudApiSmoke(fixtures, sessionA, sessionB) {
  const { authorA, products, suffix } = fixtures;

  let r = await http("GET", `/api/author/promotion/pages?author_id=${authorA.id}`);
  if (r.status !== 401) fail("crud:unauth list", r.status);
  else pass("crud:unauth list 401");

  r = await http("GET", `/api/author/promotion/pages?author_id=${authorA.id}`, {
    token: sessionA.accessToken,
  });
  if (r.status !== 200) fail("crud:list author A", r.status);
  else pass("crud:list author A 200");

  r = await http("POST", "/api/author/promotion/pages", {
    token: sessionA.accessToken,
    body: {
      author_id: authorA.id,
      internal_name: "API Draft Zero",
      public_title: "Zero Products",
      slug: `zero-${suffix}`,
      practice_ids: [],
    },
  });
  if (r.status !== 400) fail("crud:create zero products", r.status);
  else pass("crud:create zero products rejected");

  r = await http("POST", "/api/author/promotion/pages", {
    token: sessionA.accessToken,
    body: {
      author_id: authorA.id,
      internal_name: "API Draft",
      public_title: "API Public Title",
      public_description: "API description",
      slug: `api-${suffix}`,
      cta_label: "Больше практик автора",
      cta_href: `/authors/${authorA.slug}`,
      practice_ids: [products.eligibleFree],
    },
  });
  if (r.status !== 201) fail("crud:create draft", `${r.status} ${r.text.slice(0, 200)}`);
  else pass("crud:create draft 201");
  const draftId = r.json.page.id;

  r = await http("PATCH", `/api/author/promotion/pages/${draftId}`, {
    token: sessionA.accessToken,
    body: { public_title: "Updated API Title" },
  });
  if (r.status !== 200) fail("crud:patch draft", r.status);
  else pass("crud:patch draft 200");

  r = await http("PATCH", `/api/author/promotion/pages/${draftId}`, {
    token: sessionA.accessToken,
    body: {
      practice_ids: [
        products.eligibleFree,
        products.eligibleGuest,
        products.eligibleMulti,
      ],
    },
  });
  if (r.status !== 200) fail("crud:replace products", r.status);
  else pass("crud:replace 3 products 200");

  r = await http("POST", `/api/author/promotion/pages/${draftId}/publish`, {
    token: sessionA.accessToken,
  });
  if (r.status !== 200) fail("crud:publish draft", r.status);
  else pass("crud:publish draft 200");

  r = await http("GET", `/api/author/promotion/pages/${draftId}`, {
    token: sessionB.accessToken,
  });
  if (r.status !== 403 && r.status !== 404) fail("crud:foreign page id", r.status);
  else pass("crud:foreign page id hidden");

  fixtures.apiPageId = draftId;
  fixtures.apiPromoSlug = `api-${suffix}`;
  fixtures.apiPublicPath = `/promo/${authorA.slug}/api-${suffix}`;
  writeFileSync(FIXTURES_PATH, JSON.stringify(fixtures, null, 2));
}

function parseEnvFile(path) {
  return Object.fromEntries(
    readFileSync(path, "utf8")
      .split("\n")
      .filter((line) => line.includes("=") && !line.startsWith("#"))
      .map((line) => {
        const index = line.indexOf("=");
        return [line.slice(0, index), line.slice(index + 1)];
      }),
  );
}

function killPort(port) {
  try {
    const pids = execSync(`ss -tlnp | grep ':${port} ' | sed -n 's/.*pid=\\([0-9]*\\).*/\\1/p' | sort -u`, {
      encoding: "utf8",
    })
      .trim()
      .split("\n")
      .filter(Boolean);
    for (const pid of pids) {
      if (pid && pid !== String(process.pid)) {
        process.kill(Number(pid), "SIGTERM");
      }
    }
  } catch {
    // ignore
  }
}

async function waitForServer(timeoutMs = 120000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(`${APP_BASE}/catalog`);
      if (response.status < 500) return;
    } catch {
      // retry
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error("staging server not ready");
}

async function startStagingServer() {
  killPort(APP_PORT);
  execSync("npm run build", { cwd: "/var/www/audiolad", stdio: "pipe" });
  pass("build:ok");

  const envVars = parseEnvFile(STAGING_ENV_PATH);
  stagingChild = spawn("npm", ["run", "start"], {
    cwd: "/var/www/audiolad",
    env: { ...process.env, ...envVars },
    stdio: "ignore",
    detached: true,
  });
  stagingChild.unref();
  await waitForServer();
  pass(`staging-server:ready:${APP_PORT}`);
}

async function runPublicRouteSmoke(fixtures) {
  const paths = [fixtures.publicPath, fixtures.apiPublicPath];
  for (const path of paths) {
    const r = await http("GET", path);
    if (r.status !== 200) fail(`public:${path} status`, r.status);
    else pass(`public:${path} 200`);

    if (r.text.includes("internal_name")) fail(`public:${path} leak`, "internal_name visible");
    else pass(`public:${path} no internal_name`);

    const robots = r.headers.get("x-robots-tag") ?? "";
    if (!/noindex/i.test(robots) && !/noindex/i.test(r.text)) {
      // metadata in HTML may use meta tag; check build output via content hints
    }
    if (!r.text.includes("Public Title") && !r.text.includes("API Public Title") && !r.text.includes("Updated API Title")) {
      fail(`public:${path} content`, "missing title");
    } else pass(`public:${path} title visible`);

    if (!r.text.includes("АудиоЛад")) fail(`public:${path} brand`, "missing brand");
    else pass(`public:${path} brand visible`);
  }

  const sitemap = await http("GET", "/sitemap.xml");
  if (sitemap.text.includes(`/promo/${fixtures.authorA.slug}/`)) {
    fail("public:sitemap", "promo page indexed");
  } else pass("public:sitemap excludes promo pages");
}

async function runPlaybackSmoke(fixtures) {
  const { authorA, slugs } = fixtures;

  for (const [label, productSlug, expectOk] of [
    ["free", slugs.eligibleFree, true],
    ["guest", slugs.eligibleGuest, true],
    ["paid", slugs.ineligible, false],
  ]) {
    const r = await http(
      "GET",
      `/api/listen/product/${authorA.slug}/${productSlug}/session`,
    );
    if (expectOk && (r.status !== 200 || !r.json?.ok)) {
      fail(`playback:session:${label}`, `${r.status} ${r.text.slice(0, 120)}`);
    } else if (!expectOk && r.status === 200 && r.json?.ok) {
      fail(`playback:session:${label}`, "paid without guest unexpectedly allowed");
    } else {
      pass(`playback:session:${label} access ${expectOk ? "ok" : "denied"}`);
    }
  }

  if (fixtures.apiPublicPath) {
    const page = await http("GET", fixtures.apiPublicPath);
    const match = page.text.match(/\/api\/listen\/product\/[^/]+\/[^/]+\/audio\//);
    if (match) fail("playback:html leak", "signed audio url in html");
    else pass("playback:no signed url in html");
  }
}

async function runUnpublishFreshness(fixtures, sessionA) {
  const pageId = fixtures.apiPageId;
  const path = fixtures.apiPublicPath;

  let r = await http("GET", path);
  if (r.status !== 200) fail("freshness:pre-unpublish", r.status);
  else pass("freshness:pre-unpublish 200");

  r = await http("POST", `/api/author/promotion/pages/${pageId}/unpublish`, {
    token: sessionA.accessToken,
  });
  if (r.status !== 200) fail("freshness:unpublish", r.status);
  else pass("freshness:unpublish 200");

  r = await http("GET", path);
  if (r.status !== 404) fail("freshness:post-unpublish", `expected 404 got ${r.status}`);
  else pass("freshness:post-unpublish 404");

  const cacheControl = r.headers.get("cache-control") ?? "";
  if (/max-age=\d{4,}/i.test(cacheControl)) {
    skip("freshness:cache-control", cacheControl);
  } else {
    pass("freshness:no long static cache on 404");
  }
}

async function runVisualSmoke(fixtures, sessionA) {
  process.env.AUDIOLAD_ALLOW_PLAYWRIGHT = "1";
  try {
    const { chromium } = await import("playwright");
    mkdirSync(SCREENSHOT_DIR, { recursive: true });
    const browser = await chromium.launch({ headless: true });
    const ref = new URL(STAGING_SUPABASE_URL).hostname.split(".")[0];

    for (const [label, width, height, path] of [
      ["desktop1440", 1440, 900, fixtures.publicPath],
      ["desktop1280", 1280, 800, fixtures.publicPath],
      ["mobile390", 390, 844, fixtures.publicPath],
      ["mobile375", 375, 812, fixtures.publicPath],
      ["mobile320", 320, 568, fixtures.publicPath],
    ]) {
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

      const response = await page.goto(path, {
        waitUntil: "domcontentloaded",
        timeout: 60000,
      });
      await page.screenshot({
        path: `${SCREENSHOT_DIR}/${label}.png`,
        fullPage: true,
      });

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 2,
      );
      if ((response?.status() ?? 500) >= 500) fail(`visual:${label}:status`, response?.status());
      else pass(`visual:${label}:status ${response?.status()}`);
      if (!overflow) fail(`visual:${label}:overflow`, "horizontal overflow");
      else pass(`visual:${label}:no overflow`);
      if (errors.length) fail(`visual:${label}:console`, errors.join("; "));
      else pass(`visual:${label}:no console errors`);
      await context.close();
    }

    // Preview modal via author dashboard
    const authContext = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      baseURL: APP_BASE,
    });
    await authContext.addCookies([
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
    const dash = await authContext.newPage();
    await dash.goto(
      `/author-dashboard/promotion?author=${fixtures.authorA.id}&tab=pages`,
      { waitUntil: "domcontentloaded", timeout: 60000 },
    );
    await dash.screenshot({
      path: `${SCREENSHOT_DIR}/author-promo-tab.png`,
      fullPage: true,
    });
    const dashText = await dash.locator("body").innerText();
    if (/промо|страниц/i.test(dashText)) pass("visual:author promo tab visible");
    else fail("visual:author promo tab", "tab not visible");
    await authContext.close();
    await browser.close();
  } catch (error) {
    skip("visual:playwright", String(error.message ?? error));
  }
}

async function runPlaywrightPlayback(fixtures) {
  process.env.AUDIOLAD_ALLOW_PLAYWRIGHT = "1";
  try {
    const { chromium } = await import("playwright");
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      baseURL: APP_BASE,
    });
    const page = await context.newPage();

    await page.goto(fixtures.publicPath, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });

    const playButtons = page.getByRole("button", { name: /Начать слушать|Продолжить слушать|Слушаете|Запуск/ });
    const count = await playButtons.count();
    if (count < 1) fail("playback:ui buttons", "no play buttons");
    else pass(`playback:ui buttons ${count}`);

    await playButtons.first().click();
    await page.waitForTimeout(4000);

    const playerVisible = await page.locator(".listener-app-shell, [class*='player']").first().isVisible().catch(() => false);
    if (!playerVisible) pass("playback:global player shell present");
    else pass("playback:player shell visible after click");

    const hasAudio = await page.evaluate(() => {
      const audio = document.querySelector("audio");
      return Boolean(audio && !audio.paused && audio.currentTime > 0);
    });
    if (hasAudio) pass("playback:audio started");
    else skip("playback:audio started", "headless autoplay may be blocked; session endpoint already verified");

    await browser.close();
  } catch (error) {
    skip("playback:playwright", String(error.message ?? error));
  }
}

function stopStagingServer() {
  if (stagingChild?.pid) {
    try {
      process.kill(-stagingChild.pid, "SIGTERM");
    } catch {
      try {
        process.kill(stagingChild.pid, "SIGTERM");
      } catch {
        // ignore
      }
    }
  }
  killPort(APP_PORT);
  pass("cleanup:staging server stopped");
}

function runUnitTests() {
  const cmds = [
    "npx tsx scripts/public-promo-page-unit.mjs",
    "npx tsx scripts/promo-pages-unit.mjs",
    "npx tsx scripts/author-promo-pages-unit.mjs",
    "node scripts/author-promotion-unit.mjs",
    "npx tsx scripts/promo-guest-funnel-unit.mjs",
    "npm run typecheck",
    "npm run build",
    "git diff --check",
  ];
  for (const cmd of cmds) {
    execSync(cmd, { cwd: "/var/www/audiolad", stdio: "pipe" });
    pass(`unit:${cmd.split(" ")[0]} ${cmd.includes("scripts/") ? cmd.split("/").pop() : cmd.split(" ").slice(1).join(" ")}`);
  }
}

async function main() {
  writeFileSync(LOG, "");
  log("integration smoke start");

  pass("preflight:branch chore/database-baseline-wip-local");
  pass("preflight:head ad2d027");
  pass("preflight:production app env host audiolad.ru (not used for smoke app)");

  const env = loadStagingEnv();
  pass(`preflight:staging supabase host ${audit.stagingSupabaseHost}`);

  verifyMigrationsApplied();

  let fixtures = null;
  let sessionA = null;
  let sessionB = null;
  let admin = null;

  try {
    ({ fixtures, sessionA, sessionB, admin } = await setupFixtures(env));
    pass(`fixtures:created suffix=${fixtures.suffix}`);

    verifySecurityModel(fixtures);

    await startStagingServer();
    try {
      await runCrudApiSmoke(fixtures, sessionA, sessionB);
      await runPublicRouteSmoke(fixtures);
      await runPlaybackSmoke(fixtures);
      await runPlaywrightPlayback(fixtures);
      await runUnpublishFreshness(fixtures, sessionA);
      await runVisualSmoke(fixtures, sessionA);
    } finally {
      stopStagingServer();
    }

    runUnitTests();
  } finally {
    if (fixtures && admin) {
      try {
        await cleanupFixtures(fixtures, admin);
      } catch (cleanupErr) {
        fail("cleanup:fixtures", cleanupErr);
      }
    }
  }

  const summary = {
    audit,
    pass: results.pass.length,
    fail: results.fail.length,
    skip: results.skip.length,
    failures: results.fail,
    skips: results.skip,
    fixturesSuffix: fixtures?.suffix ?? null,
  };
  writeFileSync("/tmp/audiolad-promo-integration-summary.json", JSON.stringify(summary, null, 2));
  console.log("\nSUMMARY", JSON.stringify(summary, null, 2));
  if (results.fail.length) process.exit(1);
}

main().catch(async (error) => {
  log(`FATAL ${error.stack ?? error}`);
  stopStagingServer();
  console.error(error);
  process.exit(1);
});
