import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";

import { BusinessCaseCollapsible } from "../src/app/(platform)/admin/business-verification/BusinessCaseCollapsible";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const render = (defaultExpanded?: boolean, isOwnCase = false) => renderToStaticMarkup(
  <BusinessCaseCollapsible
    caseId="sample-case"
    applicantName="Лара Ларина"
    statusLabel="Пример подтверждён"
    submittedLabel="21.10.2026, 13:38 МСК"
    workspaceCountLabel="1 авторский проект"
    isOwnCase={isOwnCase}
    defaultExpanded={defaultExpanded}
  >
    <form><button type="submit">Сохранить решение</button></form>
  </BusinessCaseCollapsible>,
);

const collapsed = render();
const header = collapsed.match(/<button\b[^>]*data-testid="business-verification-case-toggle"[^>]*>([\s\S]*?)<\/button>/);
assert.ok(header, "header is a separate button");
assert.match(header[0], /type="button"/);
assert.match(header[0], /aria-expanded="false"/);
assert.match(header[0], /aria-controls="case-body-sample-case"/);
for (const text of ["Лара Ларина", "Пример подтверждён", "Отправлено: 21.10.2026, 13:38 МСК", "1 авторский проект", "Развернуть заявку"]) {
  assert.ok(header[1].includes(text), `header shows ${text}`);
}
assert.doesNotMatch(header[1], /Ваш аккаунт/);
assert.match(render(false, true), /Ваш аккаунт/);
const body = collapsed.match(/<div\b[^>]*id="case-body-sample-case"[^>]*>([\s\S]*)<\/div>$/);
assert.ok(body, "aria-controls points to the body");
const bodyTag = body[0].slice(0, body[0].indexOf(">") + 1);
assert.match(bodyTag, /data-testid="business-verification-case-body"/);
assert.match(bodyTag, /\shidden=""/);
assert.match(bodyTag, /\sinert=""/);
assert.match(body[1], /<form><button type="submit">Сохранить решение<\/button><\/form>/, "submit stays mounted inside the hidden body");
assert.doesNotMatch(header[1], /type="submit"/);

const expanded = render(true);
assert.match(expanded, /aria-expanded="true"/);
assert.doesNotMatch(expanded, /\s(?:hidden|inert)(?:=|\s|>)/);
assert.match(expanded, /Свернуть заявку/);
assert.match(expanded, /rotate-180/);

const component = read("src/app/(platform)/admin/business-verification/BusinessCaseCollapsible.tsx");
assert.match(component, /^"use client";/);
assert.doesNotMatch(component, /\u2014/);

const page = read("src/app/(platform)/admin/business-verification/page.tsx");
assert.match(page, /import \{ BusinessCaseCollapsible \} from "@\/app\/\(platform\)\/admin\/business-verification\/BusinessCaseCollapsible"/);
const card = page.match(/\{cases\.map\(\(c\) => \{[\s\S]*?<li key=\{c\.id\} id=\{`case-\$\{c\.id\}`\}[^>]*>([\s\S]*?)<\/BusinessCaseCollapsible>\s*<\/li>/);
assert.ok(card, "cases.map li wraps its full card in BusinessCaseCollapsible");
assert.match(card[1], /^\s*<BusinessCaseCollapsible/);
for (const prop of ["caseId={c.id}", "applicantName={applicant.nameLabel}", "statusLabel={BUSINESS_VERIFICATION_STATUS_LABEL[status] ?? c.status}", "submittedLabel={formatMsk(c.submitted_at)}", "workspaceCountLabel={applicant.workspaceTotal}", "isOwnCase={isOwnCase}"]) {
  assert.ok(card[1].includes(prop), `card passes ${prop}`);
}
assert.match(card[1], /<form action=\{moderateBusinessVerificationAction\}/);
assert.match(card[1], /<BusinessDecisionFields/);
assert.match(card[1], /<form action=\{suspendBusinessProductAction\}/);
assert.match(card[1], /<details[\s\S]*<summary>Журнал решений/);
assert.doesNotMatch(page, /\u2014/);

console.log("admin-business-case-collapsible-unit: OK");
