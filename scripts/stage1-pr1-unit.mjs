#!/usr/bin/env node
/**
 * Stage 1 PR1 unit checks: free listen storage client + auth next paths.
 * Safe to run without database access.
 */
import { readFileSync } from "node:fs";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const AUTH_ROUTES = ["/auth/sign-in", "/auth/sign-up"];
const DEFAULT_AUTHENTICATED_REDIRECT = "/profile";
const SIGN_UP_DEFAULT_REDIRECT = "/my-practices";

const DISALLOWED_NEXT_SCHEMES = ["http:", "https:", "javascript:", "data:"];

function matchesRoutePrefix(pathname, prefix) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function isAuthRoute(pathname) {
  return AUTH_ROUTES.some((route) => matchesRoutePrefix(pathname, route));
}

function getPathnameFromNext(next) {
  const withoutHash = next.split("#")[0] ?? next;
  return withoutHash.split("?")[0] ?? withoutHash;
}

function isUnsafeNextPath(trimmed) {
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) {
    return true;
  }

  if (trimmed.includes("\\")) {
    return true;
  }

  const lower = trimmed.toLowerCase();

  if (DISALLOWED_NEXT_SCHEMES.some((scheme) => lower.startsWith(scheme))) {
    return true;
  }

  if (lower.includes("://")) {
    return true;
  }

  let decoded = trimmed;

  try {
    decoded = decodeURIComponent(trimmed);
  } catch {
    return true;
  }

  if (decoded.startsWith("//")) {
    return true;
  }

  const pathname = getPathnameFromNext(decoded);

  if (!pathname.startsWith("/") || pathname.startsWith("//")) {
    return true;
  }

  return isAuthRoute(pathname);
}

function resolveValidatedNextPath(next) {
  if (!next || typeof next !== "string") {
    return null;
  }

  const trimmed = next.trim();

  if (isUnsafeNextPath(trimmed)) {
    return null;
  }

  return trimmed;
}

function getSafeNextPath(next, fallback = DEFAULT_AUTHENTICATED_REDIRECT) {
  return resolveValidatedNextPath(next) ?? fallback;
}

function buildAuthRouteHref(route, next, extraParams) {
  const params = new URLSearchParams();

  if (extraParams) {
    for (const [key, value] of Object.entries(extraParams)) {
      if (value) {
        params.set(key, value);
      }
    }
  }

  const validatedNext = resolveValidatedNextPath(next);

  if (validatedNext) {
    params.set("next", validatedNext);
  }

  const query = params.toString();

  return query ? `${route}?${query}` : route;
}

function shouldUseServiceRoleStorageForProductAccess(reason) {
  return reason === "free";
}

function isPracticePublished(status) {
  return status === "published";
}

function isPracticeCatalogListed(practice) {
  return (
    isPracticePublished(practice.status) && practice.is_catalog_listed !== false
  );
}

function resolveFreeListenReason(practice, hasEntitlement) {
  if (hasEntitlement) {
    return "granted";
  }

  if (
    practice.is_free === true &&
    isPracticePublished(practice.status) &&
    isPracticeCatalogListed(practice)
  ) {
    return "free";
  }

  if (!isPracticePublished(practice.status)) {
    return "unavailable";
  }

  return "payment_required";
}

function testServiceRoleSelection() {
  assert(
    shouldUseServiceRoleStorageForProductAccess("free"),
    "guest/auth free listen uses service role",
  );
  assert(
    !shouldUseServiceRoleStorageForProductAccess("granted"),
    "starter entitlement keeps JWT storage client",
  );
  assert(
    !shouldUseServiceRoleStorageForProductAccess("purchased"),
    "purchase entitlement keeps JWT storage client",
  );
  assert(
    !shouldUseServiceRoleStorageForProductAccess("payment_required"),
    "paid product without entitlement must not use service role",
  );
  assert(
    !shouldUseServiceRoleStorageForProductAccess("not_authenticated"),
    "guest paid product must not use service role",
  );
  assert(
    !shouldUseServiceRoleStorageForProductAccess("unavailable"),
    "unpublished product must not use service role",
  );
}

function testFreeListenReasonGuards() {
  const listedFree = {
    is_free: true,
    status: "published",
    is_catalog_listed: true,
  };

  assert(
    resolveFreeListenReason(listedFree, false) === "free",
    "published listed free without entitlement",
  );
  assert(
    resolveFreeListenReason(listedFree, true) === "granted",
    "entitlement overrides free path",
  );
  assert(
    resolveFreeListenReason(
      { is_free: true, status: "published", is_catalog_listed: false },
      false,
    ) === "payment_required",
    "unlisted free must not get free reason",
  );
  assert(
    resolveFreeListenReason(
      { is_free: true, status: "unpublished", is_catalog_listed: true },
      false,
    ) === "unavailable",
    "unpublished free must not get free reason",
  );
  assert(
    resolveFreeListenReason(
      { is_free: false, status: "published", is_catalog_listed: true },
      false,
    ) === "payment_required",
    "paid listed product must not get free reason",
  );
}

function testAuthNextPaths() {
  const practiceNext = "/practice/sergey-and-zoya/energiya-deneg";

  assert(
    getSafeNextPath(practiceNext) === practiceNext,
    "sign-in accepts internal practice path",
  );
  assert(
    getSafeNextPath(
      `${practiceNext}?library_action=add`,
    ) === `${practiceNext}?library_action=add`,
    "sign-in preserves safe query string",
  );
  assert(
    getSafeNextPath(null, SIGN_UP_DEFAULT_REDIRECT) === SIGN_UP_DEFAULT_REDIRECT,
    "sign-up fallback stays /my-practices",
  );
  assert(
    getSafeNextPath(practiceNext, SIGN_UP_DEFAULT_REDIRECT) === practiceNext,
    "sign-up with valid next returns destination",
  );
  assert(
    getSafeNextPath("https://evil.example") === DEFAULT_AUTHENTICATED_REDIRECT,
    "external URL rejected for sign-in",
  );
  assert(
    getSafeNextPath("//evil.example") === DEFAULT_AUTHENTICATED_REDIRECT,
    "protocol-relative URL rejected",
  );
  assert(
    getSafeNextPath("javascript:alert(1)") === DEFAULT_AUTHENTICATED_REDIRECT,
    "javascript URL rejected",
  );
  assert(
    getSafeNextPath("/auth/sign-in") === DEFAULT_AUTHENTICATED_REDIRECT,
    "auth-loop rejected",
  );
  assert(
    getSafeNextPath("/auth/sign-up", SIGN_UP_DEFAULT_REDIRECT) ===
      SIGN_UP_DEFAULT_REDIRECT,
    "auth-loop rejected for sign-up fallback",
  );
}

function testAuthRouteLinks() {
  const practiceNext = "/practice/sergey-and-zoya/energiya-deneg";

  assert(
    buildAuthRouteHref("/auth/sign-up", practiceNext) ===
      `/auth/sign-up?next=${encodeURIComponent(practiceNext)}`,
    "sign-in to sign-up preserves next",
  );
  assert(
    buildAuthRouteHref("/auth/sign-in", practiceNext) ===
      `/auth/sign-in?next=${encodeURIComponent(practiceNext)}`,
    "sign-up to sign-in preserves next",
  );
  assert(
    buildAuthRouteHref("/auth/sign-up", null) === "/auth/sign-up",
    "missing next omits query param",
  );
  assert(
    buildAuthRouteHref("/auth/sign-in", practiceNext, { registered: "1" }) ===
      `/auth/sign-in?registered=1&next=${encodeURIComponent(practiceNext)}`,
    "registered flow preserves next",
  );
  assert(
    buildAuthRouteHref("/auth/sign-up", "https://evil.example") ===
      "/auth/sign-up",
    "invalid next is not appended",
  );
}

function testSourceFiles() {
  const apiContext = readFileSync(
    "/var/www/audiolad/src/lib/listen/api-context.ts",
    "utf8",
  );

  assert(
    apiContext.includes("shouldUseServiceRoleStorageForProductAccess"),
    "api-context exports service role helper",
  );
  assert(
    !apiContext.includes("!user && productAccess.reason === \"free\""),
    "guest-only service role condition removed",
  );
  assert(
    apiContext.includes("shouldUseServiceRoleStorageForProductAccess(productAccess.reason)"),
    "service role selected from resolved product access reason",
  );

  const routes = readFileSync("/var/www/audiolad/src/lib/auth/routes.ts", "utf8");
  assert(routes.includes("buildAuthRouteHref"), "routes exports auth href helper");
  assert(routes.includes("SIGN_UP_DEFAULT_REDIRECT"), "routes exports sign-up fallback");

  const signUp = readFileSync(
    "/var/www/audiolad/src/app/auth/sign-up/page.tsx",
    "utf8",
  );
  assert(signUp.includes("useSearchParams"), "sign-up reads next query param");
  assert(signUp.includes("SIGN_UP_DEFAULT_REDIRECT"), "sign-up uses my-practices fallback");
  assert(signUp.includes("buildAuthRouteHref"), "sign-up preserves next on auth links");

  const signIn = readFileSync(
    "/var/www/audiolad/src/app/auth/sign-in/page.tsx",
    "utf8",
  );
  assert(signIn.includes("buildAuthRouteHref"), "sign-in preserves next on sign-up link");
}

function main() {
  testServiceRoleSelection();
  testFreeListenReasonGuards();
  testAuthNextPaths();
  testAuthRouteLinks();
  testSourceFiles();
  console.log("stage1-pr1-unit: PASS");
}

main();
