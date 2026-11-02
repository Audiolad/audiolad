import assert from "node:assert/strict";
import { createHmac, randomBytes } from "node:crypto";
import { authorizeAnonymousGuest, type GuestHookUser } from "../src/lib/auth/business-guest/authorize";
import { issueGuestTicket, verifyGuestTicket } from "../src/lib/auth/business-guest/ticket";
import { createBeforeUserCreatedHandler } from "../src/lib/auth/hooks/before-user-created";
import { getPublicPersonalEmailDomains, validateEmailForRegistrationServer } from "../src/lib/auth/email";

const secret = randomBytes(32).toString("hex");
const webhookKey = randomBytes(32);
const now = Math.floor(Date.now() / 1000);
const { ticket } = issueGuestTicket(secret, randomBytes(32).toString("hex"), now);
const base: GuestHookUser = { is_anonymous: true, app_metadata: { provider: "anonymous" }, user_metadata: { business_guest_ticket: ticket } };
let enabled = true;
let ticketSecret: string | undefined = secret;
let calls = 0;
const used = new Set<string>();
const handler = createBeforeUserCreatedHandler({
  hookSecret: () => webhookKey.toString("base64"),
  guestEnabled: () => enabled,
  authorizeGuest: (user) => authorizeAnonymousGuest({ user, enabled, secret: ticketSecret, now,
    consume: async (hash) => { calls++; if (used.has(hash)) return false; used.add(hash); return true; },
  }),
  validateEmail: validateEmailForRegistrationServer,
});
async function send(user: GuestHookUser, signed = true) {
  const raw = JSON.stringify({ metadata: { name: "before-user-created" }, user });
  const sig = createHmac("sha256", webhookKey).update(`test.${now}.${raw}`).digest("base64");
  return handler(new Request("https://test.invalid/hook", { method: "POST", body: raw, headers: {
    "webhook-id": "test", "webhook-timestamp": String(now), "webhook-signature": signed ? `v1,${sig}` : "invalid",
  } }));
}
assert.equal((await send(base, false)).status, 401);
assert.equal(calls, 0);
enabled = false;
assert.equal((await send(base)).status, 400);
assert.equal(calls, 0);
enabled = true;
assert.equal((await send(base)).status, 200);
assert.equal((await send(base)).status, 400); // replay
assert.equal(calls, 2);
const rejection = await (await send({ ...base, user_metadata: {} })).json();
for (const bad of [
  undefined,
  { purpose: "business_guest_start", nonce: "client" },
  "client-supplied-unsigned",
  ticket.slice(0, -1) + (ticket.endsWith("a") ? "b" : "a"),
  issueGuestTicket(secret, randomBytes(32).toString("hex"), now - 121).ticket,
  issueGuestTicket(secret, randomBytes(32).toString("hex"), now + 1).ticket,
]) {
  const response = await send({ ...base, user_metadata: { business_guest_ticket: bad } });
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), rejection);
}
const [body] = ticket.split(".");
const altered = JSON.parse(Buffer.from(body, "base64url").toString());
altered.purpose = "other";
const otherBody = Buffer.from(JSON.stringify(altered)).toString("base64url");
const other = `${otherBody}.${createHmac("sha256", secret).update(otherBody).digest("base64url")}`;
assert.equal((await send({ ...base, user_metadata: { business_guest_ticket: other } })).status, 400);
ticketSecret = undefined;
assert.equal((await send(base)).status, 400);
ticketSecret = secret;
assert.equal(verifyGuestTicket(ticket, "short", now), null);
assert.equal((await send({ ...base, app_metadata: { provider: "phone" } })).status, 400);
assert.equal((await send({ ...base, is_anonymous: false })).status, 400);
assert.equal(await authorizeAnonymousGuest({ user: base, enabled: true, secret, now, consume: async () => { throw new Error("offline"); } }), false);
// The real successful email path uses the existing allowlist, without storing an address.
const email = ["unit", getPublicPersonalEmailDomains()[0]].join(String.fromCharCode(64));
for (enabled of [false, true]) assert.equal((await send({ email, app_metadata: { provider: "email" } })).status, 200);
// Same email input and shared validator yield identical results in both modes.
// Empty email exercises the real validation policy without embedding an address.
for (const user of [{ email: "", app_metadata: { provider: "email" } }, { email: "" }, { app_metadata: { provider: "phone" } }]) {
  enabled = false; const before = await send(user);
  enabled = true; const after = await send(user);
  assert.equal(after.status, before.status);
  assert.deepEqual(await after.json(), await before.json());
}
// Isolate a successful email validation result from domain policy data.
const emailHandler = createBeforeUserCreatedHandler({ hookSecret: () => webhookKey.toString("base64"), guestEnabled: () => enabled,
  authorizeGuest: async () => { throw new Error("email must not consume"); }, validateEmail: () => ({ ok: true, normalizedEmail: "", domain: "" }),
});
const emailRaw = JSON.stringify({ user: { app_metadata: { provider: "email" } } });
for (enabled of [false, true]) {
  const sig = createHmac("sha256", webhookKey).update(`test.${now}.${emailRaw}`).digest("base64");
  const r = await emailHandler(new Request("https://test.invalid/hook", { method: "POST", body: emailRaw, headers: {
    "webhook-id": "test", "webhook-timestamp": String(now), "webhook-signature": `v1,${sig}`,
  } }));
  assert.equal(r.status, 200);
}
// Two concurrent deliveries of the same fresh capability cannot both succeed.
enabled = true;
const fresh = issueGuestTicket(secret, randomBytes(32).toString("hex"), now).ticket;
const concurrent = await Promise.all([0, 1].map(() => send({ ...base, user_metadata: { business_guest_ticket: fresh } })));
assert.deepEqual(concurrent.map((r) => r.status).sort(), [200, 400]);

console.log("business-guest-auth-hook-unit: ok");
