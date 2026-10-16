// Provider choice for the primary rights-holder check (task 8d9cd0af): per-provider fields, files, examples.
import assert from "node:assert/strict";

import {
  PROVIDERS,
  PROVIDER_ORDER,
  buildDraftDetails,
  evidenceKindsToUpload,
  validateProviderValues,
  type ProviderFormValues,
} from "../src/lib/business-rightsholder/providers";
import { validateEvidenceFile } from "../src/lib/business-rightsholder/examples";

const file = (name: string, type = "application/pdf", size = 1000) => new File([new Uint8Array(size)], name, { type });
const base = (over: Partial<ProviderFormValues>): ProviderFormValues => ({
  provider: "suno", trackTitle: "Track", trackUrl: "", fields: {}, files: {}, ...over,
});
const v = (over: Partial<ProviderFormValues>) => validateProviderValues(base(over), validateEvidenceFile);

assert.deepEqual(PROVIDER_ORDER, ["suno", "musicgpt", "other"]);
assert.equal(PROVIDERS.other.label, "Другой сервис / своя студия");
for (const id of PROVIDER_ORDER) {
  const cfg = PROVIDERS[id];
  assert.ok(cfg.intro && cfg.evidence.length >= 1);
  for (const slot of cfg.evidence) {
    assert.ok(slot.example.hint, `${id}/${slot.kind} hint`);
    assert.ok(slot.example.src || (slot.example.textExample?.length ?? 0) > 0, `${id}/${slot.kind} example`);
    if (id !== "suno") assert.equal(slot.example.src, undefined, "no invented screenshots");
  }
  for (const f of cfg.fields) assert.ok(f.hint, `${id}/${f.key} hint`);
}
// Suno keeps the real redacted screenshots.
assert.match(PROVIDERS.suno.evidence[0].example.src!, /suno-generation\.webp$/);
assert.match(PROVIDERS.suno.evidence[1].example.src!, /suno-pro-receipt\.webp$/);

// SUNO: link + generation refs + both files required.
let e = v({ provider: "suno" });
assert.ok(e.trackUrl && e["field:generation_refs"] && e.generation && e.paid_period);
e = v({ provider: "suno", trackUrl: "https://suno.com.evil/s/x" });
assert.ok(e.trackUrl);
e = v({ provider: "suno", trackUrl: "https://suno.com/s/abc", fields: { generation_refs: "abc\ndef" },
  files: { generation: file("g.png", "image/png"), paid_period: file("r.pdf") } });
assert.deepEqual(e, {});

// MUSICGPT: plan + both files required; link optional but must be https if given.
e = v({ provider: "musicgpt" });
assert.ok(e["field:plan_name"] && e.generation && e.paid_period);
assert.equal(e.trackUrl, undefined);
assert.ok(v({ provider: "musicgpt", trackUrl: "http://x" }).trackUrl);
e = v({ provider: "musicgpt", fields: { plan_name: "Pro" }, files: { generation: file("l.pdf"), paid_period: file("p.png", "image/png") } });
assert.deepEqual(e, {});

// OTHER: name/description required, at least one file, link optional.
e = v({ provider: "other" });
assert.ok(e["field:ai_service_other"] && e.generation);
e = v({ provider: "other", fields: { ai_service_other: "Своя студия" }, files: { paid_period: file("receipt.pdf") } });
assert.deepEqual(e, {});
// Invalid optional file still reported.
e = v({ provider: "other", fields: { ai_service_other: "Udio" }, files: { generation: file("x.zip", "application/zip") } });
assert.ok(e.generation);
// Too large.
e = v({ provider: "other", fields: { ai_service_other: "Udio" }, files: { generation: file("big.pdf", "application/pdf", 10 * 1024 * 1024 + 1) } });
assert.ok(e.generation);

// RPC args: ai_service_other only for "other"; provider_details only allowed keys; empty link -> null.
const other = buildDraftDetails(base({ provider: "other", trackUrl: "  ", fields: { ai_service_other: " Студия ", method_description: "Сам", generation_refs: "leak" } }));
assert.deepEqual(other, { aiServiceOther: "Студия", serviceTrackUrl: null, providerDetails: { method_description: "Сам" } });
const suno = buildDraftDetails(base({ provider: "suno", trackUrl: "https://suno.com/s/a", fields: { generation_refs: "a", ai_service_other: "x", plan_name: "y" } }));
assert.deepEqual(suno, { aiServiceOther: null, serviceTrackUrl: "https://suno.com/s/a", providerDetails: { generation_refs: "a" } });
assert.deepEqual(evidenceKindsToUpload(base({ provider: "other", files: { paid_period: file("a.pdf") } })), ["paid_period"]);

console.log("business-rightsholder-providers-unit: ok");
