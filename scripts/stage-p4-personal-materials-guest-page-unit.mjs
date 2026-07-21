#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

function testRouteAndLayout() {
  const page = read("src/app/d/[token]/page.tsx");
  const layout = read("src/app/d/layout.tsx");
  const notFound = read("src/app/d/[token]/not-found.tsx");
  const nextConfig = read("next.config.ts");
  const robots = read("src/app/robots.ts");

  assert(page.includes("findGuestMaterialByRawToken"), "server metadata lookup");
  assert(page.includes("claimed_by_user_id"), "claimed landing branch");
  assert(page.includes("PersonalMaterialClaimedLanding"), "claimed landing component");
  assert(page.includes("canOwnerAccessMaterial"), "owner redirect guard");
  assert(page.includes("/my-materials/"), "owner redirect path");
  assert(page.includes("notFound()"), "404 unavailable");
  assert(!page.includes("ListenerAppShell"), "no listener shell");
  assert(!page.includes("console.log"), "no console logging");
  assert(layout.includes("buildPersonalMaterialGuestMetadata"), "guest layout metadata");
  assert(notFound.includes("PersonalMaterialUnavailable"), "neutral unavailable");
  assert(nextConfig.includes('source: "/d/:path*"'), "privacy headers in next config");
  assert(nextConfig.includes("no-referrer"), "referrer policy");
  assert(robots.includes('"/d/"'), "robots disallow /d/");
}

function testGuestComponents() {
  const guestPage = read("src/components/personal-materials/guest/PersonalMaterialGuestPage.tsx");
  const player = read("src/components/personal-materials/guest/PersonalMaterialAudioPlayer.tsx");
  const saveCta = read("src/components/personal-materials/guest/PersonalMaterialSaveCta.tsx");
  const unavailable = read("src/components/personal-materials/guest/PersonalMaterialUnavailable.tsx");
  const returnCta = read("src/components/personal-materials/PersonalMaterialReturnChatCta.tsx");

  assert(guestPage.includes("PersonalMaterialAudioPlayer"), "player on page");
  assert(guestPage.includes("PersonalMaterialSaveCta"), "save cta");
  assert(guestPage.includes("PersonalMaterialReturnChatCta"), "return cta reuse");
  assert(guestPage.includes("break-words"), "overflow protection");
  assert(guestPage.includes("max-w-[820px]"), "center column");
  assert(guestPage.includes("clientLastName"), "pass last name for save prefills");
  assert(!guestPage.includes("dangerouslySetInnerHTML"), "plain text only");

  const claimedLanding = read(
    "src/components/personal-materials/guest/PersonalMaterialClaimedLanding.tsx",
  );
  assert(
    claimedLanding.includes("Материал сохранён в вашем личном кабинете"),
    "claimed login title",
  );
  assert(
    claimedLanding.includes("Войти и открыть диагностику"),
    "claimed login submit",
  );
  assert(
    claimedLanding.includes("Этот материал сохранён в другом аккаунте"),
    "wrong account message",
  );
  assert(claimedLanding.includes("PasswordInput"), "claimed login password toggle");
  assert(!claimedLanding.includes("audioApiPath"), "no audio on claimed landing");
  assert(!claimedLanding.includes("clientFirstName"), "no client name on claimed landing");

  assert(player.includes('cache: "no-store"'), "audio fetch no-store");
  assert(player.includes("preload=\"none\""), "no autoplay preload");
  assert(player.includes("readPersonalMaterialGuestProgress"), "progress restore");
  assert(player.includes("writePersonalMaterialGuestProgress"), "progress save");
  assert(!player.includes("console.log"), "no audio console logs");
  assert(player.includes("Retry-After"), "429 retry-after");
  assert(player.includes("aria-label"), "player a11y");

  assert(saveCta.includes("claimContextApiPath"), "claim context api prop");
  assert(saveCta.includes(">Создать<") || saveCta.includes("\n          Создать\n"), "inline register mode");
  assert(saveCta.includes(">Войти<") || saveCta.includes("\n          Войти\n"), "inline login mode");
  assert(saveCta.includes("Создать кабинет и сохранить диагностику"), "register submit");
  assert(saveCta.includes("Войти и сохранить диагностику"), "login submit");
  assert(!saveCta.includes("Зарегистрироваться"), "old register label removed");
  assert(!saveCta.includes("Уже есть аккаунт"), "old login label removed");
  assert(saveCta.includes("break-words"), "cta wrap on mobile");
  assert(saveCta.includes("whitespace-normal"), "cta wrap on mobile");
  assert(saveCta.includes("Войти и сохранить диагностику"), "login submit");
  assert(saveCta.includes("Добавить в личный кабинет"), "authenticated claim");
  assert(saveCta.includes("PasswordInput"), "password visibility toggle");
  assert(!saveCta.includes("localStorage"), "no token storage");
  assert(!saveCta.includes("sessionStorage"), "no session storage");

  assert(unavailable.includes("Материал недоступен"), "neutral title");
  assert(!unavailable.includes("revoked"), "no reason leak");
  assert(returnCta.includes('rel="noopener noreferrer"'), "return link rel");
}

function testOptionalTextBlocksWithoutHeadings() {
  const description = read(
    "src/components/personal-materials/guest/PersonalMaterialDescription.tsx",
  );
  const recommendation = read(
    "src/components/personal-materials/guest/PersonalMaterialRecommendation.tsx",
  );
  const guestPage = read(
    "src/components/personal-materials/guest/PersonalMaterialGuestPage.tsx",
  );
  const detail = read(
    "src/components/personal-materials/library/MyMaterialDetailClient.tsx",
  );

  assert(description.includes("FormattedPlainText"), "description plain text");
  assert(!description.includes("О диагностике"), "no description auto heading");
  assert(!description.includes("<h2"), "description no h2");
  assert(recommendation.includes("FormattedPlainText"), "recommendation plain text");
  assert(recommendation.includes("rounded-2xl"), "recommendation highlight kept");
  assert(!recommendation.includes("Персональная рекомендация"), "no recommendation heading");
  assert(!recommendation.includes("✦"), "no decorative label");
  assert(!recommendation.includes("<h2"), "recommendation no h2");
  assert(guestPage.includes("shouldRenderOptionalBlock(material.description)"), "guest hide empty description");
  assert(
    guestPage.includes("shouldRenderOptionalBlock(material.personalRecommendation)"),
    "guest hide empty recommendation",
  );
  assert(detail.includes("shouldRenderOptionalBlock(material.description)"), "cabinet hide empty description");
  assert(detail.includes("shouldRenderOptionalBlock(material.recommendation)"), "cabinet hide empty recommendation");
  assert(detail.includes("PersonalMaterialDescription"), "cabinet reuses description");
  assert(detail.includes("PersonalMaterialRecommendation"), "cabinet reuses recommendation");
}

function testClaimFlow() {
  const claimContext = read("src/app/api/d/[token]/claim-context/route.ts");
  const claim = read("src/app/api/d/[token]/claim/route.ts");
  const claimPage = read("src/app/personal-materials/claim/page.tsx");
  const myMaterial = read(
    "src/app/(listener)/(library)/my-materials/[id]/page.tsx",
  );
  const claimLib = read("src/lib/personal-materials/server/claim.ts");

  assert(claimContext.includes("createSignedClaimContext"), "signed cookie");
  assert(claimContext.includes("buildClaimContextCookieHeader"), "httpOnly cookie");
  assert(claim.includes("claimPersonalMaterialByRawToken"), "authenticated claim");
  assert(claimPage.includes("verifySignedClaimContext"), "cookie verify");
  assert(claimPage.includes("claimPersonalMaterialByMaterialId"), "post-auth claim");
  assert(claimPage.includes("/personal-materials/claim"), "claim completion path");
  assert(myMaterial.includes("getMyPersonalMaterial"), "owner read via repository");
  assert(claimLib.includes("claim_personal_material"), "rpc call");
}

function testSecurityAndPrivacy() {
  const page = read("src/app/d/[token]/page.tsx");
  const player = read("src/components/personal-materials/guest/PersonalMaterialAudioPlayer.tsx");
  const metadata = read("src/lib/personal-materials/guest/privacy.ts");

  assert(!page.includes("analytics"), "no analytics on guest page");
  assert(metadata.includes("noindex"), "metadata noindex");
  assert(!player.includes("localStorage.getItem(token"), "token not in storage key");
}

function testResponsiveClasses() {
  const guestPage = read("src/components/personal-materials/guest/PersonalMaterialGuestPage.tsx");
  const saveCta = read("src/components/personal-materials/guest/PersonalMaterialSaveCta.tsx");
  const returnCta = read("src/components/personal-materials/PersonalMaterialReturnChatCta.tsx");

  assert(guestPage.includes("w-full"), "full width mobile");
  assert(guestPage.includes("px-4"), "mobile padding");
  assert(saveCta.includes("w-full"), "save cta full width");
  assert(returnCta.includes("w-full"), "return cta full width");
  assert(returnCta.includes("break-words"), "return label wrap");
}

async function runModuleTests() {
  const { execSync } = await import("node:child_process");
  const output = execSync(
    `npx --yes tsx ${path.join(ROOT, "scripts/stage-p4-personal-materials-guest-page-module-unit.mjs")}`,
    { encoding: "utf8" },
  );
  process.stdout.write(output);
}

async function main() {
  testRouteAndLayout();
  testGuestComponents();
  testOptionalTextBlocksWithoutHeadings();
  testClaimFlow();
  testSecurityAndPrivacy();
  testResponsiveClasses();
  await runModuleTests();
  console.log("stage-p4-personal-materials-guest-page-unit: PASS");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
