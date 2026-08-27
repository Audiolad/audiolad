import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  GET,
  HEAD,
  RETIRED_MEDITATION_SOLUTIONS_LANDING_PATH,
} from "../src/app/(platform)/p/25-gotovyh-resheniy-dlya-sozdaniya-svoih-meditaciy/route";
import {
  STATIC_SITEMAP_PAGES,
  buildStaticSitemapEntries,
} from "../src/lib/seo/sitemap-data";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DEAD_PATH = "/p/25-gotovyh-resheniy-dlya-sozdaniya-svoih-meditaciy";
const DEAD_SLUG = "25-gotovyh-resheniy-dlya-sozdaniya-svoih-meditaciy";

function read(relativePath: string) {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

function testRetiredPathConstant() {
  assert.equal(RETIRED_MEDITATION_SOLUTIONS_LANDING_PATH, DEAD_PATH);
}

async function testGoneResponse() {
  const getResponse = GET();
  assert.equal(getResponse.status, 410, "GET must be HTTP 410 Gone");
  assert.notEqual(getResponse.status, 200);
  assert.notEqual(getResponse.status, 301);
  assert.notEqual(getResponse.status, 302);

  const robots = getResponse.headers.get("x-robots-tag") ?? "";
  assert.match(robots, /noindex/);
  assert.match(robots, /nofollow/);
  assert.equal(getResponse.headers.get("cache-control"), "private, no-store");

  const body = await getResponse.text();
  assert.doesNotMatch(body, /<article[^>]*data-meditation-solutions-landing/);
  assert.doesNotMatch(body, /og:title|og:image|property="og:/i);
  assert.doesNotMatch(body, /rel=["']canonical["']/i);
  assert.doesNotMatch(body, /MeditationSolutionsLandingView/);
  assert.match(body, /noindex/);

  const headResponse = HEAD();
  assert.equal(headResponse.status, 410, "HEAD must be HTTP 410 Gone");
}

function testLandingImplementationRemoved() {
  assert.equal(
    existsSync(
      join(
        ROOT,
        "src/app/(platform)/p/25-gotovyh-resheniy-dlya-sozdaniya-svoih-meditaciy/page.tsx",
      ),
    ),
    false,
    "old landing page.tsx must be gone",
  );
  assert.equal(
    existsSync(
      join(
        ROOT,
        "src/app/(platform)/p/25-gotovyh-resheniy-dlya-sozdaniya-svoih-meditaciy/route.ts",
      ),
    ),
    true,
    "410 route must exist",
  );
  assert.equal(
    existsSync(join(ROOT, "src/lib/landings/25-meditation-solutions/content.ts")),
    false,
  );
  assert.equal(
    existsSync(
      join(
        ROOT,
        "src/components/landings/25-meditation-solutions/MeditationSolutionsLandingView.tsx",
      ),
    ),
    false,
  );
  assert.equal(
    existsSync(
      join(ROOT, "src/app/api/landings/25-meditation-solutions/window/route.ts"),
    ),
    false,
  );
  assert.equal(
    existsSync(join(ROOT, "scripts/meditation-solutions-landing-unit.mjs")),
    false,
  );

  const playlistPage = read("src/app/(platform)/p/[slug]/page.tsx");
  assert.match(playlistPage, /PublicPlaylistPageView/);
  assert.doesNotMatch(playlistPage, /25-gotovyh-resheniy/);
  assert.doesNotMatch(playlistPage, /MeditationSolutions/);
}

function testSitemapHasZeroReferences() {
  assert.equal(
    STATIC_SITEMAP_PAGES.some((page) => page.path === DEAD_PATH),
    false,
    "static sitemap must not list the retired landing",
  );
  assert.equal(
    STATIC_SITEMAP_PAGES.some((page) => page.path.includes(DEAD_SLUG)),
    false,
  );

  const staticUrls = buildStaticSitemapEntries("https://audiolad.ru").map(
    (entry) => entry.url,
  );
  assert.equal(
    staticUrls.filter((url) => url.includes(DEAD_SLUG)).length,
    0,
    "generated static sitemap URLs must not include the retired path",
  );

  const sitemapSource = read("src/lib/seo/sitemap-data.ts");
  assert.doesNotMatch(sitemapSource, /25-gotovyh-resheniy-dlya-sozdaniya-svoih-meditaciy/);
  assert.doesNotMatch(sitemapSource, /MEDITATION_SOLUTIONS_PUBLIC_PATH/);
  assert.doesNotMatch(sitemapSource, /lib\/landings\/25-meditation-solutions/);
}

function testNoPublicInternalLinks() {
  const bottomNav = read("src/lib/navigation/bottom-nav.ts");
  assert.doesNotMatch(bottomNav, /25-gotovyh-resheniy-dlya-sozdaniya-svoih-meditaciy/);
  assert.doesNotMatch(bottomNav, /MEDITATION_SOLUTIONS_PUBLIC_PATH/);
  assert.doesNotMatch(bottomNav, /lib\/landings\/25-meditation-solutions/);

  const robots = read("src/lib/seo/robots-config.ts");
  assert.doesNotMatch(robots, /25-gotovyh-resheniy/);
}

testRetiredPathConstant();
await testGoneResponse();
testLandingImplementationRemoved();
testSitemapHasZeroReferences();
testNoPublicInternalLinks();

console.log("retired-meditation-solutions-landing-unit: ok");
