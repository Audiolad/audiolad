#!/usr/bin/env node
/**
 * Regression: /profile no longer hosts the Continue-listening block or its
 * catalog/progress data pipeline. Home continue-listening stays intact.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { ProfilePageData } from "../src/lib/profile/types.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(relPath: string) {
  return readFileSync(path.join(root, relPath), "utf8");
}

function sliceFunction(source: string, name: string) {
  const start = source.indexOf(`export async function ${name}`);
  assert.notEqual(start, -1, `${name} must exist`);
  const nextExport = source.indexOf("\nexport ", start + 1);
  return source.slice(start, nextExport === -1 ? undefined : nextExport);
}

const profilePage = read("src/app/(platform)/profile/page.tsx");
const profileQueries = read("src/lib/profile/queries.ts");
const profileTypes = read("src/lib/profile/types.ts");
const profileLayout = read("src/lib/profile/layout.ts");
const profileLoading = read("src/app/(platform)/profile/loading.tsx");
const profileSections = read("src/components/profile/ProfileSections.tsx");
const personalHome = read("src/components/home/PersonalHome.tsx");
const homeContinue = read("src/components/home/ContinueListening.tsx");
const homeProgress = read("src/lib/home/listening-progress.ts");
const homeData = read("src/lib/home/data.ts");
const homeTypes = read("src/lib/home/types.ts");

const continueComponentPath = path.join(
  root,
  "src/components/profile/ProfileContinueSection.tsx",
);

function testProfileDoesNotRenderContinue() {
  assert.doesNotMatch(
    profilePage,
    /ProfileContinueSection/,
    "/profile must not import or render ProfileContinueSection",
  );
  assert.doesNotMatch(
    profilePage,
    /continueState/,
    "/profile must not pass continueState",
  );
  assert.equal(
    existsSync(continueComponentPath),
    false,
    "ProfileContinueSection.tsx must be removed, not left unused",
  );
}

function testProfilePageDataHasNoContinueState() {
  assert.doesNotMatch(
    profileTypes,
    /ProfileContinueState/,
    "profile-only ProfileContinueState must be removed",
  );
  assert.doesNotMatch(
    profileTypes,
    /continueState/,
    "ProfilePageData must not require continueState",
  );
  assert.doesNotMatch(
    profileTypes,
    /ContinueListeningItem/,
    "profile types must not import home ContinueListeningItem",
  );

  const sample: ProfilePageData = {
    card: {
      displayName: "Тест",
      initial: "Т",
      email: "listener@example.com",
      avatarUrl: null,
      rolePrimaryLabel: "Слушатель",
      authorWorkspaceCountLabel: null,
    },
    counters: [
      {
        key: "library",
        value: 2,
        label: "в аудиотеке",
        href: "/my-practices",
      },
      {
        key: "playlists",
        value: 1,
        label: "плейлистов",
        href: "/playlists",
      },
      {
        key: "completed",
        value: 0,
        label: "завершено",
        href: "/history?filter=completed",
      },
    ],
    authorSection: { kind: "application", variant: "none" },
    showAdminPanel: true,
  };

  assert.equal(
    "continueState" in sample,
    false,
    "typed ProfilePageData sample must not carry continueState",
  );
  assert.ok(sample.counters.length === 3, "typed sample still has counters");
  assert.equal(sample.showAdminPanel, true, "typed sample still has admin flag");
}

type ContinueKey = "continueState";
type ProfileRequiresContinue = ContinueKey extends keyof ProfilePageData
  ? true
  : false;
const profileDoesNotRequireContinue: ProfileRequiresContinue = false;
assert.equal(
  profileDoesNotRequireContinue,
  false,
  "compile-time: continueState is not a ProfilePageData key",
);

function testProfileQueryPipelineDropsContinue() {
  const loader = sliceFunction(profileQueries, "getProfilePageData");

  for (const token of [
    "getPublishedCatalogProducts",
    "enrichCatalogProducts",
    "getContinueListening",
    "loadAudioSummaryMap",
    "ContinueListeningItem",
    "ProfileContinueState",
    "loadContinueListeningItem",
    "buildContinueState",
    "continueState",
    "continueResult",
    "@/lib/home/listening-progress",
    "@/lib/home/types",
    "@/lib/products/catalog",
    "profile_continue_listening_error",
  ]) {
    assert.doesNotMatch(
      profileQueries,
      new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
      `profile queries must not retain ${token}`,
    );
  }

  assert.match(
    loader,
    /countActiveLibraryItems\(supabase, user\.id\)/,
    "getProfilePageData still loads library counter",
  );
  assert.match(
    loader,
    /countOwnedPlaylists\(supabase, user\.id\)/,
    "getProfilePageData still loads playlists counter",
  );
  assert.match(
    loader,
    /countCompletedPractices\(supabase, user\.id\)/,
    "getProfilePageData still loads completed counter",
  );
  assert.match(
    loader,
    /listAuthorWorkspacesForUser\(user\.id\)/,
    "getProfilePageData still loads author workspaces",
  );
  assert.match(
    loader,
    /getCurrentAuthorApplication\(supabase, user\.id\)/,
    "getProfilePageData still loads author application",
  );
  assert.match(
    loader,
    /hasAdminPanelAccess\(supabase, user\.id\)/,
    "getProfilePageData still loads admin access",
  );
}

function testHomeContinueUnchanged() {
  assert.match(
    personalHome,
    /import ContinueListening from "\.\/ContinueListening"/,
    "home still imports ContinueListening",
  );
  assert.match(
    personalHome,
    /<ContinueListening[\s\S]*item=\{data\.continueListening\}/,
    "home still renders ContinueListening from personal data",
  );
  assert.match(
    homeContinue,
    /aria-label="Продолжить прослушивание"/,
    "home ContinueListening heading contract unchanged",
  );
  assert.match(
    homeProgress,
    /export async function getContinueListening/,
    "listening-progress still exports getContinueListening",
  );
  assert.match(
    homeProgress,
    /export function enrichCatalogProducts/,
    "listening-progress still exports enrichCatalogProducts",
  );
  assert.match(
    homeProgress,
    /export async function loadAudioSummaryMap/,
    "listening-progress still exports loadAudioSummaryMap",
  );
  assert.match(
    homeData,
    /getContinueListening\(/,
    "home data still loads continue-listening",
  );
  assert.match(
    homeTypes,
    /continueListening: ContinueListeningItem \| null/,
    "home types still include continueListening",
  );
}

function testProfileCountersAndAccountSectionsRemain() {
  assert.match(
    profilePage,
    /<ProfileUserCard card=\{profileData\.card\} \/>/,
    "profile still renders user card",
  );
  assert.match(
    profilePage,
    /<ProfileCounters counters=\{profileData\.counters\} \/>/,
    "profile still renders counters",
  );
  assert.match(
    profilePage,
    /<ProfileQuickLinks/,
    "profile still renders quick links",
  );
  assert.match(
    profilePage,
    /<ProfileAuthorBlock section=\{profileData\.authorSection\} \/>/,
    "profile still renders author block",
  );
  assert.match(
    profilePage,
    /profileData\.showAdminPanel \? <ProfileAdminPanelSection \/>/,
    "profile still renders admin block when allowed",
  );
  assert.match(
    profilePage,
    /<ProfileAccountSection \/>/,
    "profile still renders account settings",
  );
  assert.match(
    profilePage,
    /<ProfileSignOutSection signOutAction=\{signOut\} \/>/,
    "profile still renders sign-out",
  );
  assert.match(
    profileSections,
    /export function ProfileCounters/,
    "ProfileCounters component remains",
  );
  assert.match(
    profileSections,
    /export function ProfileAuthorBlock/,
    "ProfileAuthorBlock component remains",
  );
  assert.match(
    profileSections,
    /export function ProfileAdminPanelSection/,
    "ProfileAdminPanelSection component remains",
  );
  assert.match(
    profileSections,
    /export function ProfileAccountSection/,
    "ProfileAccountSection component remains",
  );
  assert.match(
    profileQueries,
    /function buildCounters/,
    "counter builder remains in profile queries",
  );
  assert.match(
    profileQueries,
    /function countActiveLibraryItems/,
    "library count loader remains",
  );
  assert.match(
    profileQueries,
    /function countOwnedPlaylists/,
    "playlist count loader remains",
  );
  assert.match(
    profileQueries,
    /function countCompletedPractices/,
    "completed count loader remains",
  );
}

function testDesktopLayoutHasNoEmptyContinueSlot() {
  assert.match(
    profileLayout,
    /grid grid-cols-1 items-start xl:grid-cols-\[minmax\(320px,2fr\)_minmax\(0,3fr\)\] xl:gap-x-6/,
    "existing ProfilePageShell two-column grid is unchanged",
  );
  assert.doesNotMatch(
    profilePage,
    /profile-continue-heading/,
    "profile page has no continue heading slot",
  );
  assert.doesNotMatch(
    profileLoading,
    /xl:h-\[260px\]/,
    "loading skeleton must not reserve the continue card height",
  );
  assert.doesNotMatch(
    profileLoading,
    /xl:self-start/,
    "loading skeleton must not keep the continue self-start slot",
  );

  const afterUserCard = profilePage.slice(
    profilePage.indexOf("<ProfileUserCard"),
  );
  assert.match(
    afterUserCard,
    /<ProfileUserCard card=\{profileData\.card\} \/>\s*<ProfileCounters/,
    "desktop auto-placement: counters immediately follow the user card",
  );
}

function testMobileProfileStillRenders() {
  assert.match(
    profileLayout,
    /grid-cols-1/,
    "mobile profile stays a single stacked column",
  );
  assert.match(
    profilePage,
    /<ProfilePageShell>/,
    "mobile profile still uses ProfilePageShell",
  );
  assert.match(
    profilePage,
    /<ProfilePageHeader \/>/,
    "mobile profile still renders the header/gear",
  );

  const bodyOrder = [
    "ProfileUserCard",
    "ProfileCounters",
    "ProfileQuickLinks",
    "ProfileAuthorBlock",
    "ProfileAdminPanelSection",
    "ProfileAccountSection",
    "ProfileSignOutSection",
  ];
  let cursor = 0;
  for (const name of bodyOrder) {
    const next = profilePage.indexOf(name, cursor);
    assert.notEqual(next, -1, `mobile profile still renders ${name}`);
    cursor = next + name.length;
  }
}

testProfileDoesNotRenderContinue();
testProfilePageDataHasNoContinueState();
testProfileQueryPipelineDropsContinue();
testHomeContinueUnchanged();
testProfileCountersAndAccountSectionsRemain();
testDesktopLayoutHasNoEmptyContinueSlot();
testMobileProfileStillRenders();

console.log("profile-continue-removal-unit: ok");
