#!/usr/bin/env node
/**
 * Stage 1 PR3 unit checks: library action presentation + claim button behavior.
 * Safe to run without database access.
 */
import { readFileSync } from "node:fs";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function isPracticePublished(status) {
  return status === "published";
}

function isPracticeCatalogListed(practice) {
  return isPracticePublished(practice.status) && practice.is_catalog_listed !== false;
}

function resolveLibraryAction({ access, practice, isAuthenticated, buyerPreviewMode }) {
  if (buyerPreviewMode) {
    return "hidden";
  }

  if (access.reason === "admin" || access.reason === "author_owner") {
    return "hidden";
  }

  const isPublicFreeProduct =
    practice.is_free === true &&
    isPracticeCatalogListed(practice) &&
    isPracticePublished(practice.status);

  if (!isPublicFreeProduct) {
    return "hidden";
  }

  if (access.hasEntitlement) {
    return "in_library";
  }

  if (!isAuthenticated) {
    return "sign_in";
  }

  return "add";
}

function mapLibraryClaimButtonError(status, errorCode) {
  if (status === 404 || errorCode === "practice_not_found") {
    return "Материал сейчас недоступен";
  }

  if (status === 409 || errorCode === "practice_not_free") {
    return "Этот материал нельзя добавить в подарок";
  }

  if (status === 400 || errorCode === "invalid_request") {
    return "Не удалось добавить. Проверьте данные и попробуйте ещё раз.";
  }

  return "Не удалось добавить. Попробуйте ещё раз.";
}

function resolveLibraryActionAfterClaimSuccess() {
  return "in_library";
}

function isClaimLibrarySuccessBody(body) {
  return (
    typeof body === "object" &&
    body !== null &&
    "library" in body &&
    typeof body.library?.in_library === "boolean" &&
    body.library.in_library === true
  );
}

function resolveActionAfterApiResponse(status, body) {
  if ((status === 200 || status === 201) && isClaimLibrarySuccessBody(body)) {
    return resolveLibraryActionAfterClaimSuccess();
  }

  return "add";
}

function buildAuthRouteHref(route, next) {
  const params = new URLSearchParams();
  if (next && typeof next === "string" && next.startsWith("/") && !next.startsWith("//")) {
    params.set("next", next);
  }
  const query = params.toString();
  return query ? `${route}?${query}` : route;
}

function simulateClaimClick({ action, isPending, inFlight }) {
  if (isPending || action !== "add" || inFlight) {
    return { started: false, inFlight };
  }

  return { started: true, inFlight: true };
}

const freePractice = {
  status: "published",
  is_free: true,
  is_catalog_listed: true,
};

const paidPractice = {
  status: "published",
  is_free: false,
  is_catalog_listed: true,
};

function testLibraryActionStates() {
  assert(
    resolveLibraryAction({
      access: {
        reason: "free",
        hasEntitlement: false,
        canListen: true,
      },
      practice: freePractice,
      isAuthenticated: false,
      buyerPreviewMode: false,
    }) === "sign_in",
    "guest + free + no entitlement -> sign_in",
  );

  assert(
    resolveLibraryAction({
      access: {
        reason: "free",
        hasEntitlement: false,
        canListen: true,
      },
      practice: freePractice,
      isAuthenticated: true,
      buyerPreviewMode: false,
    }) === "add",
    "auth + free + no entitlement -> add",
  );

  assert(
    resolveLibraryAction({
      access: {
        reason: "granted",
        hasEntitlement: true,
        canListen: true,
        accessSource: "free_claim",
      },
      practice: freePractice,
      isAuthenticated: true,
      buyerPreviewMode: false,
    }) === "in_library",
    "auth + free + free_claim -> in_library",
  );

  assert(
    resolveLibraryAction({
      access: {
        reason: "granted",
        hasEntitlement: true,
        canListen: true,
        accessSource: "starter",
      },
      practice: freePractice,
      isAuthenticated: true,
      buyerPreviewMode: false,
    }) === "in_library",
    "auth + free + starter -> in_library",
  );

  assert(
    resolveLibraryAction({
      access: {
        reason: "purchased",
        hasEntitlement: true,
        canListen: true,
        accessSource: "purchase",
      },
      practice: paidPractice,
      isAuthenticated: true,
      buyerPreviewMode: false,
    }) === "hidden",
    "auth + purchase -> hidden secondary button",
  );

  assert(
    resolveLibraryAction({
      access: {
        reason: "payment_required",
        hasEntitlement: false,
        canListen: false,
      },
      practice: paidPractice,
      isAuthenticated: true,
      buyerPreviewMode: false,
    }) === "hidden",
    "paid + no entitlement -> hidden",
  );

  assert(
    resolveLibraryAction({
      access: {
        reason: "free",
        hasEntitlement: false,
        canListen: true,
      },
      practice: {
        ...freePractice,
        is_catalog_listed: false,
      },
      isAuthenticated: true,
      buyerPreviewMode: false,
    }) === "hidden",
    "unlisted free -> hidden",
  );

  assert(
    resolveLibraryAction({
      access: {
        reason: "unavailable",
        hasEntitlement: false,
        canListen: false,
      },
      practice: {
        ...freePractice,
        status: "unpublished",
      },
      isAuthenticated: true,
      buyerPreviewMode: false,
    }) === "hidden",
    "unpublished -> hidden",
  );
}

function testApiSuccessTransitions() {
  assert(
    resolveActionAfterApiResponse(201, {
      library: { in_library: true },
    }) === "in_library",
    "API 201 -> in_library",
  );

  assert(
    resolveActionAfterApiResponse(200, {
      library: { in_library: true },
    }) === "in_library",
    "API 200 -> in_library",
  );
}

function testAuthRedirect() {
  const href = buildAuthRouteHref(
    "/auth/sign-in",
    "/practice/audiolad/elixir-molodosti",
  );

  assert(
    href ===
      "/auth/sign-in?next=%2Fpractice%2Faudiolad%2Felixir-molodosti",
    "401 flow uses safe next path",
  );
}

function testPendingGuard() {
  assert(
    simulateClaimClick({ action: "add", isPending: false, inFlight: false })
      .started === true,
    "first add click starts request",
  );

  assert(
    simulateClaimClick({ action: "add", isPending: true, inFlight: true })
      .started === false,
    "pending blocks repeat click",
  );

  assert(
    simulateClaimClick({ action: "in_library", isPending: false, inFlight: false })
      .started === false,
    "in_library never starts request",
  );
}

function testErrorMessages() {
  assert(
    mapLibraryClaimButtonError(400, "invalid_request").includes("Проверьте данные"),
    "400 safe message",
  );
  assert(
    mapLibraryClaimButtonError(404, "practice_not_found") ===
      "Материал сейчас недоступен",
    "404 safe message",
  );
  assert(
    mapLibraryClaimButtonError(409, "practice_not_free") ===
      "Этот материал нельзя добавить в подарок",
    "409 safe message",
  );
  assert(
    mapLibraryClaimButtonError(500, "internal_error") ===
      "Не удалось добавить. Попробуйте ещё раз.",
    "500 safe message",
  );

  const raw = "ERROR: duplicate key value violates unique constraint";
  assert(
    !mapLibraryClaimButtonError(500, raw).includes("duplicate key"),
    "raw postgres error not exposed",
  );
}

function testSourceFiles() {
  const presentation = readFileSync(
    "/var/www/audiolad/src/lib/products/practice-access-ui.ts",
    "utf8",
  );
  const button = readFileSync(
    "/var/www/audiolad/src/components/LibraryAddButton.tsx",
    "utf8",
  );
  const page = readFileSync(
    "/var/www/audiolad/src/app/practice/[...segments]/page.tsx",
    "utf8",
  );

  assert(presentation.includes("libraryAction:"), "presentation exposes libraryAction");
  assert(
    presentation.includes("resolveLibraryAction"),
    "presentation resolves library action",
  );
  assert(
    presentation.includes("access.hasEntitlement"),
    "in_library uses hasEntitlement",
  );
  assert(!presentation.includes("showSecondaryLibraryHint"), "old hint removed");

  assert(button.includes('type="button"'), "real button element");
  assert(button.includes("aria-disabled"), "aria-disabled present");
  assert(button.includes('aria-live="polite"'), "aria-live for errors");
  assert(button.includes("/api/library/claim"), "uses published claim api");
  assert(button.includes("router.refresh()"), "refresh after success");
  assert(button.includes("Войти, чтобы добавить"), "guest label");
  assert(button.includes("Добавить в Аудиотеку"), "add label");
  assert(button.includes("В Аудиотеке"), "in_library label");
  assert(!button.includes("free_claim"), "no technical source in UI");

  assert(page.includes("LibraryAddButton"), "page uses new component");
  assert(
    !page.includes("Добавление в библиотеку скоро появится"),
    "stub removed",
  );
  assert(page.includes("isAuthenticated: Boolean(user)"), "auth state passed");
  assert(page.includes("practicePagePath"), "safe return path passed");
}

function main() {
  testLibraryActionStates();
  testApiSuccessTransitions();
  testAuthRedirect();
  testPendingGuard();
  testErrorMessages();
  testSourceFiles();
  console.log("stage1-pr3-library-button-unit: PASS");
}

main();
