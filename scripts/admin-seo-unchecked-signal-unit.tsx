import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import AiCompanySeoUncheckedSignal from "../src/components/admin/AiCompanySeoUncheckedSignal";
import { parseSeoAnalysisFilterParam, SEO_UNCHECKED_ADMIN_HREF } from "../src/lib/seo-queries/admin-filter";

const ROOT = path.resolve(__dirname, "..");
const read = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");
const render = (count: number | null | undefined) =>
  renderToStaticMarkup(createElement(AiCompanySeoUncheckedSignal, { count }));

for (const count of [0, null, undefined, Number.NaN, -1, Number.POSITIVE_INFINITY, 1.5]) {
  assert.equal(render(count), "", `no signal for ${count}`);
}

const html = render(119);
assert.ok(html.includes("Непроверенные SEO-запросы: 119"));
assert.ok(html.includes("Авторы видят только проверенные запросы – проверьте, чтобы они не потерялись."));
assert.ok(html.includes("Перейти и проверить"));
assert.ok(html.includes(`href="${SEO_UNCHECKED_ADMIN_HREF}"`));
assert.equal(SEO_UNCHECKED_ADMIN_HREF, "/admin/seo-queries?analysis=not_analyzed");
assert.match(html, /role="status"/);
assert.match(html, /data-seo-unchecked-signal="true"/);
assert.match(html, /min-h-11/);
assert.match(html, /flex-wrap/);
assert.doesNotMatch(html, /—/);
const grouped = (1615).toLocaleString("ru-RU");
assert.equal(grouped, "1\u00a0615");
assert.ok(render(1615).includes(`Непроверенные SEO-запросы: ${grouped}`));

for (const value of ["not_analyzed", "analyzed", "not_applicable"] as const) {
  assert.equal(parseSeoAnalysisFilterParam(value), value);
  assert.equal(parseSeoAnalysisFilterParam([value, "invalid"]), value);
}
for (const value of [undefined, null, "", "invalid", "ANALYZED", " analyzed", 119, {}, [], [null, "analyzed"], ["invalid", "analyzed"], [["analyzed"]]]) {
  assert.equal(parseSeoAnalysisFilterParam(value), "");
}

const board = read("src/app/(platform)/admin/ai-company/page.tsx");
assert.match(board, /const session = await requireAiCompanyView\(\);\s*const seoUncheckedCount = canCountAdminQueue\(session.access, "seo.manage"\)\s*\? \(await getCachedAdminNavAttentionCounts\(session.access\)\)\["\/admin\/seo-queries"\]\s*: null;/);
assert.match(board, /<AiCompanySeoUncheckedSignal count=\{seoUncheckedCount\} \/>\s*<AiCompanyDashboard/);
const client = read("src/components/admin/AdminSeoQueriesClient.tsx");
assert.match(client, /initialAnalysisStatus\?:/);
assert.match(client, /\[analysisStatus, setAnalysisStatus\] = useState<string>\(initialAnalysisStatus\)/);
assert.match(client, /<option value="not_analyzed">Не проверены<\/option>/);
const page = read("src/app/(platform)/admin/seo-queries/page.tsx");
assert.match(page, /searchParams: Promise<\{ analysis\?: string \| string\[\] \}>/);
assert.match(page, /parseSeoAnalysisFilterParam\(\(await searchParams\).analysis\)/);
assert.match(page, /initialAnalysisStatus=\{initialAnalysisStatus\}/);

console.log("admin-seo-unchecked-signal-unit: ok");
