#!/usr/bin/env node
/**
 * Sign-up/email policy checks isolated from email-policy-unit avatar suite.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

function repoPath(...segments) {
  return path.join(REPO_ROOT, ...segments);
}

function readRepoFile(...segments) {
  return readFileSync(repoPath(...segments), "utf8");
}

function readSignUpFile(filename) {
  const grouped = repoPath(
    "src",
    "app",
    "(platform)",
    "auth",
    "sign-up",
    filename,
  );
  if (existsSync(grouped)) {
    return readFileSync(grouped, "utf8");
  }
  return readRepoFile("src", "app", "auth", "sign-up", filename);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function testAntiBypass() {
  const signUpAction = readSignUpFile("actions.ts");
  const signUpPage = readSignUpFile("page.tsx");
  const hookRoute = readRepoFile(
    "src",
    "app",
    "api",
    "auth",
    "hooks",
    "before-user-created",
    "route.ts",
  );

  assert(
    signUpAction.includes("validateEmailForRegistrationServer"),
    "server action validates allowlist",
  );
  assert(!signUpPage.includes("supabase.auth.signUp"), "UI no longer calls client signUp");
  assert(signUpPage.includes("signUpAction"), "UI uses server action");
  assert(
    hookRoute.includes("validateEmailForRegistrationServer"),
    "hook uses shared server policy",
  );
}

function testPreferencesAndConsents() {
  const preferences = readRepoFile("src", "lib", "email", "preferences.ts");
  const signUpAction = readSignUpFile("actions.ts");
  const signUpPage = readSignUpFile("page.tsx");

  assert(
    preferences.includes("listener_marketing: false"),
    "marketing preferences off by default",
  );
  assert(
    signUpAction.includes("if (input.marketingConsent"),
    "marketing consent only when checkbox checked",
  );
  assert(
    signUpPage.includes("listener_marketing_signup_v1_2026-07-17") ||
      signUpPage.includes("marketingConsent"),
    "marketing checkbox present",
  );
  assert(
    signUpPage.includes("evaluateSignUpClientFormState"),
    "sign-up uses unified client form state",
  );
  assert(
    signUpPage.includes("formState.isSubmitReady"),
    "submit button uses unified readiness",
  );
  assert(
    signUpPage.includes("firstNameTouched"),
    "sign-up tracks first name interaction",
  );
  assert(
    signUpPage.includes("lastNameTouched"),
    "sign-up tracks last name interaction",
  );
  assert(signUpPage.includes("/offer"), "legal offer link");
  assert(signUpPage.includes("/privacy"), "legal privacy link");
}

function testMaxSignupReusesSameBar() {
  const signUpAction = readSignUpFile("actions.ts");
  const maxBridge = readRepoFile(
    "src",
    "components",
    "max",
    "MaxBridgeScript.tsx",
  );
  const maxSignup = readRepoFile(
    "src",
    "components",
    "max",
    "MaxSignupForm.tsx",
  );

  assert(
    maxBridge.includes("signUpAction"),
    "MAX signup calls the same server action",
  );
  assert(
    !maxSignup.includes("supabase.auth.signUp"),
    "MAX signup UI does not call client signUp",
  );
  assert(
    maxSignup.includes("evaluateSignUpClientFormState"),
    "MAX signup uses unified client form state",
  );
  assert(maxSignup.includes("legalConsent"), "MAX signup requires legal consent");
  assert(
    maxSignup.includes("marketingConsent"),
    "MAX signup keeps optional marketing consent",
  );
  assert(
    maxSignup.includes("MAX_APEX_OFFER_HREF") &&
      maxSignup.includes("MAX_APEX_PRIVACY_HREF"),
    "MAX legal links use apex URLs",
  );
  assert(
    signUpAction.includes("hasSession: Boolean(data.session)"),
    "signUpAction still reports hasSession from data.session",
  );
  assert(
    !maxBridge.includes("generateLink") && !maxSignup.includes("generateLink"),
    "MAX signup must not use Admin generateLink",
  );
}

function main() {
  testAntiBypass();
  testPreferencesAndConsents();
  testMaxSignupReusesSameBar();
  console.log("sign-up-policy-unit: ok");
}

main();
