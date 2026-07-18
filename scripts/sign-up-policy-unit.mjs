#!/usr/bin/env node
/**
 * Sign-up/email policy checks isolated from email-policy-unit avatar suite.
 */
import { readFileSync } from "node:fs";
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

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function testAntiBypass() {
  const signUpAction = readRepoFile("src", "app", "auth", "sign-up", "actions.ts");
  const signUpPage = readRepoFile("src", "app", "auth", "sign-up", "page.tsx");
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
  const signUpAction = readRepoFile("src", "app", "auth", "sign-up", "actions.ts");
  const signUpPage = readRepoFile("src", "app", "auth", "sign-up", "page.tsx");

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

function main() {
  testAntiBypass();
  testPreferencesAndConsents();
  console.log("sign-up-policy-unit: ok");
}

main();
