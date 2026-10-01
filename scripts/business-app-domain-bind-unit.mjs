#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { extractBusinessFirstName } from "../src/lib/business-app/domain-identity.ts";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

assert.equal(
  extractBusinessFirstName({ metadataFirstName: "Сергей", email: "x@y.z" }),
  "Сергей",
);
assert.equal(
  extractBusinessFirstName({ fullName: "Анна Иванова" }),
  "Анна",
);
assert.equal(
  extractBusinessFirstName({ email: "owner@example.com" }),
  "owner",
);
assert.equal(extractBusinessFirstName({}), "владелец");

const home = readFileSync(
  join(repoRoot, "src/components/business-app/BusinessHomePage.tsx"),
  "utf8",
);
assert.match(home, /useBusinessDomain/);
assert.match(home, /BusinessDomainBootstrapForm/);
assert.match(home, /create_business_organization_with_location/);
assert.doesNotMatch(
  home,
  /BUSINESS_HOME_MOCK\.owner/,
  "home must not read mock owner identity",
);
assert.doesNotMatch(
  home,
  /BUSINESS_HOME_MOCK\.location/,
  "home must not read mock location identity",
);

const sidebar = readFileSync(
  join(repoRoot, "src/components/business-app/BusinessSidebar.tsx"),
  "utf8",
);
assert.match(sidebar, /useBusinessDomain/);
assert.doesNotMatch(sidebar, /BUSINESS_HOME_MOCK/);

const layout = readFileSync(
  join(repoRoot, "src/app/business-app/layout.tsx"),
  "utf8",
);
assert.match(layout, /loadBusinessOwnerHomeContext/);
assert.match(layout, /BusinessDomainProvider/);

const domainSrc = readFileSync(
  join(repoRoot, "src/lib/business-app/domain.ts"),
  "utf8",
);
assert.match(domainSrc, /business_organization_members/);
assert.match(domainSrc, /business_locations/);
assert.match(domainSrc, /business_zones/);
assert.doesNotMatch(domainSrc, /BUSINESS_HOME_MOCK/);

console.log("business-app-domain-bind-unit: ok");
