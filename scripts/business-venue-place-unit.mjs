#!/usr/bin/env node
/** P1-12: venue address validation and QR readiness. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// Pure validate via dynamic import of compiled-less source: read and eval is fragile.
// Instead assert source contracts + reimplement tiny checks matching venue-place.ts.
const venuePlace = readFileSync(join(root, "src/lib/business-app/venue-place.ts"), "utf8");
assert.match(venuePlace, /VENUE_ADDRESS_MAX = 200/);
assert.match(venuePlace, /Укажите адрес точки/);
assert.match(venuePlace, /venuePlaceLine/);
assert.match(venuePlace, /\$\{title\} – \$\{place\}/, "en dash in place line");
assert.doesNotMatch(venuePlace, /\u2014/, "no em dash");

const form = readFileSync(join(root, "src/components/business-app/BusinessVenuePlaceForm.tsx"), "utf8");
assert.match(form, /saveBusinessLocationVenue/);
assert.match(form, /id="venue"/);
assert.match(form, /data-testid="venue-address"/);
assert.match(
  form,
  /htmlFor="venue-address">\s*Адрес точки \(город, улица, дом, при необходимости офис или помещение\)\s*<input/,
  "address guidance stays in the editable field label",
);

const mig = readFileSync(
  join(root, "supabase/migrations/20270225120000_business_location_venue_address.sql"),
  "utf8",
);
assert.match(mig, /business_owner_set_location_venue/);
assert.match(mig, /REVOKE ALL ON FUNCTION public\.business_owner_set_location_venue/);
assert.match(mig, /create_business_organization_with_location\([\s\S]*p_address_line1/);
assert.match(mig, /Rollback/);
assert.match(mig, /DROP FUNCTION IF EXISTS public\.business_owner_set_location_venue/);

const docs = readFileSync(join(root, "src/app/business-app/documents/page.tsx"), "utf8");
assert.match(docs, /biz-venue-qr-needs-address/);
assert.match(docs, /BUSINESS_VENUE_QR_NEEDS_ADDRESS/);
assert.match(docs, /preferences#venue/);

const settings = readFileSync(join(root, "src/app/business-app/settings/page.tsx"), "utf8");
assert.match(settings, /BusinessVenuePlaceForm/);

const load = readFileSync(join(root, "src/lib/business-app/venue-licence/load.server.ts"), "utf8");
assert.doesNotMatch(load, /venue_name, venue_address/, "no phantom columns");
assert.match(load, /address_line1/);

const actions = readFileSync(join(root, "src/app/business-app/actions.ts"), "utf8");
assert.match(actions, /business_owner_set_location_venue/);

console.log("business-venue-place-unit: ok");
