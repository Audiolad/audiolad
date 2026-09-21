/**
 * Public origin for Route Handler redirects: no localhost Location in prod.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { getSafeNextPath } from "../src/lib/auth/routes";
import {
  PRODUCTION_APP_ORIGIN,
  buildPublicRedirectUrl,
  getPublicRequestOrigin,
} from "../src/lib/seo/app-origin";
import {
  STUDIO_GUEST_TRY_PATH,
  decideGuestTryStartFlow,
} from "../src/lib/studio/guest-policy";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

process.env.NEXT_PUBLIC_APP_URL = PRODUCTION_APP_ORIGIN;

function requestAt(
  url: string,
  headers: Record<string, string> = {},
): Request {
  return new Request(url, { headers });
}

function runTests() {
  const prodForwarded = requestAt("http://localhost:3000/auth/callback", {
    host: "localhost:3000",
    "x-forwarded-host": "audiolad.ru",
    "x-forwarded-proto": "https",
  });
  assert.equal(getPublicRequestOrigin(prodForwarded), "https://audiolad.ru");
  assert.equal(
    buildPublicRedirectUrl("/auth/sign-in?error=auth_callback", prodForwarded)
      .href,
    "https://audiolad.ru/auth/sign-in?error=auth_callback",
  );
  assert.equal(
    buildPublicRedirectUrl("/auth/reset-password?error=expired", prodForwarded)
      .href,
    "https://audiolad.ru/auth/reset-password?error=expired",
  );
  const next = getSafeNextPath("/profile", "/profile");
  assert.equal(
    buildPublicRedirectUrl(next, prodForwarded).href,
    "https://audiolad.ru/profile",
  );

  const wwwForwarded = requestAt("http://127.0.0.1:3000/auth/callback", {
    host: "127.0.0.1:3000",
    "x-forwarded-host": "www.audiolad.ru",
    "x-forwarded-proto": "https",
  });
  assert.equal(getPublicRequestOrigin(wwwForwarded), "https://www.audiolad.ru");

  const schoolForwarded = requestAt("http://localhost:3000/school-site", {
    host: "localhost:3000",
    "x-forwarded-host": "school.audiolad.ru",
    "x-forwarded-proto": "https",
  });
  assert.equal(
    getPublicRequestOrigin(schoolForwarded),
    "https://school.audiolad.ru",
  );

  const maxForwarded = requestAt("http://localhost:3000/max-site", {
    host: "localhost:3000",
    "x-forwarded-host": "max.audiolad.ru",
    "x-forwarded-proto": "https",
  });
  assert.equal(getPublicRequestOrigin(maxForwarded), "https://max.audiolad.ru");

  const publicHost = requestAt("http://localhost:3000/auth/callback", {
    host: "audiolad.ru",
  });
  assert.equal(getPublicRequestOrigin(publicHost), "https://audiolad.ru");

  // Next 16 hop: nginx Host=audiolad.ru, no X-Forwarded-Proto $scheme,
  // base-server.js fills x-forwarded-proto=http and x-forwarded-host=Host.
  const hopHttpForwarded = requestAt("http://localhost:3000/auth/callback", {
    host: "audiolad.ru",
    "x-forwarded-host": "audiolad.ru",
    "x-forwarded-proto": "http",
  });
  assert.equal(getPublicRequestOrigin(hopHttpForwarded), "https://audiolad.ru");
  assert.equal(
    buildPublicRedirectUrl("/auth/sign-in?error=auth_callback", hopHttpForwarded)
      .href,
    "https://audiolad.ru/auth/sign-in?error=auth_callback",
  );
  assert.equal(
    buildPublicRedirectUrl("/studio/try?started=1", hopHttpForwarded).href,
    "https://audiolad.ru/studio/try?started=1",
  );

  const hopHttpHostOnly = requestAt("http://localhost:3001/studio/try/start", {
    host: "audiolad.ru",
    "x-forwarded-proto": "http",
  });
  assert.equal(getPublicRequestOrigin(hopHttpHostOnly), "https://audiolad.ru");

  const evilForwarded = requestAt("https://audiolad.ru/auth/callback", {
    host: "audiolad.ru",
    "x-forwarded-host": "evil.example",
    "x-forwarded-proto": "https",
  });
  assert.equal(getPublicRequestOrigin(evilForwarded), "https://audiolad.ru");
  assert.equal(
    buildPublicRedirectUrl("/profile", evilForwarded).hostname,
    "audiolad.ru",
  );

  const guestPath = `${STUDIO_GUEST_TRY_PATH}?started=1`;
  assert.equal(decideGuestTryStartFlow("none"), "ensure_session");
  assert.equal(decideGuestTryStartFlow("guest"), "ensure_session");
  const guestUrl = buildPublicRedirectUrl(STUDIO_GUEST_TRY_PATH, prodForwarded);
  guestUrl.searchParams.set("started", "1");
  assert.equal(guestUrl.href, `https://audiolad.ru${guestPath}`);

  assert.equal(decideGuestTryStartFlow("author"), "author_studio");
  assert.equal(
    buildPublicRedirectUrl("/studio/projects", prodForwarded).href,
    "https://audiolad.ru/studio/projects",
  );

  const localForwarded = requestAt("http://127.0.0.1:3000/auth/callback", {
    host: "127.0.0.1:3000",
    "x-forwarded-host": "localhost:3000",
    "x-forwarded-proto": "http",
  });
  assert.equal(getPublicRequestOrigin(localForwarded), "http://localhost:3000");
  assert.equal(
    buildPublicRedirectUrl("/auth/sign-in?error=auth_callback", localForwarded)
      .href,
    "http://localhost:3000/auth/sign-in?error=auth_callback",
  );

  const loopbackBare = requestAt("http://localhost:3000/auth/callback", {
    host: "localhost:3000",
  });
  if (process.env.NODE_ENV === "production") {
    assert.equal(getPublicRequestOrigin(loopbackBare), PRODUCTION_APP_ORIGIN);
    assert.equal(
      buildPublicRedirectUrl("/auth/sign-in?error=auth_callback", loopbackBare)
        .href.startsWith("http://localhost"),
      false,
    );
  } else {
    assert.equal(getPublicRequestOrigin(loopbackBare), "http://localhost:3000");
    assert.equal(
      buildPublicRedirectUrl("/auth/sign-in?error=auth_callback", loopbackBare)
        .href,
      "http://localhost:3000/auth/sign-in?error=auth_callback",
    );
  }

  const callbackSource = readFileSync(
    join(ROOT, "src/app/(platform)/auth/callback/route.ts"),
    "utf8",
  );
  assert.match(callbackSource, /buildPublicRedirectUrl/);
  assert.doesNotMatch(callbackSource, /url\.origin/);
  assert.doesNotMatch(callbackSource, /new URL\([^\n]+,\s*url\.origin\)/);


  // Invite route must not redirect browsers to loopback in production.
  const inviteSource = readFileSync(
    join(ROOT, "src/app/(platform)/invite/[code]/route.ts"),
    "utf8",
  );
  assert.match(inviteSource, /buildPublicRedirectUrl/);
  assert.match(inviteSource, /FOR_AUTHORS_PATH/);
  assert.match(inviteSource, /redirectToForAuthors/);
  assert.doesNotMatch(
    inviteSource,
    /new URL\(\s*["']\/become-author["']\s*,\s*request\.url\s*\)/,
  );
  assert.doesNotMatch(
    inviteSource,
    /new URL\([^\n]+,\s*request\.url\)/,
  );
  // Successful invite lands on /for-authors (no ?invited=1).
  assert.match(
    inviteSource,
    /buildPublicRedirectUrl\(\s*FOR_AUTHORS_PATH\s*,\s*request\s*\)/,
  );
  assert.doesNotMatch(
    inviteSource,
    /searchParams\.set\(\s*["']invited["']/,
  );
  // already_author branch still redirects to /become-author.
  assert.match(
    inviteSource,
    /buildPublicRedirectUrl\(\s*["']\/become-author["']\s*,\s*request\s*\)/,
  );
  assert.match(inviteSource, /already_author/);
  assert.match(
    inviteSource,
    /redirectToBecomeAuthor\(\s*request\s*\)/,
  );

  const inviteProdLike = requestAt("http://localhost:3001/invite/sergey", {
    host: "audiolad.ru",
    "x-forwarded-host": "audiolad.ru",
    "x-forwarded-proto": "https",
  });
  assert.equal(
    buildPublicRedirectUrl("/for-authors", inviteProdLike).href,
    "https://audiolad.ru/for-authors",
  );
  assert.equal(
    buildPublicRedirectUrl("/become-author", inviteProdLike).href,
    "https://audiolad.ru/become-author",
  );
  assert.doesNotMatch(
    buildPublicRedirectUrl("/for-authors", inviteProdLike).href,
    /localhost/,
  );

  const startSource = readFileSync(
    join(ROOT, "src/app/(studio)/studio/try/start/route.ts"),
    "utf8",
  );
  assert.match(startSource, /buildPublicRedirectUrl/);
  assert.doesNotMatch(startSource, /new URL\([^\n]+,\s*request\.url\)/);

  console.log("public-request-origin-unit: ok");
}

runTests();
