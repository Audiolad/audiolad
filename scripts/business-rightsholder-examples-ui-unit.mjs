// Contract test for «Посмотреть пример» (task 8d9cd0af): links, assets, accessible lightbox.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";

const read = (p) => readFileSync(p, "utf8");
const examples = read("src/lib/business-rightsholder/examples.ts");
const form = read("src/components/author-dashboard/business/RightsholderVerificationForm.tsx");
const field = read("src/components/author-dashboard/business/EvidenceFileField.tsx");
const box = read("src/components/author-dashboard/business/ExampleLightbox.tsx");
const page = read("src/app/(platform)/author-dashboard/business/page.tsx");
const nav = read("src/components/author-dashboard/AuthorDashboardNav.tsx");

for (const f of ["suno-generation.webp", "suno-pro-receipt.webp"]) {
  const p = `public/business/rightsholder-examples/${f}`;
  assert.ok(existsSync(p), `${p} missing`);
  assert.ok(statSync(p).size < 200_000, `${p} not optimised`);
  assert.match(examples, new RegExp(`/business/rightsholder-examples/${f.replace(".", "\\.")}`));
  assert.equal(readFileSync(p).subarray(8, 12).toString(), "WEBP");
}
// Originals never land in the public repo.
assert.ok(!existsSync("public/business/rightsholder-examples/suno-pro-receipt.png"));

// One example link per upload field of the chosen provider (rendered via the map).
const providers = read("src/lib/business-rightsholder/providers.ts");
assert.match(form, /cfg\.evidence\.map\(/);
assert.match(form, /<EvidenceFileField/);
assert.match(form, /PROVIDER_ORDER\.map/);
assert.match(form, /type="radio"/);
assert.match(form, /author_business_verification_draft_v2/);
assert.match(form, /author_business_verification_submit_v2/);
assert.match(providers, /"Другой сервис \/ своя студия"/);
assert.match(providers, /label: "MusicGPT"/);
assert.match(providers, /label: "Suno"/);
// Suno keeps the real redacted screenshots; MusicGPT / other use text examples only (no invented screenshots).
assert.match(providers, /example: RIGHTSHOLDER_EXAMPLES\.generation/);
assert.match(providers, /example: RIGHTSHOLDER_EXAMPLES\.paid_period/);
assert.doesNotMatch(providers, /src:\s*"/, "no new screenshot assets for MusicGPT / other");
assert.match(box, /example\.src \?/);
assert.match(box, /data-text-example/);
assert.match(box, /Текстовый пример — скриншота нет/);
execFileSync("npx", ["tsx", "scripts/business-rightsholder-providers-unit.mts"], { stdio: "inherit" });
assert.match(field, /Посмотреть пример/);
assert.match(field, /aria-haspopup="dialog"/);
assert.match(examples, /Styles/);
assert.match(examples, /Account → Billing/);
assert.match(form, /type="checkbox"[^>]*checked=\{acceptTerms\}/);
assert.match(form, /useState\(false\)/);
assert.doesNotMatch(form + page, /права подтверждены/i);
assert.match(form, /Исправить и отправить снова/);

// Lightbox accessibility contract.
assert.match(box, /role="dialog"/);
assert.match(box, /aria-modal="true"/);
assert.match(box, /aria-labelledby=\{titleId\}/);
assert.match(box, /event\.key === "Escape"/);
assert.match(box, /event\.key !== "Tab"/);
assert.match(box, /event\.shiftKey/);
assert.match(box, /previous\?\.focus\(\)/);
assert.match(box, /document\.body\.style\.overflow = "hidden"/);
assert.match(box, /max-h-\[80vh\]/);
assert.match(box, /object-contain/);

assert.match(nav, /АудиоЛад Бизнес/);
assert.match(page, /\.eq\("status", "published"\)/);
console.log("business-rightsholder-examples-ui-unit: ok");
