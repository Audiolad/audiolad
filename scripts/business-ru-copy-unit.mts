import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import ts from "typescript";

const roots = ["src/app/business-app", "src/components/business-app", "src/lib/business-app", "src/lib/business-workspace", "src/lib/access-grants/copy.ts", "src/lib/access-grants/access-line.ts", "src/components/business/BusinessLandingView.tsx", "src/lib/business/landing.ts"];
const properties = new Set("title label description text message messageRu hint body subtitle note error notice cta caption heading summary lead markdown detail eyebrow vibe placeholder".split(" "));
// Calls whose string arguments are shown to the visitor.
const visibleCalls = new Set(["setError", "setNotice", "setMessage", "setStatus", "showNotice", "notify", "toast", "alert"]);
// Module constants that hold copy (anything not ending like a key, path, address or id).
const codeConstant = /(?:KEY|HREF|URL|PATH|ID|IDS|EMAIL|STORAGE|EVENT|PREFIX|COOKIE|HEADER|KIND|HOST|ROUTE|ROUTES|PATTERN|RE|REGEX|SELECTOR|ATTR|PARAM|CODE|VERSION|MIME|TYPE|FORMAT|ORIGIN|DOMAIN|CHANNEL|BUCKET|TABLE|COLUMN|COLUMNS|HOSTNAME|COOKIE_NAME|CACHE_NAME|QUERY|THEME)$/;
const attributes = new Set(["aria-label", "aria-description", "title", "alt", "placeholder", "label"]);
const allowed = new Set([
  "AudioLad", // Registered brand name, permitted in cabinet copy.
]);

function files(path: string): string[] {
  if (/\.tsx?$/.test(path)) return [path];
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? files(join(path, entry.name)) : /\.tsx?$/.test(entry.name) ? [join(path, entry.name)] : []);
}

function isNonText(value: string): boolean {
  const trimmed = value.trim();
  return /^(?:\/|https?:|mailto:)/.test(trimmed) || /^#[\w-]*$/.test(trimmed) || !/\p{L}/u.test(value);
}

function invalid(value: string): boolean {
  // Line by line, so a Markdown table rule (|---|) inside a document is not mistaken for «--».
  if (value.includes("\n")) return value.split("\n").some((line) => invalid(line));
  if (isNonText(value)) return false;
  return /—|→|->|=>|--/.test(value) || /\b[a-zA-Z]+_[a-zA-Z_]+\b|\b[a-z]+[A-Z][a-zA-Z]*\b/.test(value.replaceAll("AudioLad", "")) ||
    (value.match(/[A-Za-z]+/g) ?? []).some((word) => !allowed.has(word));
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
    if (ts.isVariableStatement(node)) {
      node.declarationList.declarations.forEach((decl) => {
        const name = decl.name.getText(source);
        const init = decl.initializer;
        // Plain copy constants only; objects are covered through their visible property names.
        const plain = init && (ts.isStringLiteral(init) || ts.isNoSubstitutionTemplateLiteral(init) || ts.isTemplateExpression(init) || ts.isConditionalExpression(init));
        if (plain && /^[A-Z][A-Z0-9_]*$/.test(name) && !codeConstant.test(name)) strings(init);
      });
    }
    if (ts.isCallExpression(node)) {
      const callee = ts.isIdentifier(node.expression) ? node.expression.text : ts.isPropertyAccessExpression(node.expression) ? node.expression.name.text : "";
      // setStatus(code, message): only the message is visible.
      if (visibleCalls.has(callee) && !(callee === "setStatus" && node.arguments.length < 2)) (callee === "setStatus" ? node.arguments.slice(-1) : node.arguments).forEach(strings);
    }
    // Functions that build visitor-facing labels / messages: every returned string is copy.
    if (ts.isReturnStatement(node) && node.expression) {
      for (let fn: ts.Node | undefined = node.parent; fn; fn = fn.parent) {
        if (ts.isFunctionDeclaration(fn) || ts.isFunctionExpression(fn) || ts.isArrowFunction(fn) || ts.isMethodDeclaration(fn)) {
          const fnName = fn.name?.getText(source) ?? (ts.isVariableDeclaration(fn.parent) ? fn.parent.name.getText(source) : "");
          if (/(?:Ru|Label|Text|Title|Message|Copy|Hint|Caption)$/.test(fnName)) strings(node.expression);
          break;
        }
      }
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
    if (!invalid(value)) return [];
    // Long texts (documents): report the offending line only.
    const line = value.split("\n").find((part) => invalid(part)) ?? value.split("\n")[0];
    return [`${name}:${source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1}: ${line.slice(0, 200)}`];
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
assert.equal(audit("calls.tsx", 'setError("heartbeat_failed"); setError("Не удалось связаться с плеером.");').length, 1);
assert.equal(audit("letter.tsx", "const page = <p>A</p>;").length, 1);
assert.equal(audit("doc.ts", 'const doc = { markdown: "# Документ\\n\\nКабинет → «Документы»" };').length, 1);
assert.equal(audit("labels.ts", 'export function healthStatusLabelRu(s: string) { if (s === "x") return "offline"; return "на связи"; }').length, 1);
assert.equal(audit("consts.ts", 'const POINT = "SPA garden"; const STORAGE_KEY = "audiolad.sound"; const PILOT_HREF = "/player";').length, 1);
assert.equal(audit("anchor.tsx", '<a href="#main">Перейти</a>').length, 0);
// Signed legal documents (fixed text + sha256 per published version) change only with a new
// document version approved by the owner; they are checked separately by their own tests.
const legalDocuments = new Set(["src/lib/business-app/client-document-content.ts"]);
const failures = roots.flatMap(files).filter((file) => !legalDocuments.has(file)).flatMap((file) => audit(file, readFileSync(file, "utf8")));
if (failures.length) { console.error(failures.join("\n")); process.exitCode = 1; }
else console.log("business Russian copy: passed");
