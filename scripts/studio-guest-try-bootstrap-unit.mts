import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  decideGuestTryPageFlow,
  decideGuestTryStartFlow,
  STUDIO_GUEST_TRY_PATH,
  STUDIO_GUEST_TRY_START_PATH,
} from "../src/lib/studio/guest-policy";

assert.equal(STUDIO_GUEST_TRY_PATH, "/studio/try");
assert.equal(STUDIO_GUEST_TRY_START_PATH, "/studio/try/start");

assert.equal(
  decideGuestTryPageFlow({ actorKind: "author", returnedFromStart: false }),
  "author_studio",
);
assert.equal(
  decideGuestTryPageFlow({ actorKind: "author", returnedFromStart: true }),
  "author_studio",
);
assert.equal(
  decideGuestTryPageFlow({ actorKind: "guest", returnedFromStart: false }),
  "continue_guest",
);
assert.equal(
  decideGuestTryPageFlow({ actorKind: "guest", returnedFromStart: true }),
  "continue_guest",
);
assert.equal(
  decideGuestTryPageFlow({ actorKind: "none", returnedFromStart: false }),
  "bootstrap",
);
assert.equal(
  decideGuestTryPageFlow({ actorKind: "none", returnedFromStart: true }),
  "bootstrap_failed",
);

assert.equal(decideGuestTryStartFlow("author"), "author_studio");
assert.equal(decideGuestTryStartFlow("guest"), "ensure_session");
assert.equal(decideGuestTryStartFlow("none"), "ensure_session");

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

const tryPage = await read("src/app/(studio)/studio/try/page.tsx");
assert.match(tryPage, /resolveStudioActor/);
assert.match(tryPage, /decideGuestTryPageFlow/);
assert.match(tryPage, /STUDIO_GUEST_TRY_START_PATH/);
assert.doesNotMatch(tryPage, /ensureGuestSession/);
assert.doesNotMatch(tryPage, /writeGuestCookie/);
assert.doesNotMatch(tryPage, /cookies\(\)\.set/);
assert.doesNotMatch(tryPage, /store\.set/);

const startRoute = await read("src/app/(studio)/studio/try/start/route.ts");
assert.match(startRoute, /export async function GET/);
assert.match(startRoute, /ensureGuestSessionRecord/);
assert.match(startRoute, /response\.cookies\.set/);
assert.match(startRoute, /NextResponse\.redirect/);
assert.match(startRoute, /started/);
assert.match(startRoute, /decideGuestTryStartFlow/);
assert.match(startRoute, /buildPublicRedirectUrl/);
assert.doesNotMatch(startRoute, /new URL\([^\n]+,\s*request\.url\)/);
assert.doesNotMatch(startRoute, /export default async function/);

const guestSession = await read("src/lib/studio/server/guest-session.ts");
assert.match(guestSession, /Call only from a Route Handler or Server Action/);
assert.match(guestSession, /ensureGuestSessionRecord/);

console.log("studio-guest-try-bootstrap-unit: ok");
