import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fetchAllPages } from "../src/lib/supabase/fetch-all-pages.ts";

for (const length of [0, 1000, 1615, 2000]) {
  const rows = Array.from({ length }, (_, id) => ({ id }));
  const calls = [];
  const result = await fetchAllPages(async (from, to) => {
    calls.push([from, to]);
    return { data: rows.slice(from, to + 1), error: null };
  });
  assert.deepEqual(result, rows);
  assert.equal(calls.length, Math.floor(length / 1000) + 1);
  assert.deepEqual(calls[0], [0, 999]);
  if (length === 1615) assert.deepEqual(calls[1], [1000, 1999]);
}
await assert.rejects(fetchAllPages(async (from) => from === 0
  ? { data: Array(1000).fill({ id: 1 }), error: null }
  : { data: null, error: { message: "page failed" } }), /page failed/);
await assert.rejects(fetchAllPages(async () => ({ data: null, error: null })), /Missing page data/);
await assert.rejects(fetchAllPages(async () => { throw new Error("network failed"); }), /network failed/);
await assert.rejects(fetchAllPages(async () => ({ data: [], error: null }), 0), /Invalid page size/);
const page = readFileSync("src/app/(platform)/admin/seo-queries/page.tsx", "utf8");
for (const table of ["seo_queries", "seo_query_reservations", "seo_query_proposals"]) {
  assert.ok(page.includes(`fetchAllPages((from, to) => supabase\n      .from("${table}")`));
}
assert.equal([...page.matchAll(/\.order\("id"\)\.range\(from, to\)/g)].length, 3);
console.log("supabase-fetch-all-pages-unit: ok");
