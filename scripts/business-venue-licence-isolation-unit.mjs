/** Public route isolation regression. No framework or database dependencies. */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = (file) => readFileSync(resolve(root, file), "utf8");
const layout = "src/app/(venue-licence)/layout.tsx";
const page = "src/app/(venue-licence)/business-venue-licence/v/[publicId]/page.tsx";
assert.equal(existsSync(resolve(root, "src/app/business-app/v")), false, "old cabinet route is gone");
assert.match(read(page), /if \(!isVenueLicencePublicEnabled\(\)\) notFound\(\);/);
assert.ok(read(page).indexOf("if (!isVenueLicencePublicEnabled())") < read(page).indexOf("await params"));
assert.match(read(page), /robots: \{ index: false, follow: false \}/);
assert.match(read(layout), /business-app-root/);
assert.match(read(layout), /business-app-public/);
assert.doesNotMatch(read("src/components/business-app/BusinessAppShell.tsx"), /venue-licence|["']\/v(?:\/|["'])/);

// Follow local runtime imports as well: a helper must not pull cabinet/session code back in.
const seen = new Set();
function inspect(file) {
  if (seen.has(file)) return;
  seen.add(file);
  const source = read(file);
  assert.doesNotMatch(source, /loadBusinessOwnerHomeContext|peekBusinessChromeAccess|BusinessDomainProvider|BusinessAppShell|BusinessChromeAccessProvider|\bcookies\s*\(|\bgetSession\s*\(/, file);
  for (const match of source.matchAll(/import\s+(?!type\b)(?:[^;]*?\s+from\s+)?["']([^"']+)["']/g)) {
    const specifier = match[1];
    assert.doesNotMatch(specifier, /business-app\/layout|business-app\/domain|session|peek\.server|supabase\/(?:server|client)|next\/headers/, `${file}: ${specifier}`);
    const base = specifier.startsWith("@/") ? resolve(root, "src", specifier.slice(2))
      : specifier.startsWith(".") ? resolve(dirname(resolve(root, file)), specifier) : null;
    if (!base || base.endsWith(".css")) continue;
    const target = [base, `${base}.ts`, `${base}.tsx`].find((path) => existsSync(path));
    assert.ok(target, `${file}: unresolved ${specifier}`);
    inspect(target);
  }
}
inspect(layout);
inspect(page);
const loader = read("src/lib/business-app/venue-licence/load.server.ts");
assert.match(loader, /peekAccessPeriodsWith\(createPeekReader\(db\)/);
assert.match(loader, /auth\.admin\.getUserById\(ownerId\)/);
assert.match(loader, /hashAccessEmail\(owner\.user\.email\)/);
assert.doesNotMatch(loader, /\.from\("access_grants"\)|\.from\("access_paid_periods"\)/);
const reader = read("src/lib/access-grants/peek-reader.server.ts");
assert.match(reader, /import "server-only"/);
assert.doesNotMatch(reader, /\.rpc\(|\.insert\(|\.upsert\(|\.update\(|\.delete\(/);
assert.match(read("src/lib/access-grants/peek.server.ts"), /createPeekReader\(createServiceRoleClient\(\)\)/);
console.log("business-venue-licence-isolation-unit: ok");
