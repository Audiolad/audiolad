import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import ts from "typescript";

const roots = ["src/app/business-app", "src/components/business-app", "src/lib/business-app", "src/lib/business-workspace", "src/lib/access-grants/copy.ts", "src/lib/access-grants/access-line.ts"];
const properties = new Set("title label description text message hint body subtitle note error notice cta caption heading summary lead".split(" "));
const attributes = new Set(["aria-label", "aria-description", "title", "alt", "placeholder", "label"]);
const allowed = new Set([
  "AudioLad", // Registered brand name, permitted in cabinet copy.
]);

function files(path: string): string[] {
  if (/\.tsx?$/.test(path)) return [path];
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? files(join(path, entry.name)) : /\.tsx?$/.test(entry.name) ? [join(path, entry.name)] : []);
}

function isNonText(value: string): boolean {
  return /^(?:\/|https?:|#|mailto:)/.test(value.trim()) || !/\p{L}/u.test(value);
}

function invalid(value: string): boolean {
  if (isNonText(value)) return false;
  return /—|→|->|=>|--/.test(value) || /\b[a-zA-Z]+_[a-zA-Z_]+\b|\b[a-z]+[A-Z][a-zA-Z]*\b/.test(value.replaceAll("AudioLad", "")) ||
    (value.match(/[A-Za-z]{2,}/g) ?? []).some((word) => !allowed.has(word));
}

function collect(source: ts.SourceFile): ts.Node[] {
  const found = new Set<ts.Node>();
  const copyModule = basename(source.fileName).includes("copy");
  function strings(node: ts.Node) {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) found.add(node);
    // Expressions can include lookups and calls; only branches themselves are visible.
    else if (ts.isConditionalExpression(node)) { strings(node.whenTrue); strings(node.whenFalse); }
    else if (ts.isBinaryExpression(node) && [ts.SyntaxKind.AmpersandAmpersandToken, ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken, ts.SyntaxKind.PlusToken].includes(node.operatorToken.kind)) { strings(node.left); strings(node.right); }
    else if (ts.isTemplateExpression(node)) { strings(node.head); node.templateSpans.forEach((span) => { strings(span.expression); strings(span.literal); }); }
    else if (ts.isObjectLiteralExpression(node)) node.properties.forEach((property) => { if (ts.isPropertyAssignment(property)) strings(property.initializer); });
    else if (ts.isParenthesizedExpression(node) || ts.isJsxExpression(node)) { if (node.expression) strings(node.expression); }
  }
  function visit(node: ts.Node) {
    if (ts.isJsxText(node) && node.text.trim()) found.add(node);
    if (ts.isJsxExpression(node) && (ts.isJsxElement(node.parent) || ts.isJsxFragment(node.parent))) strings(node);
    if (ts.isJsxAttribute(node) && attributes.has(node.name.getText(source)) && node.initializer) strings(node.initializer);
    if (ts.isPropertyAssignment(node) && properties.has(node.name.getText(source).replace(/^['"]|['"]$/g, ""))) strings(node.initializer);
    if (ts.isVariableStatement(node) && node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) {
      node.declarationList.declarations.forEach((decl) => { if (/_(NOTE|TITLE|CTA|INTRO|LABEL|TEXT)$/.test(decl.name.getText(source)) && decl.initializer) strings(decl.initializer); });
    }
    if (copyModule && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node))) {
      // Imports, object keys, types and comparisons are code, not copy values.
      if (!ts.isImportDeclaration(node.parent) && !ts.isExportDeclaration(node.parent) && !ts.isLiteralTypeNode(node.parent) && !(ts.isPropertyAssignment(node.parent) && node.parent.name === node) && !ts.isCaseClause(node.parent) && !(ts.isBinaryExpression(node.parent) && [ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken].includes(node.parent.operatorToken.kind))) found.add(node);
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return [...found].filter((node) => {
    for (let parent = node.parent; parent; parent = parent.parent) {
      if (ts.isJsxAttribute(parent) && ["className", "data-testid"].includes(parent.name.getText(source))) return false;
    }
    return true;
  });
}

function audit(name: string, text: string) {
  const source = ts.createSourceFile(name, text, ts.ScriptTarget.Latest, true, name.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  return collect(source).flatMap((node) => {
    const value = (node as ts.StringLiteral).text.trim();
    return invalid(value) ? [`${name}:${source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1}: ${value}`] : [];
  });
}
assert.equal(audit("bad.tsx", '<p>Пройдите Zero-to-Music через RPC create_business_organization_with_location</p>').length, 1);
assert.equal(audit("good.tsx", '<p>АудиоЛад Бизнес – 799 ₽ в месяц</p>').length, 0);
// Check each collection context, including template fragments and conditional children.
assert.equal(audit("contexts.tsx", `export const PAGE_TITLE = "English title";
const meta = { description: "English description" };
const page = <p aria-label="English label">{"English child"}{true ? "English branch" : "Русский текст"}{\`English head \${42} English tail\`}</p>;`).length, 7);
assert.equal(audit("syntax.tsx", 'const page = <p className="English classes" data-testid="test-value">{mode === "desktop" && <span>Готово</span>}</p>;').length, 0);
assert.equal(audit("sample-copy.ts", 'import x from "package-name"; const copy = "English copy";').length, 1);
const failures = roots.flatMap(files).flatMap((file) => audit(file, readFileSync(file, "utf8")));
if (failures.length) { console.error(failures.join("\n")); process.exitCode = 1; }
else console.log("business Russian copy: passed");
