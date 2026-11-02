/**
 * Stage 2 – isolated guest Auth stand (task 253821e0).
 *
 * Runs only against a disposable localhost stand started by
 * .github/workflows/business-guest-auth-stand.yml: Supabase Postgres + real
 * GoTrue v2.189.0 (anonymous sign-ins + before-user-created HTTP hook) +
 * PostgREST. The hook is the REAL Next route module served by a tiny Node
 * HTTP adapter; tickets are issued and consumed through the REAL service-role
 * code path. No production config, no production data, no PII: every secret is
 * generated per run and every email is synthetic.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { createServer, request as httpRequest, type IncomingMessage, type ServerResponse } from "node:http";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function localhostUrl(name: string): URL {
  const url = new URL(required(name));
  if (!["127.0.0.1", "localhost"].includes(url.hostname)) throw new Error(`${name} must be localhost`);
  return url;
}

if (process.env.AUDIOLAD_GUEST_AUTH_STAND !== "1") throw new Error("AUDIOLAD_GUEST_AUTH_STAND=1 is required");
const databaseUrl = localhostUrl("STAND_DATABASE_URL").toString();
if (!/\/audiolad_[a-z0-9_]+_stand$/.test(new URL(databaseUrl).pathname)) throw new Error("stand database name must be audiolad_*_stand");
const gotrueUrl = localhostUrl("STAND_GOTRUE_URL");
const postgrestUrl = localhostUrl("STAND_POSTGREST_URL");
const jwtSecret = required("STAND_JWT_SECRET");
const hookPort = Number(required("STAND_HOOK_PORT"));
const proxyPort = Number(required("STAND_PROXY_PORT"));
const ticketSecret = required("AUDIOLAD_BUSINESS_GUEST_TICKET_SECRET");
const hookSecret = required("AUDIOLAD_AUTH_HOOK_SECRET");
required("AUDIOLAD_BUSINESS_GUEST_AUTH_ENABLED");

const b64u = (value: string | Buffer) => Buffer.from(value).toString("base64url");
function signJwt(payload: Record<string, unknown>): string {
  const head = b64u(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64u(JSON.stringify(payload));
  return `${head}.${body}.${createHmac("sha256", jwtSecret).update(`${head}.${body}`).digest("base64url")}`;
}
function decodeJwt(token: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8"));
}
const iat = Math.floor(Date.now() / 1000);
const anonKey = signJwt({ role: "anon", iss: "supabase", iat, exp: iat + 3600 });
const serviceKey = signJwt({ role: "service_role", iss: "supabase", iat, exp: iat + 3600 });
const proxyBase = `http://127.0.0.1:${proxyPort}`;
process.env.NEXT_PUBLIC_SUPABASE_URL = proxyBase;
process.env.SUPABASE_SERVICE_ROLE_KEY = serviceKey;

function psql(sql: string): string {
  const result = spawnSync("psql", [databaseUrl, "-At", "-v", "ON_ERROR_STOP=1", "-c", sql], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(`psql failed: ${result.stderr}`);
  return result.stdout.trim();
}

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

// Real hook route, imported after env is in place (it reads env per call).
const { POST: hookPost } = await import("../src/app/api/auth/hooks/before-user-created/route");
const { issueBusinessGuestStartTicket } = await import("../src/lib/auth/business-guest/ticket.server");
const { issueGuestTicket, guestTicketNonceHash } = await import("../src/lib/auth/business-guest/ticket");

let hookCalls = 0;
const hookServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  try {
    if (req.method !== "POST" || req.url !== "/api/auth/hooks/before-user-created") {
      res.writeHead(404).end();
      return;
    }
    hookCalls += 1;
    const body = await readBody(req);
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (typeof value === "string") headers.set(key, value);
    }
    const response = await hookPost(new Request(`http://localhost:${hookPort}${req.url}`, { method: "POST", headers, body: body.toString("utf8") }));
    res.writeHead(response.status, { "content-type": response.headers.get("content-type") ?? "application/json" });
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch {
    res.writeHead(500, { "content-type": "application/json" }).end(JSON.stringify({ error: { http_code: 500, message: "stand_hook_error" } }));
  }
});

// supabase-js expects /auth/v1 and /rest/v1 behind one origin (Kong in prod).
const proxyServer = createServer((req: IncomingMessage, res: ServerResponse) => {
  const path = req.url ?? "/";
  const target = path.startsWith("/auth/v1/") ? gotrueUrl : path.startsWith("/rest/v1/") ? postgrestUrl : null;
  if (!target) {
    res.writeHead(404).end();
    return;
  }
  const upstream = httpRequest({
    hostname: target.hostname,
    port: target.port,
    method: req.method,
    path: path.replace(/^\/(auth|rest)\/v1/, ""),
    headers: { ...req.headers, host: target.host },
  }, (upstreamRes) => {
    res.writeHead(upstreamRes.statusCode ?? 502, upstreamRes.headers);
    upstreamRes.pipe(res);
  });
  upstream.on("error", () => res.writeHead(502).end());
  req.pipe(upstream);
});

await new Promise<void>((resolve) => hookServer.listen(hookPort, "127.0.0.1", resolve));
await new Promise<void>((resolve) => proxyServer.listen(proxyPort, "127.0.0.1", resolve));

const results: Array<{ scenario: string; ok: boolean; detail?: string }> = [];
async function scenario(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    results.push({ scenario: name, ok: true });
    process.stdout.write(`ok   – ${name}\n`);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    results.push({ scenario: name, ok: false, detail });
    process.stdout.write(`FAIL – ${name}: ${detail}\n`);
  }
}

const freshClient = (): SupabaseClient => createClient(proxyBase, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
const anonymousCount = () => Number(psql("SELECT count(*) FROM auth.users WHERE is_anonymous"));
const guestSignIn = (ticket?: string) => freshClient().auth.signInAnonymously(ticket ? { options: { data: { business_guest_ticket: ticket } } } : undefined);
async function registeredRawTicket(issuedAt = Math.floor(Date.now() / 1000)) {
  const { ticket, claims } = issueGuestTicket(ticketSecret, randomBytes(32).toString("hex"), issuedAt);
  psql(`INSERT INTO public.business_guest_auth_tickets(nonce_hash, expires_at) VALUES ('${guestTicketNonceHash(claims.nonce)}', now() + interval '2 minutes')`);
  return ticket;
}
async function expectGuestRejected(ticket: string | undefined) {
  const before = anonymousCount();
  const { data, error } = await guestSignIn(ticket);
  assert.ok(error, "anonymous sign-in must be rejected");
  assert.equal(data.session, null);
  assert.equal(anonymousCount(), before, "no anonymous auth.users row may be created");
}

// Seed one real starter practice so "guest gets no starter practices" is not vacuous.
const authorId = randomUUID();
const practiceId = randomUUID();
psql(`INSERT INTO auth.users(id, instance_id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  VALUES ('${authorId}', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'stand-author-${authorId.slice(0, 8)}@example.invalid', now(), '{}', '{}', now(), now())`);
psql(`INSERT INTO public.practices(id, author_id, title, slug, status, is_free, price, is_catalog_listed, audio_url)
  VALUES ('${practiceId}', '${authorId}', 'Stand starter', 'stand-starter-${practiceId.slice(0, 8)}', 'published', true, 0, true, 'https://example.invalid/a.mp3')`);
psql(`INSERT INTO public.starter_practices(practice_id, sort_order) VALUES ('${practiceId}', 1)`);

let guestSession: { access_token: string; user: { id: string } } | null = null;
let guestClient: SupabaseClient | null = null;
let ownerClient: SupabaseClient | null = null;
let ownerId = "";

await scenario("anonymous sign-in without ticket is rejected", () => expectGuestRejected(undefined));
await scenario("forged ticket (wrong HMAC secret) is rejected", async () => {
  const { ticket } = issueGuestTicket(randomBytes(32).toString("hex"), randomBytes(32).toString("hex"), Math.floor(Date.now() / 1000));
  await expectGuestRejected(ticket);
});
await scenario("valid HMAC but unregistered nonce is rejected", async () => {
  const { ticket } = issueGuestTicket(ticketSecret, randomBytes(32).toString("hex"), Math.floor(Date.now() / 1000));
  await expectGuestRejected(ticket);
});
await scenario("expired ticket is rejected", async () => expectGuestRejected(await registeredRawTicket(Math.floor(Date.now() / 1000) - 600)));

let validTicket = "";
await scenario("valid server-issued ticket creates an anonymous session", async () => {
  validTicket = await issueBusinessGuestStartTicket();
  const client = freshClient();
  const { data, error } = await client.auth.signInAnonymously({ options: { data: { business_guest_ticket: validTicket } } });
  assert.equal(error, null, error?.message);
  assert.ok(data.session);
  const claims = decodeJwt(data.session.access_token);
  assert.equal(claims.is_anonymous, true);
  assert.equal(claims.role, "authenticated");
  guestSession = data.session;
  guestClient = client;
  const id = data.session.user.id;
  assert.equal(psql(`SELECT is_anonymous FROM auth.users WHERE id = '${id}'`), "t");
  assert.equal(psql(`SELECT coalesce(email, '<null>') || '|' || role FROM public.profiles WHERE id = '${id}'`), "<null>|listener");
  assert.equal(psql(`SELECT count(*) FROM public.user_practices WHERE user_id = '${id}'`), "0", "guest must not get starter practices");
  assert.equal(psql("SELECT count(*) FROM public.business_guest_auth_tickets WHERE consumed_at IS NULL AND expires_at > now()"), "0");
});
await scenario("ticket replay is rejected", () => expectGuestRejected(validTicket));
await scenario("parallel sign-ins with one ticket: exactly one succeeds", async () => {
  const ticket = await issueBusinessGuestStartTicket();
  const before = anonymousCount();
  const outcomes = await Promise.all([guestSignIn(ticket), guestSignIn(ticket), guestSignIn(ticket)]);
  assert.equal(outcomes.filter((outcome) => outcome.data.session).length, 1);
  assert.equal(anonymousCount(), before + 1);
});
await scenario("flag off: issuer refuses and a registered ticket is rejected", async () => {
  const ticket = await registeredRawTicket();
  process.env.AUDIOLAD_BUSINESS_GUEST_AUTH_ENABLED = "0";
  try {
    await assert.rejects(issueBusinessGuestStartTicket(), /guest_start_unavailable/);
    await expectGuestRejected(ticket);
  } finally {
    process.env.AUDIOLAD_BUSINESS_GUEST_AUTH_ENABLED = "1";
  }
});
await scenario("hook secret mismatch fails closed (guest and email)", async () => {
  const ticket = await issueBusinessGuestStartTicket();
  process.env.AUDIOLAD_AUTH_HOOK_SECRET = `v1,whsec_${randomBytes(32).toString("base64")}`;
  try {
    await expectGuestRejected(ticket);
    const { error } = await freshClient().auth.signUp({ email: `stand-${randomBytes(6).toString("hex")}@yandex.ru`, password: randomBytes(18).toString("base64url") });
    assert.ok(error, "email sign-up must fail when the hook cannot verify GoTrue");
  } finally {
    process.env.AUDIOLAD_AUTH_HOOK_SECRET = hookSecret;
  }
});
await scenario("regular email sign-up still works (allowed domain, starter granted)", async () => {
  const client = freshClient();
  const { data, error } = await client.auth.signUp({ email: `stand-${randomBytes(6).toString("hex")}@yandex.ru`, password: randomBytes(18).toString("base64url") });
  assert.equal(error, null, error?.message);
  assert.ok(data.session, "stand uses autoconfirm");
  assert.equal(decodeJwt(data.session.access_token).is_anonymous, false);
  ownerId = data.session.user.id;
  ownerClient = client;
  assert.equal(psql(`SELECT (email IS NOT NULL)::text FROM public.profiles WHERE id = '${ownerId}'`), "true");
  assert.equal(psql(`SELECT count(*) FROM public.user_practices WHERE user_id = '${ownerId}'`), "1");
});
await scenario("email sign-up with a disallowed domain is rejected by the hook", async () => {
  const { error } = await freshClient().auth.signUp({ email: `stand-${randomBytes(6).toString("hex")}@example.invalid`, password: randomBytes(18).toString("base64url") });
  assert.ok(error);
});
await scenario("RLS with real guest JWT via PostgREST", async () => {
  assert.ok(guestClient && guestSession && ownerClient);
  const guest = guestClient as SupabaseClient;
  const owner = ownerClient as SupabaseClient;
  const guestId = (guestSession as { user: { id: string } }).user.id;

  const created = await owner.rpc("create_business_organization_with_location", {
    p_organization_name: "Stand owner", p_location_name: "Stand point", p_business_category: "cafe", p_country_code: "BB", p_timezone: "UTC",
  });
  assert.equal(created.error, null, created.error?.message);
  assert.equal((created.data as { ok?: boolean })?.ok, true);

  const profiles = await guest.from("profiles").select("id");
  assert.equal(profiles.error, null, profiles.error?.message);
  assert.deepEqual((profiles.data ?? []).map((row) => row.id), [guestId]);

  for (const table of ["business_organizations", "business_locations", "business_organization_members"]) {
    const rows = await guest.from(table).select("id");
    assert.ok(rows.error || (rows.data ?? []).length === 0, `guest must not read ${table}`);
  }
  const ownerOrgs = await owner.from("business_organizations").select("id");
  assert.equal(ownerOrgs.error, null, ownerOrgs.error?.message);
  assert.equal((ownerOrgs.data ?? []).length, 1);

  const guestOrg = await guest.rpc("create_business_organization_with_location", {
    p_organization_name: "Guest", p_location_name: "Guest point", p_business_category: "cafe", p_country_code: "BB", p_timezone: "UTC",
  });
  assert.ok(guestOrg.error || (guestOrg.data as { ok?: boolean })?.ok === false, "guest must not bootstrap via the public RPC");
  assert.equal(psql(`SELECT count(*) FROM public.business_organization_members WHERE user_id = '${guestId}'`), "0");

  const tickets = await guest.from("business_guest_auth_tickets").select("nonce_hash");
  assert.ok(tickets.error || (tickets.data ?? []).length === 0);
  const consume = await guest.rpc("consume_business_guest_auth_ticket", { p_nonce_hash: "a".repeat(64) });
  assert.ok(consume.error, "guest must not execute consume");
  const anonTickets = await freshClient().from("business_guest_auth_tickets").select("nonce_hash");
  assert.ok(anonTickets.error || (anonTickets.data ?? []).length === 0);

  await guest.from("profiles").update({ role: "admin" }).eq("id", guestId);
  assert.equal(psql(`SELECT role FROM public.profiles WHERE id = '${guestId}'`), "listener", "guest must not escalate profile role");
});

hookServer.close();
proxyServer.close();
const failed = results.filter((result) => !result.ok);
process.stdout.write(`\nbusiness-guest-auth-stand: ${results.length - failed.length}/${results.length} scenarios ok, hook calls ${hookCalls}\n`);
if (failed.length > 0) process.exit(1);
