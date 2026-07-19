#!/usr/bin/env node

import { resolveSubmitSuccessFlow } from "../src/lib/author-applications/submit-success-flow.ts";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function baseInput(overrides = {}) {
  return {
    submitted: true,
    hasSubmittedContacts: true,
    contactUpdateSubmitPending: false,
    initialSubmitAlreadyHandled: false,
    ...overrides,
  };
}

function testInitialSubmitHandledOnce() {
  assert(
    resolveSubmitSuccessFlow(baseInput()).type === "complete_initial_submit",
    "first submit should complete initial flow",
  );
  assert(
    resolveSubmitSuccessFlow(
      baseInput({ initialSubmitAlreadyHandled: true }),
    ).type === "noop",
    "initial submit should not repeat after handled",
  );
}

function testContactUpdateAfterInitialSubmit() {
  assert(
    resolveSubmitSuccessFlow(
      baseInput({
        initialSubmitAlreadyHandled: true,
        contactUpdateSubmitPending: true,
      }),
    ).type === "complete_contact_update",
    "contact update should complete even after initial submit",
  );
}

function testEditModeWithoutPendingSubmit() {
  assert(
    resolveSubmitSuccessFlow(
      baseInput({
        initialSubmitAlreadyHandled: true,
        contactUpdateSubmitPending: false,
      }),
    ).type === "noop",
    "opening edit mode must not trigger success flow",
  );
}

function testIncompleteSuccessState() {
  assert(
    resolveSubmitSuccessFlow(baseInput({ submitted: false })).type === "noop",
    "missing submitted flag should noop",
  );
  assert(
    resolveSubmitSuccessFlow(baseInput({ hasSubmittedContacts: false })).type ===
      "noop",
    "missing contacts should noop",
  );
}

function testRepeatedContactUpdates() {
  assert(
    resolveSubmitSuccessFlow(
      baseInput({
        initialSubmitAlreadyHandled: true,
        contactUpdateSubmitPending: true,
      }),
    ).type === "complete_contact_update",
    "second contact update should still complete",
  );
}

function main() {
  testInitialSubmitHandledOnce();
  testContactUpdateAfterInitialSubmit();
  testEditModeWithoutPendingSubmit();
  testIncompleteSuccessState();
  testRepeatedContactUpdates();
  console.log("author-application-submit-success-flow-unit: all tests passed");
}

main();
