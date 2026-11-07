#!/usr/bin/env node
// Offline placement contracts; these do not replace authenticated browser checks.
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const home = read("src/app/business-app/page.tsx");
const layout = read("src/app/business-app/layout.tsx");
const preview = read("src/components/business-app/design-preview/SpaDesignPreview.tsx");

assert.match(home, /<BusinessPointSlots \/>\s*<BusinessHomePage pointLinked=\{pointLinked\} \/>/,
  "owner home keeps the card above home content");
assert.match(home, /if \(cabinet.mode === "point"\) return <BusinessHomePage pointLinked=\{null\} \/>;/,
  "point-device home does not render owner management");
assert.doesNotMatch(layout, /BusinessPointSlots/, "shared layout must not mount the card");
assert.match(layout, /<BusinessDomainProvider\b[\s\S]*<BusinessAppShell\b[^>]*>\{children\}<\/BusinessAppShell>[\s\S]*<\/BusinessDomainProvider>/,
  "home remains inside the domain and shell providers");

const mounts = [];
function scan(dir) {
  for (const entry of readdirSync(new URL(`../${dir}`, import.meta.url), { withFileTypes: true })) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) scan(path);
    else if (/\.tsx$/.test(path) && /<BusinessPointSlots\b/.test(read(path))) mounts.push(path);
  }
}
scan("src");
assert.deepEqual(mounts, ["src/app/business-app/page.tsx"],
  "music, preferences, documents, profile and other routes must not mount the card");
const slots = read("src/components/business-app/BusinessPointSlots.tsx");
assert.match(slots, /cabinet.side === "venue" \|\| domain.status !== "authenticated"/,
  "existing guest and venue-side guards stay in place");
const previewHome = preview.split('screen === "home" && (')[1]?.split('screen === "music"')[0] ?? "";
assert.equal((previewHome.match(/\{locationsCard\}/g) ?? []).length, 2,
  "phone and desktop preview home retain their card");
assert.equal((preview.match(/\{locationsCard\}/g) ?? []).length, 2,
  "no other preview screen renders the card");
assert.doesNotMatch(preview, /screen === "locations"/, "no separate management preview tab");
console.log("business-point-slots-home-unit: PASS (offline placement contracts)");
