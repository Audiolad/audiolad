/**
 * t1666u / t1667u: three key benefits on the guest coffee first screen and the guest legal footer.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { GUEST_COFFEE_BENEFITS, GUEST_COFFEE_LEGAL_FOOTER_TITLE } from "../src/lib/business-app/guest-coffee/benefits";
import { BUSINESS_LEGAL_PATHS } from "../src/lib/business/legal/section";

const read = (f: string) => readFileSync(f, "utf8");

assert.deepEqual(GUEST_COFFEE_BENEFITS.map((b) => b.id), ["legal", "no-repeats", "coffee"]);
for (const b of GUEST_COFFEE_BENEFITS) {
  assert.ok(b.title.length <= 28, `${b.id}: short title`);
  assert.ok(b.text.length <= 110, `${b.id}: one or two lines on 375 px`);
  assert.doesNotMatch(b.title + b.text, /—/, `${b.id}: en dash only`);
  assert.doesNotMatch(b.title + b.text, /https?:|www\./, `${b.id}: no links`);
}
const legal = GUEST_COFFEE_BENEFITS[0];
assert.match(legal.text, /РАО и ВОИС/);
assert.match(legal.text, /напрямую от правообладателя/, "same basis as the legal section");
assert.doesNotMatch(legal.text, /без претензий|никаких претензий|без штрафов/i, "no promise that a claim can never come");
assert.equal(GUEST_COFFEE_LEGAL_FOOTER_TITLE, "Документы");

// Placement: benefits right after the header and before the picker; footer after it; both guest-only.
const section = read("src/components/business-app/sound/BusinessMusicSection.tsx");
const iHeader = section.indexOf("</header>");
const iBenefits = section.indexOf("<BusinessMemberOnly guest={<GuestCoffeeBenefits />} />");
const iStudio = section.indexOf("<BusinessSoundStudio");
const iFooter = section.indexOf("<BusinessMemberOnly guest={<GuestCoffeeLegalFooter />} />");
assert.ok(iHeader > 0 && iHeader < iBenefits && iBenefits < iStudio && iStudio < iFooter, "header → benefits → picker → footer");

// Footer: exactly the five legal section pages, absolute to our own audiolad.ru, new tab like the cabinet.
const { GUEST_COFFEE_LEGAL_LINKS } = await import("../src/components/business-app/sound/GuestCoffeeLegalFooter");
assert.deepEqual(
  GUEST_COFFEE_LEGAL_LINKS.map((l) => new URL(l.href).pathname).sort(),
  [...BUSINESS_LEGAL_PATHS].sort(),
);
for (const l of GUEST_COFFEE_LEGAL_LINKS) assert.equal(new URL(l.href).origin, "https://audiolad.ru", `${l.id}: own site only`);
const footer = read("src/components/business-app/sound/GuestCoffeeLegalFooter.tsx");
assert.doesNotMatch(footer, /—/);
assert.match(footer, /target="_blank"/);

console.log("business-guest-coffee-benefits-unit: ok");
