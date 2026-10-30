#!/usr/bin/env node
/**
 * POST /api/author/seo/proposals in support mode: the support audit row is
 * written before any Wordstat call or seo_queries / seo_query_proposals insert,
 * and an audit failure stops the request with zero inserts.
 * No network, no Supabase credentials.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  AUTHOR_SEO_PROPOSAL_SUPPORT_AUDIT,
  runAuthorSeoProposalFlow,
} from "../src/lib/seo-queries/author-proposal-flow.ts";
import { AUTHOR_SUPPORT_MUTATION_ACTIONS } from "../src/lib/author-support/policy.ts";
import { AUTHOR_SUPPORT_MUTATION_INVENTORY } from "../src/lib/author-support/mutation-inventory.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => readFileSync(path.join(root, relativePath), "utf8");

const authorId = "44444444-4444-4444-8444-444444444444";
const userId = "33333333-3333-4333-8333-333333333333";
const body = {
  author_id: authorId,
  seed_phrase: "медитация для сна",
  phrase: "медитация для сна слушать",
  publication_class: "practice",
};

class FakeSupportAuditError extends Error {
  constructor() {
    super("author_support_audit_failed");
    this.code = "author_support_audit_failed";
    this.status = 500;
  }
}

function createHarness({
  auditFails = false,
  membershipDenied = false,
  betaEnabled = true,
} = {}) {
  const events = [];
  const auditRows = [];
  const queryInserts = [];
  const proposalInserts = [];
  const membershipCalls = [];
  let wordstatCalls = 0;

  const normalize = async (phrase) => phrase.trim().toLowerCase().replace(/\s+/g, " ");

  const repository = {
    normalize,
    async findByNormalized() {
      return null;
    },
    async createQuery(input) {
      events.push("insert:seo_queries");
      const row = {
        id: `q-${queryInserts.length + 1}`,
        analysisStatus: input.analysisStatus,
        frequency: input.frequency,
        frequencyCheckedAt: input.frequencyCheckedAt,
        source: input.source,
      };
      queryInserts.push({ ...input });
      return { status: "created", query: row };
    },
    async findProposal() {
      return null;
    },
    async createProposal(input) {
      events.push("insert:seo_query_proposals");
      proposalInserts.push({ ...input });
      return { status: "created", id: `p-${proposalInserts.length}` };
    },
  };

  const deps = {
    isBetaEnabled: () => betaEnabled,
    // Mirrors requireAuthorMutationMembership(authorId, supportAudit):
    // membership check, then fail-closed audit insert, then return.
    async requireMutationMembership(requestedAuthorId, supportAudit) {
      membershipCalls.push({ requestedAuthorId, supportAudit });
      events.push("membership");
      if (membershipDenied) {
        const error = new Error("forbidden");
        error.status = 403;
        throw error;
      }
      if (!supportAudit) {
        return { user: { id: userId } };
      }
      events.push("audit:attempt");
      if (auditFails) {
        throw new FakeSupportAuditError();
      }
      auditRows.push({
        action: supportAudit.action,
        resourceType: supportAudit.resourceType ?? "author",
        resourceId: requestedAuthorId,
      });
      events.push("audit:written");
      return { user: { id: userId } };
    },
    async fetchWordstatSuggestions(seedPhrase, options) {
      wordstatCalls += 1;
      events.push("wordstat");
      assert.equal(options.userId, userId);
      return {
        ok: true,
        data: {
          phrase: seedPhrase,
          suggestions: [
            { phrase: "медитация для сна слушать", count: 1200 },
            { phrase: "медитация для сна", count: 9000 },
          ],
        },
      };
    },
    normalize,
    createRepository: () => repository,
  };

  return {
    deps,
    events,
    auditRows,
    queryInserts,
    proposalInserts,
    membershipCalls,
    get wordstatCalls() {
      return wordstatCalls;
    },
  };
}

// Contract constant: known action, matches the inventory row.
assert.deepEqual(AUTHOR_SEO_PROPOSAL_SUPPORT_AUDIT, {
  action: "author_seo_query_proposed",
  resourceType: "author_seo",
});
assert.ok(AUTHOR_SUPPORT_MUTATION_ACTIONS.includes("author_seo_query_proposed"));
const proposalInventory = AUTHOR_SUPPORT_MUTATION_INVENTORY.find(
  (item) => item.key === "author_seo_query_proposal",
);
assert.equal(proposalInventory?.disposition, "allowed_audited");
assert.equal(proposalInventory?.action, AUTHOR_SEO_PROPOSAL_SUPPORT_AUDIT.action);
assert.deepEqual(proposalInventory?.routePatterns, [
  "src/app/api/author/seo/proposals/route.ts",
]);

// 1. Audit failure → request fails, 0 inserts, no Wordstat call.
{
  const h = createHarness({ auditFails: true });
  await assert.rejects(
    () => runAuthorSeoProposalFlow({ ...body }, h.deps),
    (error) => error instanceof FakeSupportAuditError,
  );
  assert.equal(h.membershipCalls.length, 1);
  assert.deepEqual(h.membershipCalls[0].supportAudit, AUTHOR_SEO_PROPOSAL_SUPPORT_AUDIT);
  assert.equal(h.membershipCalls[0].requestedAuthorId, authorId);
  assert.equal(h.auditRows.length, 0);
  assert.equal(h.queryInserts.length, 0, "audit failure must not insert seo_queries");
  assert.equal(h.proposalInserts.length, 0, "audit failure must not insert seo_query_proposals");
  assert.equal(h.wordstatCalls, 0, "audit failure must stop before Wordstat");
  assert.deepEqual(h.events, ["membership", "audit:attempt"]);
}

// 2. Success → audit row written before Wordstat and before both inserts.
{
  const h = createHarness();
  const result = await runAuthorSeoProposalFlow({ ...body }, h.deps);
  assert.equal(result.status, 201);
  assert.equal(result.body.status, "proposed");
  assert.equal(result.proposed?.authorId, authorId);
  assert.equal(result.proposed?.count, 1200);
  assert.deepEqual(h.auditRows, [
    { action: "author_seo_query_proposed", resourceType: "author_seo", resourceId: authorId },
  ]);
  assert.equal(h.queryInserts.length, 1);
  assert.equal(h.proposalInserts.length, 1);
  assert.equal(h.proposalInserts[0].submittedByUserId, userId);
  assert.deepEqual(h.events, [
    "membership",
    "audit:attempt",
    "audit:written",
    "wordstat",
    "insert:seo_queries",
    "insert:seo_query_proposals",
  ]);
}

// 3. Membership denied → error propagates, 0 inserts.
{
  const h = createHarness({ membershipDenied: true });
  await assert.rejects(() => runAuthorSeoProposalFlow({ ...body }, h.deps), /forbidden/);
  assert.equal(h.queryInserts.length + h.proposalInserts.length, 0);
  assert.equal(h.wordstatCalls, 0);
}

// 4. Invalid request / beta disabled → no membership, no audit, no inserts.
{
  const h = createHarness();
  const result = await runAuthorSeoProposalFlow({ author_id: authorId }, h.deps);
  assert.equal(result.status, 400);
  assert.equal(h.membershipCalls.length, 0);
  assert.equal(h.queryInserts.length + h.proposalInserts.length, 0);
}
{
  const h = createHarness({ betaEnabled: false });
  const result = await runAuthorSeoProposalFlow({ ...body }, h.deps);
  assert.equal(result.status, 403);
  assert.equal(result.body.error, "seo_discovery_beta_disabled");
  assert.equal(h.membershipCalls.length, 0);
  assert.equal(h.queryInserts.length + h.proposalInserts.length, 0);
}

// 5. Static wiring: the route uses the real fail-closed helper and the flow.
const route = read("src/app/api/author/seo/proposals/route.ts");
assert.match(route, /runAuthorSeoProposalFlow\(body,/);
assert.match(route, /requireMutationMembership: requireAuthorMutationMembership,/);
assert.match(route, /handleAuthorRouteError\(error\)/);
assert.doesNotMatch(route, /proposeAuthorSeoQuery\(/);
assert.doesNotMatch(route, /requireAuthorMutationMembership\(authorId\)/);

const flow = read("src/lib/seo-queries/author-proposal-flow.ts");
const membershipAt = flow.indexOf(
  "deps.requireMutationMembership(\n    authorId,\n    AUTHOR_SEO_PROPOSAL_SUPPORT_AUDIT,\n  )",
);
assert.ok(membershipAt > 0, "flow passes AUTHOR_SEO_PROPOSAL_SUPPORT_AUDIT");
assert.ok(membershipAt < flow.indexOf("deps.fetchWordstatSuggestions("));
assert.ok(membershipAt < flow.indexOf("proposeAuthorSeoQuery(\n"));
assert.doesNotMatch(flow, /catch\s*\(/, "flow must not swallow audit errors");

// requireAuthorMutationMembership writes the audit before returning context.
const auth = read("src/lib/author-products/auth.ts");
const helper = auth.slice(
  auth.indexOf("export async function requireAuthorMutationMembership("),
  auth.indexOf("function asWriteRole("),
);
assert.match(helper, /if \(supportAudit\) \{/);
assert.ok(helper.indexOf("await recordAuthorSupportAudit(") < helper.indexOf("return context;"));

const audit = read("src/lib/author-support/audit.ts");
assert.match(audit, /if \(error\) \{\s*throw new AuthorSupportAuditError\(\);/);

console.log("author-seo-proposal-support-audit-unit: ok");
