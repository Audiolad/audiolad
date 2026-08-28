import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { state } = require("../author-practice-access-test-state.cjs");

export async function loadActingAuthorMembership({ actingUserId, actingAuthorId }) {
  if (!state.actingMembership) {
    return null;
  }
  if (
    state.execution?.actingUserId === actingUserId &&
    state.execution?.actingAuthorId === actingAuthorId
  ) {
    return state.actingMembership;
  }
  return null;
}
