#!/usr/bin/env node
/**
 * A "use server" module may only export async functions.
 * Type-only exports are erased and do not count.
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCAN_ROOTS = ["src", "scripts"];

function walk(dir, out) {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next") continue;
    const full = path.join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      walk(full, out);
      continue;
    }
    if (/\.(ts|tsx|mts|cts)$/.test(entry)) {
      out.push(full);
    }
  }
}

function isUseServerModule(sourceFile) {
  for (const statement of sourceFile.statements) {
    if (
      ts.isExpressionStatement(statement) &&
      ts.isStringLiteral(statement.expression) &&
      statement.expression.text === "use server"
    ) {
      return true;
    }
    return false;
  }
  return false;
}

function hasModifier(node, kind) {
  return ts.canHaveModifiers(node)
    ? (ts.getModifiers(node) ?? []).some((modifier) => modifier.kind === kind)
    : false;
}

function problemsIn(sourceFile) {
  const problems = [];

  for (const statement of sourceFile.statements) {
    if (!hasModifier(statement, ts.SyntaxKind.ExportKeyword) && !ts.isExportDeclaration(statement) && !ts.isExportAssignment(statement)) {
      continue;
    }

    if (ts.isTypeAliasDeclaration(statement) || ts.isInterfaceDeclaration(statement)) {
      continue;
    }

    if (ts.isFunctionDeclaration(statement)) {
      if (!hasModifier(statement, ts.SyntaxKind.AsyncKeyword)) {
        problems.push(`sync function ${statement.name?.text ?? "default"}`);
      }
      continue;
    }

    if (ts.isVariableStatement(statement)) {
      const names = statement.declarationList.declarations
        .map((declaration) => (ts.isIdentifier(declaration.name) ? declaration.name.text : "binding"))
        .join(", ");
      problems.push(`value ${names}`);
      continue;
    }

    if (ts.isClassDeclaration(statement) || ts.isEnumDeclaration(statement)) {
      problems.push(`class or enum ${statement.name?.text ?? ""}`.trim());
      continue;
    }

    if (ts.isExportDeclaration(statement)) {
      if (statement.isTypeOnly) continue;
      const clause = statement.exportClause;
      if (clause && ts.isNamedExports(clause)) {
        for (const element of clause.elements) {
          if (element.isTypeOnly) continue;
          problems.push(`re-export ${element.name.text}`);
        }
        continue;
      }
      problems.push("export from");
      continue;
    }

    if (ts.isExportAssignment(statement)) {
      problems.push("export assignment");
    }
  }

  return problems;
}

const files = [];
for (const root of SCAN_ROOTS) {
  walk(path.join(ROOT, root), files);
}

const offenders = [];
let serverModules = 0;

for (const file of files) {
  const text = readFileSync(file, "utf8");
  if (!text.includes("use server")) continue;
  const sourceFile = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  if (!isUseServerModule(sourceFile)) continue;
  serverModules += 1;
  const problems = problemsIn(sourceFile);
  if (problems.length > 0) {
    offenders.push(`${path.relative(ROOT, file)}: ${problems.join("; ")}`);
  }
}

assert.ok(serverModules > 0, "expected to scan use server modules");
assert.deepEqual(offenders, [], offenders.join("\n"));

console.log(`use-server-exports-unit: ok (${serverModules} modules)`);
