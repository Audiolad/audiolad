import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  createSignedRecoveryIntent,
  getRecoveryIntentSecret,
  isSignedRecoveryIntentValid,
} from "../src/lib/auth/recovery-intent-crypto";
import { buildPasswordRecoveryRedirectUrl } from "../src/lib/auth/recovery";

const root = path.resolve(import.meta.dirname, "..");
const read = (...parts: string[]) => readFileSync(path.join(root, ...parts), "utf8");

const recovery = read("src/lib/auth/recovery.ts");
const template = read("src/lib/email/templates/recovery.ts");
const generatedTemplate = read("supabase/templates/recovery.html");
const landing = read("src/app/(platform)/auth/recovery/page.tsx");
const landingAction = read("src/app/(platform)/auth/recovery/actions.ts");
const resetAction = read("src/app/(platform)/auth/reset-password/actions.ts");
const resetLayout = read("src/app/(platform)/auth/reset-password/layout.tsx");
const callback = read("src/app/(platform)/auth/callback/route.ts");
const intent = read("src/lib/auth/recovery-intent.ts");
const intentCrypto = read("src/lib/auth/recovery-intent-crypto.ts");

// Redirect construction preserves valid local continuation only; the existing
// navigation suite exercises external, protocol-relative and malformed input.
assert.match(recovery, /resolveValidatedNextPath/);
assert.match(recovery, /\/auth\/recovery/);
assert.doesNotMatch(recovery, /\/auth\/callback/);
assert.equal(
  buildPasswordRecoveryRedirectUrl("/my-practices?from=recovery"),
  "https://audiolad.ru/auth/recovery?next=%2Fmy-practices%3Ffrom%3Drecovery",
);
assert.equal(buildPasswordRecoveryRedirectUrl("https://evil.example"), "https://audiolad.ru/auth/recovery");

// GoTrue template variables were verified against v2.189.0 source/docs.
assert.match(template, /\{\{ \.RedirectTo \}\}#token_hash=\{\{ \.TokenHash \}\}&type=recovery/);
assert.doesNotMatch(template, /ConfirmationURL/);
assert.match(generatedTemplate, /\{\{ \.RedirectTo \}\}#token_hash=\{\{ \.TokenHash \}\}&amp;type=recovery/);
assert.doesNotMatch(generatedTemplate, /ConfirmationURL/);

// A GET renders only a landing. It stages the fragment after history cleanup;
// only the explicit button invokes the consuming server-side verifyOtp call.
assert.match(landing, /history\.replaceState/);
assert.match(landing, /stageRecoveryTokenAction/);
assert.match(landing, /onClick=\{continueRecovery\}/);
assert.doesNotMatch(landing, /verifyOtp/);
assert.match(landingAction, /verifyOtp\(\{[\s\S]*token_hash:[\s\S]*type: "recovery"/);
assert.match(landingAction, /RECOVERY_STAGE_COOKIE/);
assert.match(landingAction, /clearStageCookie/);

// The marker is server-signed, short-lived, and bound to the verified user
// without putting any user id or bearer into the cookie value.
assert.match(intent, /getRecoveryIntentSecret/);
assert.match(intent, /httpOnly: true/);
assert.match(intent, /sameSite: "lax"/);
assert.match(intentCrypto, /RECOVERY_INTENT_MAX_AGE_SECONDS = 10 \* 60/);
assert.match(intentCrypto, /signIntent\(secret, nonce, expiresAt, userId\)/);
assert.doesNotMatch(intent, /MAX_BOT_TOKEN/);
assert.match(intentCrypto, /createHmac/);

const originalSecret = process.env.PASSWORD_RECOVERY_INTENT_SECRET;
delete process.env.PASSWORD_RECOVERY_INTENT_SECRET;
assert.throws(() => getRecoveryIntentSecret());
process.env.PASSWORD_RECOVERY_INTENT_SECRET = "test-only-recovery-intent-secret";

const testSecret = getRecoveryIntentSecret();
const validIntent = createSignedRecoveryIntent(testSecret, "user-a");
assert.equal(isSignedRecoveryIntentValid(testSecret, validIntent, "user-a"), true);
assert.equal(isSignedRecoveryIntentValid(testSecret, validIntent, "user-b"), false);
const tamperedIntent = `${validIntent.startsWith("A") ? "B" : "A"}${validIntent.slice(1)}`;
assert.equal(isSignedRecoveryIntentValid(testSecret, tamperedIntent, "user-a"), false);
const expiredIntent = createSignedRecoveryIntent(testSecret, "user-a", 0);
assert.equal(isSignedRecoveryIntentValid(testSecret, expiredIntent, "user-a"), false);
if (originalSecret === undefined) {
  delete process.env.PASSWORD_RECOVERY_INTENT_SECRET;
} else {
  process.env.PASSWORD_RECOVERY_INTENT_SECRET = originalSecret;
}

// Reset is impossible for an ordinary authenticated session: both getUser and
// a valid recovery intent are required. Success clears both cookies and logs
// out before navigating to the signed-out success banner.
assert.match(resetAction, /supabase\.auth\.getUser/);
assert.match(resetAction, /hasValidRecoveryIntent/);
assert.match(resetAction, /supabase\.auth\.updateUser/);
assert.match(resetAction, /supabase\.auth\.signOut\(\{[\s\S]*scope: "local"/);
assert.match(resetAction, /RECOVERY_INTENT_COOKIE/);
assert.match(resetAction, /RECOVERY_STAGE_COOKIE/);
assert.match(resetAction, /buildPostPasswordResetSignInHref/);
assert.doesNotMatch(resetAction, /error\.message/);
assert.match(resetAction, /signOutError/);
assert.match(resetLayout, /hasValidRecoveryIntent/);
assert.match(resetLayout, /supabase\.auth\.getUser/);
assert.match(resetLayout, /if \(user && hasValidRecoveryIntent/);

// Callback remains the PKCE path for all non-recovery consumers.
assert.match(callback, /exchangeCodeForSession/);

console.log("password-recovery-hardening-unit: ok");
