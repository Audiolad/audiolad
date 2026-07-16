#!/usr/bin/env node
/**
 * Personal home safe-loader resilience checks.
 */
import {
  EMPTY_GUEST_HOME_DATA,
  EMPTY_PERSONAL_HOME_DATA,
  safeHomeSection,
} from "../src/lib/home/safe.ts";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function testSafeLoaders() {
  const guest = await safeHomeSection(
    "guest_home",
    async () => {
      throw new Error("guest_loader_failed");
    },
    EMPTY_GUEST_HOME_DATA,
  );
  assert(guest.featuredFreeProduct === null, "guest safe loader returns empty guest data");
  assert(guest.authors.length === 0, "guest safe loader clears authors");

  const personal = await safeHomeSection(
    "personal_home",
    async () => {
      throw new Error("personal_loader_failed");
    },
    EMPTY_PERSONAL_HOME_DATA,
  );
  assert(
    personal.continueListening === null,
    "personal safe loader returns empty continue card",
  );
  assert(personal.startSuggestions.length === 0, "personal safe loader clears suggestions");
}

async function testPartialSectionFallback() {
  const profile = await safeHomeSection(
    "personal_profile",
    async () => {
      throw new Error("profile_lookup_failed");
    },
    null,
    { userId: "user-1" },
  );
  assert(profile === null, "profile section falls back to null");

  const library = await safeHomeSection(
    "personal_library",
    async () => {
      throw new Error("library_lookup_failed");
    },
    [],
    { userId: "user-1" },
  );
  assert(Array.isArray(library) && library.length === 0, "library section falls back to []");
}

function testEmptyDefaults() {
  assert(EMPTY_PERSONAL_HOME_DATA.continueListening === null, "empty personal defaults");
  assert(EMPTY_GUEST_HOME_DATA.featuredFreeProduct === null, "empty guest defaults");
  assert(EMPTY_PERSONAL_HOME_DATA.timeOfDaySectionTitle.length > 0, "time-of-day title exists");
}

async function run() {
  testEmptyDefaults();
  await testSafeLoaders();
  await testPartialSectionFallback();
  console.log("personal-home-data-unit: all tests passed");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
