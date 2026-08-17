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
  const previousNodeEnv = process.env.NODE_ENV;

  try {
    process.env.NODE_ENV = "production";

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

    const publicHost = requestAt("http://localhost:3000/auth/callback", {
      host: "audiolad.ru",
    });
    assert.equal(getPublicRequestOrigin(publicHost), "https://audiolad.ru");

    const loopbackProd = requestAt("http://localhost:3000/auth/callback", {
      host: "localhost:3000",
    });
    assert.equal(getPublicRequestOrigin(loopbackProd), PRODUCTION_APP_ORIGIN);
    assert.equal(
      buildPublicRedirectUrl("/auth/sign-in?error=auth_callback", loopbackProd)
        .href.startsWith("http://localhost"),
      false,
    );

    const evilForwarded = requestAt("http://localhost:3000/auth/callback", {
      host: "localhost:3000",
      "x-forwarded-host": "evil.example",
      "x-forwarded-proto": "https",
    });
    assert.equal(getPublicRequestOrigin(evilForwarded), PRODUCTION_APP_ORIGIN);
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

    process.env.NODE_ENV = "development";
    const localDev = requestAt("http://localhost:3000/auth/callback", {
      host: "localhost:3000",
    });
    assert.equal(getPublicRequestOrigin(localDev), "http://localhost:3000");
    assert.equal(
      buildPublicRedirectUrl("/auth/sign-in?error=auth_callback", localDev).href,
      "http://localhost:3000/auth/sign-in?error=auth_callback",
    );

    const localForwarded = requestAt("http://127.0.0.1:3000/auth/callback", {
      host: "127.0.0.1:3000",
      "x-forwarded-host": "localhost:3000",
      "x-forwarded-proto": "http",
    });
    assert.equal(getPublicRequestOrigin(localForwarded), "http://localhost:3000");

    const callbackSource = readFileSync(
      join(ROOT, "src/app/(platform)/auth/callback/route.ts"),
      "utf8",
    );
    assert.match(callbackSource, /buildPublicRedirectUrl/);
    assert.doesNotMatch(callbackSource, /url\.origin/);
    assert.doesNotMatch(
      callbackSource,
      /new URL\([^\n]+,\s*url\.origin\)/,
    );

    const startSource = readFileSync(
      join(ROOT, "src/app/(studio)/studio/try/start/route.ts"),
      "utf8",
    );
    assert.match(startSource, /buildPublicRedirectUrl/);
    assert.doesNotMatch(startSource, /new URL\([^\n]+,\s*request\.url\)/);
  } finally {
    if (previousNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = previousNodeEnv;
    }
  }

  console.log("public-request-origin-unit: ok");
}

runTests();
