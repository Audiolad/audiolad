#!/usr/bin/env node
import assert from "node:assert/strict";
import {
  cookieNameLooksLikeSupabaseAuth,
  getSupabaseAuthStorageKey,
  hasSupabaseAuthCookie,
} from "../src/lib/supabase/auth-cookie.ts";

assert.equal(
  getSupabaseAuthStorageKey("https://audiolad.ru"),
  "sb-audiolad-auth-token",
);
assert.equal(
  getSupabaseAuthStorageKey("https://abcdefgh.supabase.co"),
  "sb-abcdefgh-auth-token",
);

const key = "sb-audiolad-auth-token";
assert.equal(cookieNameLooksLikeSupabaseAuth(key, key), true);
assert.equal(cookieNameLooksLikeSupabaseAuth(`${key}.0`, key), true);
assert.equal(cookieNameLooksLikeSupabaseAuth(`${key}-code-verifier`, key), true);
assert.equal(cookieNameLooksLikeSupabaseAuth(`${key}-user`, key), true);
assert.equal(cookieNameLooksLikeSupabaseAuth("audiolad_studio_guest", key), false);
assert.equal(cookieNameLooksLikeSupabaseAuth("sb-other-auth-token", key), false);

assert.equal(hasSupabaseAuthCookie("", "https://audiolad.ru"), false);
assert.equal(
  hasSupabaseAuthCookie("theme=dark; locale=ru", "https://audiolad.ru"),
  false,
);
assert.equal(
  hasSupabaseAuthCookie("sb-audiolad-auth-token=base64-abc", "https://audiolad.ru"),
  true,
);
assert.equal(
  hasSupabaseAuthCookie(
    "sb-audiolad-auth-token.0=chunk; theme=dark",
    "https://audiolad.ru",
  ),
  true,
);
assert.equal(hasSupabaseAuthCookie("", undefined), true, "fail-closed without URL");

console.log("supabase-auth-cookie-unit: ok");
