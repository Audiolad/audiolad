import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  createSignedRecoveryIntent,
  getRecoveryIntentSecret,
  isSignedRecoveryIntentValid,
} from "../src/lib/auth/recovery-intent-crypto";
import { buildPasswordRecoveryRedirectUrl } from "../src/lib/auth/recovery";
import { getRecoveryLandingState } from "../src/lib/auth/recovery-landing";
import {
  applyRecoveryContinueOutcome,
  decideRecoveryVerifyAction,
  decideStageCookieAfterVerify,
  isStructuredVerifyFailureRetryable,
} from "../src/lib/auth/recovery-continue";
import {
  PASSWORD_RECOVERY_VERIFY_TEMPORARY_ERROR,
  PASSWORD_RECOVERY_VERIFY_TRANSPORT_ERROR,
  PASSWORD_RESET_EXPIRED_MESSAGE,
} from "../src/lib/auth/recovery-messages";

const root = path.resolve(import.meta.dirname, "..");
const read = (...parts: string[]) => readFileSync(path.join(root, ...parts), "utf8");

const recovery = read("src/lib/auth/recovery.ts");
const template = read("src/lib/email/templates/recovery.ts");
const generatedTemplate = read("supabase/templates/recovery.html");
const landing = read("src/app/(platform)/auth/recovery/recovery-landing.tsx");
const recoveryPage = read("src/app/(platform)/auth/recovery/page.tsx");
const landingAction = read("src/app/(platform)/auth/recovery/actions.ts");
const resetAction = read("src/app/(platform)/auth/reset-password/actions.ts");
const resetLayout = read("src/app/(platform)/auth/reset-password/layout.tsx");
const callback = read("src/app/(platform)/auth/callback/route.ts");
const intent = read("src/lib/auth/recovery-intent.ts");
const intentCrypto = read("src/lib/auth/recovery-intent-crypto.ts");
const messages = read("src/lib/auth/recovery-messages.ts");

const continueMessages = {
  temporary: PASSWORD_RECOVERY_VERIFY_TEMPORARY_ERROR,
  expired: PASSWORD_RESET_EXPIRED_MESSAGE,
  transport: PASSWORD_RECOVERY_VERIFY_TRANSPORT_ERROR,
};

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
assert.match(landingAction, /decideStageCookieAfterVerify/);
assert.match(landingAction, /decideRecoveryVerifyAction/);
assert.match(landingAction, /applyStageDecision/);
assert.match(landingAction, /password_recovery_verify_started/);
assert.match(landingAction, /password_recovery_verify_exception/);
assert.match(landingAction, /password_recovery_post_verify_failure/);
assert.match(landingAction, /PASSWORD_RECOVERY_VERIFY_TEMPORARY_ERROR/);
assert.match(landingAction, /PASSWORD_RECOVERY_VERIFY_TRANSPORT_ERROR/);
assert.match(landingAction, /verify_not_resolved_exception/);
assert.match(landingAction, /post_verify_failure/);

// Pre-terminal catch wraps only createClient + verifyOtp assignment.
const verifyFn = landingAction.slice(
  landingAction.indexOf("export async function verifyRecoveryTokenAction"),
);
const phase1Try = verifyFn.indexOf("// PHASE 1");
const phase2Try = verifyFn.indexOf("// PHASE 2");
assert.ok(phase1Try > 0);
assert.ok(phase2Try > phase1Try);
const preTerminalSlice = verifyFn.slice(phase1Try, phase2Try);
assert.match(preTerminalSlice, /verifyOtp\(/);
assert.match(preTerminalSlice, /verify_not_resolved_exception/);
assert.doesNotMatch(preTerminalSlice, /createRecoveryIntent/);
assert.doesNotMatch(preTerminalSlice, /RECOVERY_INTENT_COOKIE/);
assert.doesNotMatch(preTerminalSlice, /buildResetPasswordRouteWithNext/);
assert.doesNotMatch(preTerminalSlice, /post_verify_failure/);

const postSuccessSlice = verifyFn.slice(phase2Try);
assert.match(postSuccessSlice, /createRecoveryIntent/);
assert.match(postSuccessSlice, /post_verify_failure/);
assert.doesNotMatch(postSuccessSlice, /verify_not_resolved_exception/);
assert.doesNotMatch(postSuccessSlice, /PASSWORD_RECOVERY_VERIFY_TEMPORARY_ERROR/);

const verifyIdx = verifyFn.indexOf("verifyOtp(");
const firstStageDecisionIdx = verifyFn.indexOf("applyStageDecision(");
assert.ok(verifyIdx > 0);
assert.ok(firstStageDecisionIdx > verifyIdx);

assert.match(landing, /try \{/);
assert.match(landing, /finally \{/);
assert.match(landing, /setIsVerifying\(false\)/);
assert.match(landing, /PASSWORD_RECOVERY_VERIFY_TEMPORARY_ERROR/);
assert.match(landing, /PASSWORD_RECOVERY_VERIFY_TRANSPORT_ERROR/);
assert.match(landing, /kind: "transport_error"/);
assert.match(messages, /PASSWORD_RECOVERY_VERIFY_TRANSPORT_ERROR/);
assert.notEqual(
  PASSWORD_RECOVERY_VERIFY_TEMPORARY_ERROR,
  PASSWORD_RECOVERY_VERIFY_TRANSPORT_ERROR,
);
assert.doesNotMatch(landingAction, /console\.(?:info|warn|error|log)\([^)]*tokenHash/);
assert.doesNotMatch(landingAction, /console\.(?:info|warn|error|log)\([^)]*token_hash/);
assert.doesNotMatch(landingAction, /console\.(?:info|warn|error|log)\([^)]*email/);
assert.doesNotMatch(landingAction, /console\.(?:info|warn|error|log)\([^)]*session/);
assert.doesNotMatch(landingAction, /console\.(?:info|warn|error|log)\([^)]*user\.id/);

// Runtime decision model (same helper production uses).
assert.deepEqual(decideRecoveryVerifyAction({ verifyStatus: "verify_not_resolved_exception" }), {
  stage: "keep",
  retryable: true,
  resultKind: "temporary",
});
assert.deepEqual(decideRecoveryVerifyAction({ verifyStatus: "invalid_or_expired" }), {
  stage: "clear",
  retryable: false,
  resultKind: "expired",
});
assert.deepEqual(decideRecoveryVerifyAction({ verifyStatus: "success" }), {
  stage: "clear",
  retryable: false,
  resultKind: "success",
});
assert.deepEqual(decideRecoveryVerifyAction({ verifyStatus: "post_verify_failure" }), {
  stage: "clear",
  retryable: false,
  resultKind: "non_retryable",
});
assert.equal(decideStageCookieAfterVerify({ verifyStatus: "verify_not_resolved_exception" }), "keep");
assert.equal(decideStageCookieAfterVerify({ verifyStatus: "invalid_or_expired" }), "clear");
assert.equal(decideStageCookieAfterVerify({ verifyStatus: "success" }), "clear");
assert.equal(decideStageCookieAfterVerify({ verifyStatus: "post_verify_failure" }), "clear");
assert.equal(isStructuredVerifyFailureRetryable("verify_not_resolved_exception"), true);
assert.equal(isStructuredVerifyFailureRetryable("post_verify_failure"), false);
assert.equal(isStructuredVerifyFailureRetryable("invalid_or_expired"), false);
assert.equal(isStructuredVerifyFailureRetryable("success"), false);

// Continue UI outcomes.
const successUi = applyRecoveryContinueOutcome(
  { kind: "success", destination: "/auth/reset-password" },
  continueMessages,
);
assert.equal(successUi.isVerifying, false);
assert.equal(successUi.ready, true);
assert.equal(successUi.shouldNavigateTo, "/auth/reset-password");
assert.equal(successUi.error, "");

const actionErrorUi = applyRecoveryContinueOutcome(
  { kind: "action_error", message: PASSWORD_RESET_EXPIRED_MESSAGE },
  continueMessages,
);
assert.equal(actionErrorUi.isVerifying, false);
assert.equal(actionErrorUi.ready, false);
assert.equal(actionErrorUi.error, PASSWORD_RESET_EXPIRED_MESSAGE);
assert.equal(actionErrorUi.shouldNavigateTo, null);

const temporaryActionUi = applyRecoveryContinueOutcome(
  {
    kind: "action_error",
    message: PASSWORD_RECOVERY_VERIFY_TEMPORARY_ERROR,
    retryable: true,
  },
  continueMessages,
);
assert.equal(temporaryActionUi.isVerifying, false);
assert.equal(temporaryActionUi.ready, true);
assert.equal(temporaryActionUi.error, PASSWORD_RECOVERY_VERIFY_TEMPORARY_ERROR);

// verify success → later throw maps to non-retryable structured result.
const postSuccessFailureUi = applyRecoveryContinueOutcome(
  {
    kind: "action_error",
    message: PASSWORD_RECOVERY_VERIFY_TRANSPORT_ERROR,
    retryable: isStructuredVerifyFailureRetryable("post_verify_failure"),
  },
  continueMessages,
);
assert.equal(postSuccessFailureUi.isVerifying, false);
assert.equal(postSuccessFailureUi.ready, false);
assert.equal(postSuccessFailureUi.error, PASSWORD_RECOVERY_VERIFY_TRANSPORT_ERROR);
assert.equal(postSuccessFailureUi.shouldNavigateTo, null);

const transportUi = applyRecoveryContinueOutcome(
  { kind: "transport_error" },
  continueMessages,
);
assert.equal(transportUi.isVerifying, false);
assert.equal(transportUi.ready, false);
assert.equal(transportUi.error, PASSWORD_RECOVERY_VERIFY_TRANSPORT_ERROR);
assert.equal(transportUi.shouldNavigateTo, null);

assert.match(landing, /\{ready \? \(/);
assert.match(landing, /Попробовать ещё раз/);
assert.match(landing, /Запросить новую ссылку/);
assert.match(landing, /\/auth\/forgot-password/);
assert.match(landing, /isVerifying \? "Проверяем…" : "Продолжить"/);
// Client only marks TEMPORARY as retryable — post-success transport text is not.
assert.match(
  landing,
  /result\.message === PASSWORD_RECOVERY_VERIFY_TEMPORARY_ERROR/,
);

assert.match(
  landingAction,
  /applyStageDecision\(cookieStore, "verify_not_resolved_exception"\)/,
);
assert.match(
  landingAction,
  /applyStageDecision\(cookieStore, "invalid_or_expired"\)/,
);
assert.match(landingAction, /applyStageDecision\(cookieStore, "success"\)/);
assert.match(
  landingAction,
  /applyStageDecision\(cookieStore, "post_verify_failure"\)/,
);

const validTokenHash = "a".repeat(20);

// Remount regression (#449) — pure state machine, no Supabase.
assert.equal(
  getRecoveryLandingState({
    tokenHash: validTokenHash,
    type: "recovery",
    hasStagedRecovery: false,
    stagedSuccessfullyInMount: false,
  }),
  "stage",
);
assert.equal(
  getRecoveryLandingState({
    tokenHash: validTokenHash,
    type: "recovery",
    hasStagedRecovery: true,
    stagedSuccessfullyInMount: false,
  }),
  "stage",
);
assert.equal(
  getRecoveryLandingState({
    tokenHash: null,
    type: null,
    hasStagedRecovery: true,
    stagedSuccessfullyInMount: false,
  }),
  "ready",
);
assert.equal(
  getRecoveryLandingState({
    tokenHash: null,
    type: null,
    hasStagedRecovery: false,
    stagedSuccessfullyInMount: true,
  }),
  "ready",
);
assert.equal(
  getRecoveryLandingState({
    tokenHash: null,
    type: null,
    hasStagedRecovery: false,
    stagedSuccessfullyInMount: false,
  }),
  "expired",
);
assert.equal(
  getRecoveryLandingState({
    tokenHash: "malformed",
    type: "recovery",
    hasStagedRecovery: false,
    stagedSuccessfullyInMount: false,
  }),
  "expired",
);
assert.equal(
  getRecoveryLandingState({
    tokenHash: "malformed",
    type: "recovery",
    hasStagedRecovery: true,
    stagedSuccessfullyInMount: false,
  }),
  "ready",
);

assert.match(recoveryPage, /readRecoveryStage\(cookieStore\)/);
assert.match(recoveryPage, /initialHasStagedRecovery=\{initialHasStagedRecovery\}/);
assert.doesNotMatch(recoveryPage, /tokenHash/);
assert.match(landing, /onClick=\{continueRecovery\}/);
assert.match(landing, /verifyRecoveryTokenAction\(\)/);
assert.doesNotMatch(landing, /useState\(initialHasStagedRecovery\)/);
assert.equal(
  landing.indexOf("verifyRecoveryTokenAction()") >
    landing.indexOf("async function continueRecovery"),
  true,
);

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

assert.match(callback, /exchangeCodeForSession/);

console.log("password-recovery-hardening-unit: ok");
