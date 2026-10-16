import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  CLIENT_DOCUMENTS,
  CLIENT_DOCUMENT_EDITION_LABEL,
  CLIENT_DOCUMENT_REQUISITES,
  buildPlaybackReport,
  clampWindowMinutes,
  venueLocalToUtc,
} from "../src/lib/business-app/client-documents";
import { queryPlaybackFacts } from "../src/lib/business-app/playback-facts-query";

// Редакция r4 от 16.10.2026 (owner decision): approved, no draft/lawyer marks, requisites present.
assert.ok(CLIENT_DOCUMENTS.length >= 4);
for (const d of CLIENT_DOCUMENTS) {
  assert.equal(d.status, "approved");
  assert.equal(d.version, "r4-2026-10-16");
  assert.doesNotMatch(d.version, /draft/);
}
assert.equal(CLIENT_DOCUMENT_EDITION_LABEL, "Редакция от 16.10.2026");
assert.match(CLIENT_DOCUMENT_REQUISITES, /Петров Сергей Сергеевич/);
assert.match(CLIENT_DOCUMENT_REQUISITES, /ИНН 507305817690/);
assert.match(CLIENT_DOCUMENT_REQUISITES, /ОГРНИП 316505300063237/);
// No "without RAO/VOIS" promise anywhere in client copy.
const page = readFileSync("src/app/business-app/documents/page.tsx", "utf8");
const allCopy = page + JSON.stringify(CLIENT_DOCUMENTS);
assert.doesNotMatch(allCopy, /без\s+(РАО|ВОИС)/i);
assert.doesNotMatch(page, /BusinessEmptySection/);
assert.match(page, /CLIENT_DOCUMENT_EDITION_LABEL/);
assert.match(page, /CLIENT_DOCUMENT_REQUISITES/);
assert.doesNotMatch(allCopy + CLIENT_DOCUMENT_REQUISITES, /черновик|юрист|паспорт|355045|Ставрополь/i);

// Timezone conversion.
assert.equal(venueLocalToUtc("2026-10-16T15:00", "Europe/Moscow")?.toISOString(), "2026-10-16T12:00:00.000Z");
assert.equal(venueLocalToUtc("2026-10-16T15:00", "Asia/Yekaterinburg")?.toISOString(), "2026-10-16T10:00:00.000Z");
assert.equal(venueLocalToUtc("bad", "Europe/Moscow"), null);
assert.equal(venueLocalToUtc("2026-13-01T00:00", "Europe/Moscow"), null);
assert.equal(clampWindowMinutes("999"), 180);
assert.equal(clampWindowMinutes("x"), 30);

// Report grouping.
const at = new Date("2026-10-16T12:00:00Z");
const report = buildPlaybackReport({
  at,
  windowMinutes: 10,
  timezone: "Europe/Moscow",
  titles: new Map([["a", "Трек A"], ["b", "Трек B"]]),
  facts: [
    { occurred_at: "2026-10-16T11:58:00Z", audio_item_id: "a", location_id: "l", player_id: "p", listened_ms: 60000 },
    { occurred_at: "2026-10-16T12:00:30Z", audio_item_id: "a", location_id: "l", player_id: "p", listened_ms: 90000 },
    { occurred_at: "2026-10-16T12:03:00Z", audio_item_id: "b", location_id: "l", player_id: "p", listened_ms: "120000" },
    { occurred_at: "2026-10-16T13:00:00Z", audio_item_id: "c", location_id: "l", player_id: "p", listened_ms: 1000 },
  ],
});
assert.equal(report.factCount, 3);
assert.deepEqual(report.tracks.map((t) => t.title), ["Трек A", "Трек B"]);
assert.equal(report.tracks[0].listenedMs, 150000);
assert.equal(report.tracks[0].coversT, true);
assert.equal(report.tracks[1].coversT, false);

// Loader query: filters must match the partial indexes on playback_usage_facts.
{
  const calls: Array<[string, ...unknown[]]> = [];
  const builder: Record<string, unknown> = {};
  for (const m of ["select", "eq", "gt", "gte", "lte", "order"]) {
    builder[m] = (...args: unknown[]) => {
      calls.push([m, ...args]);
      return builder;
    };
  }
  builder.limit = (n: number) => {
    calls.push(["limit", n]);
    return Promise.resolve({ data: [], error: null });
  };
  let table = "";
  const mockClient = {
    from(t: "playback_usage_facts") {
      table = t;
      return builder;
    },
  };
  const res = await queryPlaybackFacts(mockClient, {
    organizationId: "org-1",
    locationId: "loc-1",
    from: "2026-10-16T11:30:00.000Z",
    to: "2026-10-16T12:30:00.000Z",
    limit: 2000,
  });
  assert.deepEqual(res, { data: [], error: null });
  assert.equal(table, "playback_usage_facts");
  const has = (...c: unknown[]) =>
    assert.ok(calls.some((x) => JSON.stringify(x) === JSON.stringify(c)), `missing ${JSON.stringify(c)}`);
  has("eq", "usage_kind", "business");
  has("eq", "organization_id", "org-1");
  has("eq", "location_id", "loc-1");
  has("gt", "listened_ms", 0);
  has("gte", "occurred_at", "2026-10-16T11:30:00.000Z");
  has("lte", "occurred_at", "2026-10-16T12:30:00.000Z");
  has("limit", 2000);
  // The loader must go through this query helper.
  const loader = readFileSync("src/lib/business-app/load-playback-report.ts", "utf8");
  assert.match(loader, /queryPlaybackFacts\(service/);
  assert.doesNotMatch(loader, /from\("playback_usage_facts"\)/);
}
console.log("business-app-client-documents-unit OK");

// Steering 16.10 16:07: every card on business.audiolad.ru/documents links to a readable full text.
{
  const { CLIENT_DOCUMENT_SOURCES } = await import("../src/lib/business-app/client-document-content");
  const { clientDocumentHref } = await import("../src/lib/business-app/client-documents");
  const { createElement } = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const md = await import("../src/components/legal/SimpleMarkdown");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const SimpleMarkdown: any = typeof (md as any).default === "function" ? (md as any).default : (md as any).default.default;
  const pageSrc = readFileSync("src/app/business-app/documents/page.tsx", "utf8");
  assert.match(pageSrc, /href=\{clientDocumentHref\(doc\.id\)\}/);
  assert.match(pageSrc, /target="_blank"/);
  assert.doesNotMatch(pageSrc, /черновик/i);
  const detailSrc = readFileSync("src/app/business-app/documents/[id]/page.tsx", "utf8");
  assert.match(detailSrc, /SimpleMarkdown source=\{source\.markdown\}/);
  for (const d of CLIENT_DOCUMENTS) {
    const href = clientDocumentHref(d.id);
    assert.equal(href, `/documents/${d.id}`);
    // Business host rewrites the href to an existing internal route.
    const { resolveBusinessInternalPath } = await import("../src/lib/business-app/host");
    assert.equal(resolveBusinessInternalPath(href), `/business-app/documents/${d.id}`);
    // Target has full readable content.
    const src = CLIENT_DOCUMENT_SOURCES[d.id];
    assert.ok(src, `content for ${d.id}`);
    assert.equal(readFileSync(src.file, "utf8"), src.markdown, `content.ts in sync with ${src.file}`);
    assert.ok(src.markdown.length > 500);
    const html = renderToStaticMarkup(createElement(SimpleMarkdown, { source: src.markdown }));
    assert.match(html, /<h1/);
    assert.match(src.markdown, /Редакция от 16\.10\.2026/);
    assert.doesNotMatch(src.markdown, /Черновик, требует проверки юриста|паспорт\s*\[|ОГРНИП \[ \]|355045|Ставрополь/);
    assert.match(src.markdown, /ИНН 507305817690/);
    assert.match(src.markdown, /ОГРНИП 316505300063237/);
    assert.doesNotMatch(src.markdown, /без\s+(РАО|ВОИС)/i);
  }
  console.log("business-app-client-documents-unit: card links OK");
}

// 8dcba9d1 (16.10 16:46): «А. Образец ответа на претензию» renders as separate paragraphs, not one merged italic quote.
{
  const { CLIENT_DOCUMENT_SOURCES } = await import("../src/lib/business-app/client-document-content");
  const { PUBLIC_PROGRAM_DOCUMENTS } = await import("../src/lib/business-rightsholder/program-documents");
  const { createElement } = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const md = await import("../src/components/legal/SimpleMarkdown");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const SimpleMarkdown: any = typeof (md as any).default === "function" ? (md as any).default : (md as any).default.default;
  const render = (s: string) => renderToStaticMarkup(createElement(SimpleMarkdown, { source: s }));
  const html = render(CLIENT_DOCUMENT_SOURCES["claim-reply-kit"].markdown);
  const quote = /<blockquote[^>]*>([\s\S]*?)<\/blockquote>/.exec(html);
  assert.ok(quote, "sample quote rendered");
  assert.doesNotMatch(quote[0], /class="[^"]*(?<!not-)italic/, "sample is not italic");
  const paras = [...quote[1].matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)].map((m) => m[1].replace(/<[^>]+>/g, ""));
  const starts = ["Кому:", "От:", "Исх. №", "1. ", "2. ", "3. ", "4. ", "5. ", "Приложения:", "1) ", "2) ", "3) ", "4) ", "[должность, ФИО, подпись]"];
  assert.equal(paras.length, starts.length, `sample paragraphs: ${paras.length}`);
  starts.forEach((s, j) => assert.ok(paras[j].startsWith(s), `paragraph ${j} starts with ${s}: ${paras[j].slice(0, 30)}`));
  // No merged quote / clause blocks anywhere in the 7 public document sources.
  const all = [...Object.values(CLIENT_DOCUMENT_SOURCES).map((s) => s.markdown), ...Object.values(PUBLIC_PROGRAM_DOCUMENTS).map((d) => d.markdown)];
  for (const src of all) {
    const out = render(src);
    for (const p of out.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)) {
      assert.ok((p[1].match(/(^|<br\/>)\d+\.\d+\.\s/g) ?? []).length <= 1, `clause lines merged: ${p[1].slice(0, 60)}`);
    }
    assert.doesNotMatch(out, /<blockquote[^>]*>[^<]/, "quote text wrapped in paragraphs");
  }
  console.log("business-app-client-documents-unit: claim reply sample paragraphs OK");
}

// 8dcba9d1 (Sergey 16.10.2026 17:12): general documents are universal — no hardcoded artists/holders;
// the pseudonym statement lives in the artists' dossier; holders come from the rights registry;
// ИП Петров is the service operator, never the owner of all music.
{
  const { CLIENT_DOCUMENT_SOURCES } = await import("../src/lib/business-app/client-document-content");
  const { PUBLIC_PROGRAM_DOCUMENTS } = await import("../src/lib/business-rightsholder/program-documents");
  const { rightsholdersFromRegistry, buildPlaybackReport } = await import("../src/lib/business-app/client-documents");
  const { resolveBusinessInternalPath } = await import("../src/lib/business-app/host");
  assert.ok(!CLIENT_DOCUMENTS.some((d) => d.id === "rightsholder-link"), "pseudonym statement not in general list");
  assert.ok(!CLIENT_DOCUMENT_SOURCES["rightsholder-link"]);
  assert.equal(resolveBusinessInternalPath("/documents/rightsholder-link"), null);
  const general = [
    ...CLIENT_DOCUMENTS.map((d) => `${d.title} ${d.summary}`),
    ...Object.values(CLIENT_DOCUMENT_SOURCES).map((s) => s.markdown),
    ...Object.values(PUBLIC_PROGRAM_DOCUMENTS).map((d) => d.markdown),
    readFileSync("src/app/business-app/documents/page.tsx", "utf8"),
  ];
  for (const t of general) {
    assert.doesNotMatch(t, /Аурафон|Джаз Релакс|Aurafon|Jazz Relax/i, "no hardcoded artists in general docs");
    assert.doesNotMatch(t, /Правообладател(ь|ем)[^.\n|]{0,40}(Петров|ИП)/, "operator not declared rights holder");
    assert.doesNotMatch(t, /тот же субъект/);
  }
  assert.match(CLIENT_DOCUMENT_SOURCES["venue-license"].markdown, /реестра прав/);
  assert.match(CLIENT_DOCUMENT_SOURCES["claim-reply-kit"].markdown, /реестра прав/);
  const at = new Date("2026-10-16T12:00:00Z");
  // Review r1 B2: holder matched to the playback time of each fact, not to the search instant.
  const map = rightsholdersFromRegistry(
    [
      { audio_item_id: "a", rightsholder_id: "h1", status: "verified", valid_from: "2026-01-01T00:00:00Z", valid_until: "2026-10-16T12:10:00Z" },
      { audio_item_id: "a", rightsholder_id: "h2", status: "verified", valid_from: "2026-10-16T12:10:00Z", valid_until: null },
      { audio_item_id: "b", rightsholder_id: "h2", status: "draft", valid_from: "2026-01-01T00:00:00Z", valid_until: null },
    ],
    [{ id: "h1", display_name: "Правообладатель А" }, { id: "h2", display_name: "Правообладатель Б" }],
  );
  assert.equal(map.get("b"), undefined);
  const fact = (iso: string) => ({ occurred_at: iso, audio_item_id: "a", location_id: null, player_id: null, listened_ms: 1000 });
  const late = buildPlaybackReport({ at, windowMinutes: 30, timezone: "Europe/Moscow", facts: [fact("2026-10-16T12:20:00Z")], titles: new Map(), rightsholders: map });
  assert.deepEqual(late.tracks[0].rightsholders, ["Правообладатель Б"]);
  const early = buildPlaybackReport({ at, windowMinutes: 30, timezone: "Europe/Moscow", facts: [fact("2026-10-16T11:50:00Z")], titles: new Map(), rightsholders: map });
  assert.deepEqual(early.tracks[0].rightsholders, ["Правообладатель А"]);
  const both = buildPlaybackReport({ at, windowMinutes: 30, timezone: "Europe/Moscow", facts: [fact("2026-10-16T11:50:00Z"), fact("2026-10-16T12:20:00Z")], titles: new Map(), rightsholders: map });
  // Review r2: holder change inside the window = separate rows with their own periods.
  assert.equal(both.tracks.length, 2);
  assert.deepEqual(both.tracks.map((t) => t.rightsholders), [["Правообладатель А"], ["Правообладатель Б"]]);
  assert.ok(both.tracks[0].lastAt < both.tracks[1].firstAt);
  // A fact without a registry record is not hidden behind another fact's holder.
  const onlyB = rightsholdersFromRegistry(
    [{ audio_item_id: "a", rightsholder_id: "h2", status: "verified", valid_from: "2026-10-16T12:10:00Z", valid_until: null }],
    [{ id: "h2", display_name: "Правообладатель Б" }],
  );
  const gap = buildPlaybackReport({ at, windowMinutes: 30, timezone: "Europe/Moscow", facts: [fact("2026-10-16T11:50:00Z"), fact("2026-10-16T12:20:00Z")], titles: new Map(), rightsholders: onlyB });
  assert.deepEqual(gap.tracks.map((t) => t.rightsholders), [[], ["Правообладатель Б"]]);
  // Review r3: a fact spanning the change is split into segments (sequential, not simultaneous).
  const edge = buildPlaybackReport({ at, windowMinutes: 30, timezone: "Europe/Moscow", facts: [{ ...fact("2026-10-16T12:10:01Z"), listened_ms: 2000 }], titles: new Map(), rightsholders: map });
  assert.deepEqual(edge.tracks.map((t) => t.rightsholders), [["Правообладатель А"], ["Правообладатель Б"]]);
  assert.equal(edge.tracks[0].lastAt, "2026-10-16T12:10:00.000Z");
  const edgeGap = buildPlaybackReport({ at, windowMinutes: 30, timezone: "Europe/Moscow", facts: [{ ...fact("2026-10-16T12:10:01Z"), listened_ms: 2000 }], titles: new Map(), rightsholders: onlyB });
  assert.deepEqual(edgeGap.tracks.map((t) => t.rightsholders), [[], ["Правообладатель Б"]]);
  // A → Б → A: the second A period is a new row; at 12:05 only Б covers T.
  const aba = rightsholdersFromRegistry(
    [
      { audio_item_id: "a", rightsholder_id: "h1", status: "verified", valid_from: "2026-01-01T00:00:00Z", valid_until: "2026-10-16T12:00:00Z" },
      { audio_item_id: "a", rightsholder_id: "h2", status: "verified", valid_from: "2026-10-16T12:00:00Z", valid_until: "2026-10-16T12:10:00Z" },
      { audio_item_id: "a", rightsholder_id: "h1", status: "verified", valid_from: "2026-10-16T12:10:00Z", valid_until: null },
    ],
    [{ id: "h1", display_name: "Правообладатель А" }, { id: "h2", display_name: "Правообладатель Б" }],
  );
  const r3 = buildPlaybackReport({ at: new Date("2026-10-16T12:05:00Z"), windowMinutes: 30, timezone: "Europe/Moscow", facts: [fact("2026-10-16T11:50:00Z"), fact("2026-10-16T12:05:00Z"), fact("2026-10-16T12:20:00Z")], titles: new Map(), rightsholders: aba });
  assert.deepEqual(r3.tracks.map((t) => t.rightsholders), [["Правообладатель А"], ["Правообладатель Б"], ["Правообладатель А"]]);
  assert.deepEqual(r3.tracks.map((t) => t.coversT), [false, true, false]);
  // Review r4 B1: A … (Б, no fact) … A is two rows; T=12:05 is not covered.
  const r4a = buildPlaybackReport({ at: new Date("2026-10-16T12:05:00Z"), windowMinutes: 30, timezone: "Europe/Moscow", facts: [fact("2026-10-16T11:50:00Z"), fact("2026-10-16T12:20:00Z")], titles: new Map(), rightsholders: aba });
  assert.deepEqual(r4a.tracks.map((t) => t.rightsholders), [["Правообладатель А"], ["Правообладатель А"]]);
  assert.deepEqual(r4a.tracks.map((t) => t.coversT), [false, false]);
  // Same holder with no change in between still merges into one row (old behaviour).
  const plain = buildPlaybackReport({ at, windowMinutes: 30, timezone: "Europe/Moscow", facts: [fact("2026-10-16T11:50:00Z"), fact("2026-10-16T11:55:00Z")], titles: new Map(), rightsholders: aba });
  assert.equal(plain.tracks.length, 1);
  // Review r4 B2: at the exact change instant only the new holder covers T.
  const r4b = buildPlaybackReport({ at: new Date("2026-10-16T12:10:00Z"), windowMinutes: 30, timezone: "Europe/Moscow", facts: [{ ...fact("2026-10-16T12:10:01Z"), listened_ms: 2000 }], titles: new Map(), rightsholders: map });
  assert.deepEqual(r4b.tracks.map((t) => [t.rightsholders[0], t.coversT]), [["Правообладатель А", false], ["Правообладатель Б", true]]);
  // Review r4 B3: overlapping facts (two players) are aggregated, no duplicate rows; listened preserved.
  const r4c = buildPlaybackReport({ at, windowMinutes: 30, timezone: "Europe/Moscow", facts: [{ ...fact("2026-10-16T12:10:01Z"), listened_ms: 2000 }, { ...fact("2026-10-16T12:10:02Z"), listened_ms: 3000 }], titles: new Map(), rightsholders: map });
  assert.deepEqual(r4c.tracks.map((t) => t.rightsholders[0]), ["Правообладатель А", "Правообладатель Б"]);
  assert.equal(r4c.tracks.reduce((n, t) => n + t.listenedMs, 0), 5000);
  const keys = r4c.tracks.map((t) => `${t.audioItemId}-${t.firstAt}`);
  assert.equal(new Set(keys).size, keys.length);
  assert.equal(both.registryUnavailable, false);
  // Review r1 B1: a failed registry read is "unavailable", never "no record".
  const down = buildPlaybackReport({ at, windowMinutes: 30, timezone: "Europe/Moscow", facts: [fact("2026-10-16T12:00:00Z")], titles: new Map(), registryUnavailable: true });
  assert.equal(down.registryUnavailable, true);
  const pageSrc2 = readFileSync("src/app/business-app/documents/page.tsx", "utf8");
  assert.match(pageSrc2, /registryUnavailable[\s\S]{0,80}сведения реестра временно недоступны/);
  const loader = readFileSync("src/lib/business-app/load-playback-report.ts", "utf8");
  assert.match(loader, /from\("music_rights_grants"\)/);
  assert.match(loader, /from\("music_rightsholders"\)/);
  assert.match(loader, /grantsError/);
  assert.match(loader, /holdersError/);
  console.log("business-app-client-documents-unit: universal documents OK");
}
