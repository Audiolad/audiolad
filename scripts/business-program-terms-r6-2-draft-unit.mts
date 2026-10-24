// Task b01d3006: draft r6.2 of the legacy program terms is a NEW edition with its own checksum.
// r6.1 (accepted, referenced by consent records via document_key + version + content_hash) must stay byte-identical.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

import { PROGRAM_TERMS_R6_MD, PROGRAM_TERMS_R6_MD_SHA256 } from "../src/lib/business-rightsholder/legal-drafts/content";
import {
  PROGRAM_TERMS_R6_2_DRAFT_MD,
  PROGRAM_TERMS_R6_2_DRAFT_MD_SHA256,
} from "../src/lib/business-rightsholder/legal-drafts/program-terms-r6-2-draft";
import {
  PROGRAM_TERMS_R6_2_DRAFT_DOCUMENT,
  PUBLIC_PROGRAM_DOCUMENTS,
  programTermsDocument,
} from "../src/lib/business-rightsholder/program-documents";

const root = process.cwd();
const sha256 = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
const read = (file: string) => readFileSync(path.join(root, file), "utf8");

const R6_1_FILE = "docs/business/public/archive/program-terms-r6.1-2026-10-18.md";
const R6_2_FILE = "docs/business/public/drafts/program-terms-r6.2-2026-10-23.md";
// Hash of r6.1 as accepted (18.10.2026). Never change it.
const R6_1_ACCEPTED_SHA256 = "a3e74c3a6b06bd6c8e29ecc6e832984a7a2f7f5af75c44252c7ba1a85c98bc88";

// r6.1 untouched: archive file, embedded copy and the published legacy document.
const r61 = read(R6_1_FILE);
assert.equal(sha256(r61), R6_1_ACCEPTED_SHA256, "r6.1 archive must stay byte-identical");
assert.equal(PROGRAM_TERMS_R6_MD, r61);
assert.equal(PROGRAM_TERMS_R6_MD_SHA256, R6_1_ACCEPTED_SHA256);
const current = PUBLIC_PROGRAM_DOCUMENTS.business_program_terms;
assert.equal(current.version, "r6.1-2026-10-18");
assert.equal(current.status, "approved");
assert.equal(current.sha256, R6_1_ACCEPTED_SHA256);

// r6.2: own text file, own checksum, verbatim embedded copy.
const r62 = read(R6_2_FILE);
assert.equal(PROGRAM_TERMS_R6_2_DRAFT_MD, r62, "embedded r6.2 must equal the draft file");
assert.equal(sha256(r62), PROGRAM_TERMS_R6_2_DRAFT_MD_SHA256, "r6.2 checksum");
assert.notEqual(PROGRAM_TERMS_R6_2_DRAFT_MD_SHA256, R6_1_ACCEPTED_SHA256);
assert.equal(PROGRAM_TERMS_R6_2_DRAFT_DOCUMENT.version, "r6.2-2026-10-23");
assert.equal(PROGRAM_TERMS_R6_2_DRAFT_DOCUMENT.status, "draft");
assert.equal(PROGRAM_TERMS_R6_2_DRAFT_DOCUMENT.sha256, PROGRAM_TERMS_R6_2_DRAFT_MD_SHA256);
assert.equal(PROGRAM_TERMS_R6_2_DRAFT_DOCUMENT.markdown, r62);

// Only the edition date and the licensor line differ from r6.1.
const a = r61.split("\n");
const b = r62.split("\n");
assert.equal(b.length, a.length);
const changed = a.flatMap((line, index) => (line === b[index] ? [] : [index]));
assert.deepEqual(changed, [2, 4], "r6.2 changes only the edition line and the licensor line");
assert.equal(b[2], "Раздел оферты сервиса «АудиоЛад Бизнес». Редакция от 23.10.2026.");
assert.match(b[4]!, /^Лицензиар – оператор сервиса «АудиоЛад Бизнес»\. Реквизиты оператора опубликованы на странице «Реквизиты»/);
assert.doesNotMatch(r62, /ИНН|ОГРН|паспорт/i, "r6.2 carries no inline personal requisites");
assert.doesNotMatch(r62, /—/, "r6.2 keeps r6.1 en dashes");

// Not published: neither flag state serves the draft.
for (const flag of [false, true]) {
  assert.notEqual(programTermsDocument(flag).version, PROGRAM_TERMS_R6_2_DRAFT_DOCUMENT.version);
  assert.notEqual(programTermsDocument(flag).sha256, PROGRAM_TERMS_R6_2_DRAFT_MD_SHA256);
}

console.log("business program terms r6.2 draft: ok");
