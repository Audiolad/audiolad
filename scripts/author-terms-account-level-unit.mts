/**
 * 8d9cd0af (owner decision 10.10.2026, Sergey 18.10.2026 18:26): legal acceptance is per ACCOUNT.
 * One acceptance by the owner covers all current and future workspaces. Pure helpers + wiring.
 * SQL behaviour: scripts/unified-agreement-sql-unit.mjs (account-level scenarios on PostgreSQL).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { listCoveringAcceptances, pickCoveringAcceptance } from "../src/lib/author-terms/covering-acceptances";

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

// RPC wrapper: dedupes ids, maps rows, fails closed.
{
  const calls: unknown[] = [];
  const client = {
    rpc: async (name: string, args: { p_author_ids: string[] }) => {
      calls.push([name, args]);
      return {
        data: [{ author_id: "w2", acceptance_id: "x", terms_version_id: "v20", accepted_at: "2026-10-18T14:26:58Z", accepted_by_user_id: "u", source_author_id: "w1" }],
        error: null,
      };
    },
  };
  const rows = await listCoveringAcceptances(client as never, ["w2", "w2", ""]);
  assert.deepEqual(calls, [["author_terms_covering_acceptances", { p_author_ids: ["w2"] }]]);
  assert.deepEqual(rows, [{ authorId: "w2", acceptanceId: "x", termsVersionId: "v20", acceptedAt: "2026-10-18T14:26:58Z", acceptedByUserId: "u", sourceAuthorId: "w1" }]);
  assert.deepEqual(await listCoveringAcceptances(client as never, []), []);
  assert.equal(calls.length, 1, "no RPC for an empty list");
  const broken = { rpc: async () => ({ data: null, error: { message: "boom" } }) };
  await assert.rejects(() => listCoveringAcceptances(broken as never, ["w"]), /author_terms_covering_acceptances_failed/);
}

// Pick: own row first, then earliest; other workspaces' rows never leak into another author id.
{
  const r = (authorId: string, src: string, at: string, id: string, v = "v20") => ({
    authorId, acceptanceId: id, termsVersionId: v, acceptedAt: at, acceptedByUserId: "u", sourceAuthorId: src,
  });
  const rows = [r("w2", "w1", "2026-10-18T10:00:00Z", "a"), r("w2", "w2", "2026-10-18T12:00:00Z", "b"), r("w3", "w1", "2026-10-18T09:00:00Z", "c")];
  assert.equal(pickCoveringAcceptance(rows, "w2", "v20")?.acceptanceId, "b", "own workspace row preferred");
  assert.equal(pickCoveringAcceptance(rows.slice(0, 1), "w2", "v20")?.acceptanceId, "a", "owner row from another workspace covers");
  assert.equal(pickCoveringAcceptance(rows, "w2", "v12"), null, "other edition not matched");
  assert.equal(pickCoveringAcceptance(rows, "w9", "v20"), null, "unrelated workspace not covered");
  assert.equal(
    pickCoveringAcceptance([r("w4", "w1", "2026-10-18T11:00:00Z", "z"), r("w4", "w5", "2026-10-18T10:00:00Z", "y")], "w4", "v20")?.acceptanceId,
    "y",
    "earliest when none is own",
  );
}

// Wiring: every reader of acceptances for gates goes through the account-level RPC.
{
  const service = read("src/lib/author-terms/service.ts");
  for (const fn of ["listAuthorTermsAcceptanceEditions", "getAuthorTermsAcceptanceForVersion", "authorHasAnyTermsAcceptance"]) {
    const body = service.slice(service.indexOf(`function ${fn}(`), service.indexOf("\n}\n", service.indexOf(`function ${fn}(`)));
    assert.match(body, /listCoveringAcceptances\(client, \[authorId\]\)/, `${fn}: account level`);
    assert.doesNotMatch(body, /\.eq\("author_id"/, `${fn}: no per-workspace filter`);
  }
  // The only direct table access left: the insert (own workspace) and the row lookup by id.
  assert.equal((service.match(/\.from\("author_terms_acceptances"\)/g) ?? []).length, 2);
  // Acceptance activates every owned workspace waiting in commercial_onboarding (account level).
  assert.equal((service.match(/await activateAccountWorkspacesAfterTermsAccepted\(\{/g) ?? []).length, 3);
  assert.match(service, /\.eq\("user_id", input\.actorUserId\)\s*\.eq\("role", "owner"\)/, "only workspaces the accepting user OWNS");
  assert.match(service, /\.eq\("access_status", "commercial_onboarding"\)/, "already-active workspaces untouched");
  // Support mode and owner-only acceptance are unchanged.
  assert.match(service, /if \(input\.supportMode !== false\) \{\s*throw new AuthorTermsError\("support_mode_acceptance_forbidden", 403\);/);
  assert.match(service, /if \(input\.role !== "owner"\) \{\s*throw new AuthorTermsError\("forbidden", 403\);/);
  assert.match(service, /!input\.supportMode &&\s*input\.role === "owner"/, "canAccept still owner-only and never in support mode");
  const route = read("src/app/api/author/terms/accept/route.ts");
  assert.match(route, /isConsentBlockedForRequest\(user\.id\)[\s\S]{0,200}SUPPORT_MODE_ACCEPTANCE_FORBIDDEN/, "route still blocks support mode");
  const continuing = read("src/lib/author-terms/continuing-editions.ts");
  assert.match(continuing, /listCoveringAcceptances\(client, authorIds\)/);
  assert.doesNotMatch(continuing, /from\("author_terms_acceptances"\)/);
  const catalog = read("src/lib/studio-music/catalog.ts");
  assert.match(catalog, /listCoveringAcceptances\(supabase, authorIds\)/);
  assert.doesNotMatch(catalog, /from\("author_terms_acceptances"\)/);
}
console.log("author-terms-account-level-unit: ok");
