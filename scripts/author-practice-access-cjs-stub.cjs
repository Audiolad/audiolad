"use strict";

const Module = require("module");
const {
  createQueryClient,
  state,
} = require("./lib/author-practice-access-test-state.cjs");

const originalRequire = Module.prototype.require;

function matches(id, fragments) {
  const normalized = String(id).replaceAll("\\", "/");
  return fragments.some(
    (fragment) =>
      id === fragment ||
      normalized.includes(fragment) ||
      normalized.endsWith(fragment),
  );
}

function assertSupportAuthorScope({ actingAuthorId, requestedAuthorId }) {
  return Boolean(actingAuthorId && requestedAuthorId && actingAuthorId === requestedAuthorId);
}

const nextHeaders = {
  __esModule: true,
  headers: async () => ({
    get() {
      return null;
    },
  }),
  cookies: async () => ({
    getAll() {
      return [];
    },
    get() {
      return undefined;
    },
    set() {},
  }),
};

const supabaseServer = {
  __esModule: true,
  createClient: async () => createQueryClient(),
};

const supportContext = {
  __esModule: true,
  peekAuthorExecutionContext: async () => state.execution,
  getAuthorDataClient: async (execution, userClient) =>
    execution?.isSupportMode ? createQueryClient() : userClient,
  requestedAuthorMatchesSupport: (execution, requestedAuthorId) => {
    if (!execution?.isSupportMode || !execution.actingAuthorId) {
      return true;
    }
    return assertSupportAuthorScope({
      actingAuthorId: execution.actingAuthorId,
      requestedAuthorId,
    });
  },
};

const supportStore = {
  __esModule: true,
  loadActingAuthorMembership: async ({ actingUserId, actingAuthorId }) => {
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
  },
};

Module.prototype.require = function patchedRequire(id) {
  if (id === "server-only") {
    return {};
  }
  if (id === "next/headers") {
    return nextHeaders;
  }
  if (matches(id, ["src/lib/supabase/server", "@/lib/supabase/server"])) {
    return supabaseServer;
  }
  if (matches(id, ["src/lib/author-support/context", "@/lib/author-support/context"])) {
    return supportContext;
  }
  if (matches(id, ["src/lib/author-support/store", "@/lib/author-support/store"])) {
    return supportStore;
  }

  return originalRequire.apply(this, arguments);
};
