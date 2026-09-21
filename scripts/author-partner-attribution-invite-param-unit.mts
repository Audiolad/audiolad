import assert from "node:assert/strict";
import test from "node:test";

import { decodeInviteCodeParam } from "../src/lib/author-partner/invite-code-param";

test("plain codes pass through", () => {
  assert.equal(decodeInviteCodeParam("SERGEY"), "SERGEY");
  assert.equal(decodeInviteCodeParam("  marina  "), "marina");
});

test("already-decoded params are unchanged", () => {
  assert.equal(decodeInviteCodeParam("hello world"), "hello world");
});

test("malformed percent sequences return empty (safe 404), never throw", () => {
  assert.equal(decodeInviteCodeParam("%"), "");
  assert.equal(decodeInviteCodeParam("%E0%A4%A"), "");
  assert.equal(decodeInviteCodeParam("%%"), "");
  assert.doesNotThrow(() => decodeInviteCodeParam("%"));
});

test("valid percent-encoding still decodes", () => {
  assert.equal(decodeInviteCodeParam("A%2FB"), "A/B");
});

test("nullish / blank → empty", () => {
  assert.equal(decodeInviteCodeParam(undefined), "");
  assert.equal(decodeInviteCodeParam(null), "");
  assert.equal(decodeInviteCodeParam("   "), "");
});
