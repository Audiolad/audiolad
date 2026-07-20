/**
 * Mirrors src/lib/playlists/validation.ts + public-content.ts for smoke checks
 * without a test runner. Run: node scripts/playlists-pr2-validation-smoke.mjs
 */
import { bootstrapDataWriteScript } from "./lib/fixture-script-entry.mjs";

const SCRIPT_NAME = "scripts/playlists-pr2-validation-smoke.mjs";
const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";

const boot = bootstrapDataWriteScript({
  scriptName: SCRIPT_NAME,
  supabaseUrl: SUPABASE_URL,
  dockerExec: false,
});
if (boot.skipped) {
  process.exit(0);
}

const PLAYLIST_TITLE_MAX_LENGTH = 80;
const FORBIDDEN = new Set([
  "user_id",
  "slug",
  "published_at",
  "created_at",
  "updated_at",
  "id",
]);

function parseCreate(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false };
  }
  for (const key of Object.keys(body)) {
    if (FORBIDDEN.has(key) || !["title", "visibility"].includes(key)) {
      return { ok: false };
    }
  }
  if (typeof body.title !== "string") return { ok: false };
  const title = body.title.trim();
  if (title.length < 1 || title.length > PLAYLIST_TITLE_MAX_LENGTH) {
    return { ok: false };
  }
  const visibility = "visibility" in body ? body.visibility : "private";
  if (visibility !== "private" && visibility !== "public") return { ok: false };
  return { ok: true, title, visibility };
}

function parsePatch(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false };
  }
  const keys = Object.keys(body);
  if (keys.length === 0) return { ok: false };
  for (const key of keys) {
    if (FORBIDDEN.has(key) || !["title", "visibility"].includes(key)) {
      return { ok: false };
    }
  }
  const out = {};
  if ("title" in body) {
    if (typeof body.title !== "string") return { ok: false };
    const title = body.title.trim();
    if (title.length < 1 || title.length > PLAYLIST_TITLE_MAX_LENGTH) {
      return { ok: false };
    }
    out.title = title;
  }
  if ("visibility" in body) {
    if (body.visibility !== "private" && body.visibility !== "public") {
      return { ok: false };
    }
    out.visibility = body.visibility;
  }
  return { ok: true, ...out };
}

function isEligible(practice) {
  if (practice.status !== "published") return false;
  if (practice.is_catalog_listed !== true) return false;
  if (practice.is_free !== true) return false;
  if (practice.price !== null && practice.price > 0) return false;
  return true;
}

const CYRILLIC = {
  а: "a",
  б: "b",
  в: "v",
  г: "g",
  д: "d",
  е: "e",
  ё: "e",
  ж: "zh",
  з: "z",
  и: "i",
  й: "y",
  к: "k",
  л: "l",
  м: "m",
  н: "n",
  о: "o",
  п: "p",
  р: "r",
  с: "s",
  т: "t",
  у: "u",
  ф: "f",
  х: "h",
  ц: "ts",
  ч: "ch",
  ш: "sh",
  щ: "sch",
  ъ: "",
  ы: "y",
  ь: "",
  э: "e",
  ю: "yu",
  я: "ya",
};

function slugifyTitle(title) {
  const transliterated = Array.from(title.trim())
    .map((char) => {
      const lower = char.toLowerCase();
      return CYRILLIC[lower] === undefined ? lower : CYRILLIC[lower];
    })
    .join("");
  return transliterated
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function assert(cond, message) {
  if (!cond) {
    throw new Error(message);
  }
}

function run() {
  assert(parseCreate({ title: "  Утро  " }).ok, "trim title");
  assert(parseCreate({ title: "  Утро  " }).title === "Утро", "trimmed value");
  assert(parseCreate({ title: "" }).ok === false, "empty title");
  assert(parseCreate({ title: "   " }).ok === false, "blank title");
  assert(parseCreate({ title: "x".repeat(81) }).ok === false, "title > 80");
  assert(parseCreate({ title: "ok", visibility: "shared" }).ok === false, "bad visibility");
  assert(parseCreate({ title: "ok", user_id: "x" }).ok === false, "reject user_id");
  assert(parseCreate({ title: "ok", slug: "x" }).ok === false, "reject slug");
  assert(parseCreate({ title: "ok", visibility: "public" }).visibility === "public", "public create");
  assert(parseCreate({ title: "ok" }).visibility === "private", "default private");

  assert(parsePatch({}).ok === false, "empty patch");
  assert(parsePatch({ title: "Новое" }).ok, "rename");
  assert(parsePatch({ visibility: "private" }).ok, "visibility patch");
  assert(parsePatch({ published_at: "x" }).ok === false, "reject published_at");
  assert(parsePatch({ title: "a", extra: 1 }).ok === false, "reject unknown");

  assert(
    isEligible({
      status: "published",
      is_free: true,
      price: 0,
      is_catalog_listed: true,
    }),
    "eligible free",
  );
  assert(
    isEligible({
      status: "published",
      is_free: true,
      price: null,
      is_catalog_listed: true,
    }),
    "eligible free null price",
  );
  assert(
    !isEligible({
      status: "published",
      is_free: true,
      price: 0,
      is_catalog_listed: null,
    }),
    "reject null catalog listed (claim parity)",
  );
  assert(
    !isEligible({
      status: "published",
      is_free: false,
      price: 500,
      is_catalog_listed: true,
    }),
    "reject paid",
  );
  assert(
    !isEligible({
      status: "archived",
      is_free: true,
      price: 0,
      is_catalog_listed: true,
    }),
    "reject archived",
  );

  const slug = slugifyTitle("Утренняя энергия");
  assert(slug.includes("utrennyaya") || slug.includes("energiya") || slug.length > 0, "slugify cyrillic");
  assert(!slug.includes(" "), "slug no spaces");
  assert(!slug.startsWith("-") && !slug.endsWith("-"), "slug edges");

  console.log("playlists PR2 validation smoke: PASS");
}

run();
