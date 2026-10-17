#!/usr/bin/env node
// Sergey rule (17.10.2026): visible article / SEO / public marketing copy uses the en dash «–» (U+2013),
// never the em dash «—» (U+2014). Checks string/template literals, JSX text and JSX attribute strings via
// the TypeScript AST, so code comments and regex literals are out of scope. Admin and app UI are not scanned.
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

const EM = "\u2014";
const root = process.cwd();
// Numeric references decode in HTML even without the trailing semicolon.
const ENTITY_RE = /&(?:mdash;|#0*8212(?![0-9]);?|#x0*2014(?![0-9a-f]);?)/gi;

// Public article / SEO / landing scope.
const SCOPE = [
  "src/lib/seo",
  "src/lib/help/articles",
  "src/lib/school",
  "src/lib/classica/public",
  "src/components/school",
  "src/components/become-author",
  "src/components/meditation-authors-landing",
  "src/components/classica/ClassicaPublicWorkView.tsx",
  "src/app/(platform)/(listener)",
  "src/app/(platform)/b",
  "src/app/(platform)/pravovaya-model-muzyki",
];
// Internal tools under src/lib/seo (LLM prompts, admin/author UI); not public copy.
const EXCLUDE = [
  "src/lib/seo/product-autofill/",
  "src/lib/seo/product-quality-review/",
  "src/lib/seo/wordstat/",
  "src/lib/seo/yandex-webmaster/",
];

export function visibleLiterals(path, src) {
  const kind = path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(path, src, ts.ScriptTarget.Latest, true, kind);
  const K = ts.SyntaxKind;
  const out = [];
  const visit = (node) => {
    if (
      node.kind === K.StringLiteral ||
      node.kind === K.NoSubstitutionTemplateLiteral ||
      node.kind === K.TemplateHead ||
      node.kind === K.TemplateMiddle ||
      node.kind === K.TemplateTail ||
      node.kind === K.JsxText
    ) {
      const text = (node.kind === K.JsxText ? node.getText(sf) : node.text).replace(ENTITY_RE, EM);
      out.push({ line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1, text });
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

function walk(rel) {
  const abs = join(root, rel);
  if (!existsSync(abs)) return [];
  if (!statSync(abs).isDirectory()) return [rel];
  return readdirSync(abs).flatMap((name) => walk(join(rel, name)));
}

// Self-check of the detector.
const probe = (src, path = "probe.tsx") => visibleLiterals(path, src).some((t) => t.text.includes(EM));
assert.equal(probe('const a = "x"; // a — b\n/* c — d */ const r = /[–—]/;', "probe.ts"), false);
assert.equal(probe('const t = "Статья — АудиоЛад";', "probe.ts"), true);
assert.equal(probe('const t = `${a} — ${b}`;', "probe.ts"), true);
assert.equal(probe('const t = "a \\u2014 b";', "probe.ts"), true);
assert.equal(probe("const e = <p>Один // два — три</p>;"), true);
assert.equal(probe("const e = <p>Один &mdash; два</p>;"), true);
assert.equal(probe('const e = <img alt="a &#8212; b" />;'), true);
assert.equal(probe("const e = <p>{/* — */}ok</p>;"), false);
for (const enc of ["&mdash;", "&#8212;", "&#x2014;", "&#8212", "&#x2014"]) assert.equal(probe(`const e = <p>a ${enc} b</p>;`), true, enc);
assert.equal(probe("const e = <p>&#82120; &#x20140;</p>;"), false);

const files = SCOPE.flatMap(walk)
  .filter((f) => /\.(ts|tsx)$/.test(f))
  .filter((f) => !EXCLUDE.some((e) => f.startsWith(e)));
assert.ok(files.length > 50, `scope too small: ${files.length}`);
assert.ok(files.some((f) => f.startsWith("src/lib/seo/articles/content/")), "SEO articles scanned");

const hits = [];
for (const file of files) {
  for (const t of visibleLiterals(file, readFileSync(join(root, file), "utf8"))) {
    if (t.text.includes(EM)) hits.push(`${file}:${t.line}: ${t.text.trim().slice(0, 120)}`);
  }
}
assert.deepEqual(hits, [], `em dash «—» in public copy, use «–» (U+2013):\n${hits.join("\n")}`);
console.log(`public-copy-en-dash: OK (${files.length} files)`);
