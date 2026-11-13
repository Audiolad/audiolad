import assert from "node:assert/strict";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { linkBusinessLoginEmail, businessPasswordError, businessPasswordState } from "../src/lib/business-app/login-access";

const guest = { id: "session-owner", is_anonymous: true, user_metadata: {} } as User;
const permanent = { ...guest, is_anonymous: false, email: "owner@example.test" };
const promoted = { ...permanent, email_confirmed_at: "2026-11-13T00:00:00Z" };
function stub(result: unknown, refreshError: unknown = null) {
  const calls: Array<unknown> = [];
  const client = { auth: {
    updateUser: async (input: unknown) => { calls.push(input); return result; },
    refreshSession: async () => { calls.push("refresh"); return { error: refreshError }; },
  } } as unknown as Pick<SupabaseClient, "auth">;
  return { client, calls };
}
{
  const { client, calls } = stub({ data: { user: promoted }, error: null });
  assert.deepEqual(await linkBusinessLoginEmail(client, guest, " OWNER@EXAMPLE.TEST "), { ok: true, linked: true });
  assert.deepEqual(calls, [{ email: "owner@example.test", data: { receipt_email: "owner@example.test", business_login_linked: true } }, "refresh"]);
}
for (const code of ["email_exists", "email_address_in_use", "unexpected_failure"]) {
  const { client, calls } = stub({ data: { user: null }, error: { code, status: 422 } });
  const result = await linkBusinessLoginEmail(client, guest, "owner@example.test");
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, code === "unexpected_failure" ? "login_email_failed" : "receipt_email_taken");
  assert.equal(calls.length, 1, "no refresh after rejection");
}
for (const user of [null, { ...promoted, id: "different-owner" }, { ...promoted, is_anonymous: true }, { ...promoted, email: "other@example.test" }, { ...promoted, email_confirmed_at: undefined }]) {
  const { client } = stub({ data: { user }, error: null });
  assert.equal((await linkBusinessLoginEmail(client, guest, "owner@example.test")).ok, false);
}
{
  const { client, calls } = stub(null);
  assert.deepEqual(await linkBusinessLoginEmail(client, permanent, "different@example.test"), { ok: true, linked: false });
  assert.equal(calls.length, 0, "permanent login must never change");
  assert.equal((await linkBusinessLoginEmail(client, guest, "invalid")).ok, false);
  assert.equal(calls.length, 0);
}
{
  const { client } = stub({ data: { user: promoted }, error: null }, new Error("refresh failed"));
  assert.equal((await linkBusinessLoginEmail(client, guest, "owner@example.test")).ok, false);
}
assert.equal(businessPasswordError("1234567", "1234567") !== null, true);
assert.equal(businessPasswordError("12345678", "different") !== null, true);
assert.equal(businessPasswordError("12345678", "12345678"), null);
assert.equal(businessPasswordError(null, null) !== null, true);
assert.equal(businessPasswordState(guest), "unset");
assert.equal(businessPasswordState(permanent), "unknown", "email identity does not prove a password exists");
assert.equal(businessPasswordState({ ...permanent, user_metadata: { business_login_linked: true } }), "unset");
assert.equal(businessPasswordState({ ...permanent, user_metadata: { business_login_linked: true, business_password_saved: true } }), "set");
console.log("business-guest-login-unit: OK (mock auth only)");
