import { createRequire } from "node:module";
import { assertSupportAuthorScope } from "../../../src/lib/author-support/policy.ts";

const require = createRequire(import.meta.url);
const { createQueryClient, state } = require("../author-practice-access-test-state.cjs");

export async function peekAuthorExecutionContext() {
  return state.execution;
}

export async function getAuthorDataClient(execution, userClient) {
  if (execution?.isSupportMode) {
    return createQueryClient();
  }
  return userClient;
}

export function requestedAuthorMatchesSupport(execution, requestedAuthorId) {
  if (!execution?.isSupportMode || !execution.actingAuthorId) {
    return true;
  }
  return assertSupportAuthorScope({
    actingAuthorId: execution.actingAuthorId,
    requestedAuthorId,
  });
}
