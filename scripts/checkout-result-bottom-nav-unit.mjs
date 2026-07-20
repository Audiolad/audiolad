#!/usr/bin/env node
/**
 * Checkout result BottomNav regression checks.
 */
import { readFileSync } from "node:fs";

const ROOT = "/var/www/audiolad/.worktrees/fix-checkout-result-bottom-nav";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function testBottomNavVisibilityRules() {
  const bottomNavConfig = readFileSync(
    `${ROOT}/src/lib/navigation/bottom-nav.ts`,
    "utf8",
  );

  assert(
    bottomNavConfig.includes('"/checkout/result"'),
    "checkout result is explicitly allowed for BottomNav",
  );
  assert(
    bottomNavConfig.includes('pathname === "/checkout/result"'),
    "checkout result bypasses checkout hidden prefix",
  );
  assert(
    bottomNavConfig.includes('"/checkout/result",') &&
      bottomNavConfig.includes("BOTTOM_NAV_NEUTRAL_EXACT"),
    "checkout result is a neutral route without active tab",
  );
}

function testCheckoutResultPageShell() {
  const page = readFileSync(
    `${ROOT}/src/app/checkout/result/page.tsx`,
    "utf8",
  );
  const globals = readFileSync(`${ROOT}/src/app/globals.css`, "utf8");

  assert(page.includes('from "@/components/BottomNav"'), "page imports canonical BottomNav");
  assert(
    page.includes("platformMobileShellClass"),
    "page uses platformMobileShellClass for bottom padding",
  );
  assert(page.includes("checkout-result-shell"), "page uses checkout result shell class");
  assert(page.includes("<BottomNav />"), "page renders BottomNav");
  assert(page.includes("xl:hidden"), "BottomNav wrapper hidden on desktop");
  assert(
    globals.includes(".checkout-result-shell.platform-mobile-shell"),
    "desktop padding reset includes checkout result shell",
  );
  assert(
    !page.includes('pb-10 lg:max-w-[1180px]"'),
    "legacy fixed pb-10 removed in favor of mobile shell padding",
  );
}

function testOtherCheckoutRoutesStayHidden() {
  const bottomNav = readFileSync(`${ROOT}/src/components/BottomNav.tsx`, "utf8");
  const pwaInstall = readFileSync(`${ROOT}/scripts/pwa-install-unit.mjs`, "utf8");

  assert(
    bottomNav.includes("shouldShowBottomNav(pathname)"),
    "BottomNav uses shared visibility helper",
  );
  assert(
    pwaInstall.includes('"/checkout/"'),
    "other checkout routes remain excluded elsewhere (unchanged baseline)",
  );
}

function main() {
  testBottomNavVisibilityRules();
  testCheckoutResultPageShell();
  testOtherCheckoutRoutesStayHidden();
  console.log("checkout-result-bottom-nav-unit: ok");
}

main();
