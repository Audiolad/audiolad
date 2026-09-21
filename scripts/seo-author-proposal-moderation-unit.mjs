#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (path) => readFileSync(join(root, path), "utf8");

const shell = read("src/components/admin/AdminShell.tsx");
assert.match(shell, /max-w-none/);
assert.doesNotMatch(shell, /max-w-\[960px\]/);
assert.match(shell, /\bpx-4\b/);
assert.match(shell, /\bsm:px-6\b/);
assert.match(shell, /\blg:px-8\b/);

const client = read("src/components/admin/AdminSeoQueriesClient.tsx");
assert.match(client, /Нужно проверить/);
assert.match(client, /Одобрен — не закреплён/);
assert.match(client, /Закрепить автору/);
assert.match(client, /seo-query-\$\{row\.id\}/);
assert.match(client, /proposal_id/);
assert.match(client, /reservation_limit_reached/);
assert.match(client, /needsReview/);
assert.match(client, /approvedUnreserved/);

const page = read("src/app/(platform)/admin/seo-queries/page.tsx");
assert.match(page, /seo_query_proposals/);
assert.match(page, /needsReview/);
assert.match(page, /approvedUnreserved/);

const analyze = read("src/app/api/admin/seo-queries/analyze/route.ts");
assert.match(analyze, /admin_review_seo_query_proposal/);
assert.match(analyze, /sendSeoQueryProposalApprovedAuthorEmail/);
assert.match(analyze, /sendSeoQueryProposalRejectedAuthorEmail/);
assert.match(analyze, /Ordinary admin query without proposal/);

const proposals = read("src/app/api/author/seo/proposals/route.ts");
assert.match(proposals, /sendSeoQueryProposalAdminAlertEmail/);
assert.match(proposals, /result\.status === "proposed"/);

const adminAlert = read("src/lib/email/send-seo-query-proposal-admin-alert-email.ts");
assert.match(adminAlert, /authors@audiolad\.ru/);
assert.match(adminAlert, /SEO_QUERY_PROPOSAL_SUBMITTED_ADMIN_MESSAGE_TYPE/);
const opsTypes = read("src/lib/email/operational-deliveries.ts");
assert.match(opsTypes, /seo_query_proposal_submitted_admin/);
assert.match(opsTypes, /seo-query-proposal:\$\{proposalId\.trim\(\)\}:submitted:admin/);

const decision = read("src/lib/email/send-seo-query-proposal-decision-email.ts");
assert.match(decision, /buildAuthorProductCreateHref/);
assert.match(decision, /SEO_QUERY_PROPOSAL_APPROVED_AUTHOR_MESSAGE_TYPE/);
assert.match(decision, /SEO_QUERY_PROPOSAL_REJECTED_AUTHOR_MESSAGE_TYPE/);

const decisionTpl = read("src/lib/email/templates/seo-query-proposal-decision.ts");
assert.match(decisionTpl, /создать аудиопродукт|seo-opportunities|закреп/i);

const ops = read("src/lib/email/operational-deliveries.ts");
assert.match(ops, /seo_query_proposal_submitted_admin/);
assert.match(ops, /seo_query_proposal_approved_author/);
assert.match(ops, /seo_query_proposal_rejected_author/);

const migration = read(
  "supabase/migrations/20261025120000_admin_review_seo_query_proposal.sql",
);
assert.match(migration, /admin_review_seo_query_proposal/);
assert.match(migration, /service_role/);
assert.doesNotMatch(
  migration,
  /GRANT EXECUTE ON FUNCTION public\.admin_review_seo_query_proposal\(uuid, text, text, text, text\) TO authenticated/,
);

const discovery = read("src/lib/seo-queries/author-discovery.ts");
assert.match(discovery, /proposalId/);

console.log("seo-author-proposal-moderation-unit: all tests passed");
