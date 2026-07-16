#!/usr/bin/env node

import {
  formatPersonalGreeting,
  getNextRotatingIndex,
  getPersonalGreetingAtIndex,
  getPersonalHomeVisitContentFromStorage,
  getPersonalHomeWisdomAtIndex,
  normalizeStoredIndex,
  readPersonalHomeStoredIndex,
  resolvePersonalHomeVisitContent,
} from "../src/lib/home/personal-greeting.ts";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function createMemoryStorage() {
  const store = new Map();

  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
  };
}

function testNextIndexAdvances() {
  assert(getNextRotatingIndex(5, 0) === 1, "after index 0 choose another");
  assert(getNextRotatingIndex(5, 1) === 2, "after index 1 choose another");
}

function testNextIndexWraps() {
  assert(getNextRotatingIndex(5, 4) === 0, "last index wraps to start");
}

function testSingleOption() {
  assert(getNextRotatingIndex(1, 0) === 0, "single option stays at 0");
  assert(getNextRotatingIndex(0, 0) === 0, "empty set returns 0");
}

function testInvalidStoredIndex() {
  assert(getNextRotatingIndex(5, -1) === 0, "negative index starts at 0");
  assert(getNextRotatingIndex(5, 99) === 0, "out of range index starts at 0");
  assert(getNextRotatingIndex(5, null) === 0, "missing index starts at 0");
  assert(normalizeStoredIndex(Number.NaN, 5) === null, "NaN is invalid");
}

function testGreetingWithName() {
  const text = getPersonalGreetingAtIndex(0, "Сергей");
  assert(text === "Сергей, привет!", "named greeting is formatted");
  assert(
    formatPersonalGreeting("{name}, добро пожаловать", "Сергей") ===
      "Сергей, добро пожаловать",
    "template with name",
  );
}

function testGreetingWithoutName() {
  const text = getPersonalGreetingAtIndex(0, null);
  assert(text === "Рады вас видеть", "anonymous greeting at index 0");
  assert(
    getPersonalGreetingAtIndex(1, "   ") === "Снова рады вам",
    "blank name uses anonymous set",
  );
}

function testNoBrokenPlaceholders() {
  for (let index = 0; index < 5; index += 1) {
    const named = getPersonalGreetingAtIndex(index, "Сергей");
    assert(!named.includes("{name}"), "named greeting has no placeholder");
    assert(!named.includes("undefined"), "named greeting has no undefined");
    assert(!named.includes("null"), "named greeting has no null");
  }

  for (let index = 0; index < 4; index += 1) {
    const anonymous = getPersonalGreetingAtIndex(index, null);
    assert(!anonymous.startsWith(","), "anonymous greeting has no leading comma");
    assert(!anonymous.includes("{name}"), "anonymous greeting has no placeholder");
    assert(!anonymous.includes("undefined"), "anonymous greeting has no undefined");
  }
}

function testIndependentIndices() {
  const content = resolvePersonalHomeVisitContent("Сергей", 0, 0);
  assert(content.greetingIndex === 1, "greeting index advances independently");
  assert(content.wisdomIndex === 1, "wisdom index advances independently");
  assert(
    content.greetingIndex !== content.wisdomIndex ||
      content.greetingTitle !== content.wisdomPhrase,
    "greeting and wisdom stay separate values",
  );
}

function testStorageReadFailure() {
  const brokenStorage = {
    getItem() {
      throw new Error("blocked");
    },
    setItem() {},
  };

  assert(
    readPersonalHomeStoredIndex(brokenStorage, "audiolad.personalHome.lastGreeting") ===
      null,
    "read failure returns null",
  );

  const content = getPersonalHomeVisitContentFromStorage(brokenStorage, "Сергей");
  assert(content.greetingTitle.includes("Сергей"), "read failure still renders greeting");
}

function testStorageWriteFailure() {
  const brokenStorage = {
    getItem() {
      return null;
    },
    setItem() {
      throw new Error("quota");
    },
  };

  const content = getPersonalHomeVisitContentFromStorage(brokenStorage, null);
  assert(content.greetingTitle.length > 0, "write failure still returns greeting");
  assert(content.wisdomPhrase.length > 0, "write failure still returns wisdom");
}

function testVisitRotationFromStorage() {
  const storage = createMemoryStorage();

  const firstVisit = getPersonalHomeVisitContentFromStorage(storage, "Сергей");
  assert(firstVisit.greetingIndex === 0, "first visit starts at greeting 0");
  assert(firstVisit.wisdomIndex === 0, "first visit starts at wisdom 0");

  const secondVisit = getPersonalHomeVisitContentFromStorage(storage, "Сергей");
  assert(secondVisit.greetingIndex === 1, "second visit advances greeting");
  assert(secondVisit.wisdomIndex === 1, "second visit advances wisdom");
  assert(
    secondVisit.greetingTitle !== firstVisit.greetingTitle,
    "greeting text changes between visits",
  );
  assert(
    secondVisit.wisdomPhrase !== firstVisit.wisdomPhrase,
    "wisdom text changes between visits",
  );
}

function testCachedServerSnapshotPattern() {
  const cache = new Map();

  function getServerSnapshot(firstName) {
    if (!cache.has(firstName)) {
      cache.set(firstName, {
        greetingTitle: getPersonalGreetingAtIndex(0, firstName),
        wisdomPhrase: getPersonalHomeWisdomAtIndex(0),
      });
    }

    return cache.get(firstName);
  }

  const first = getServerSnapshot("Сергей");
  const second = getServerSnapshot("Сергей");

  assert(first === second, "server snapshot must stay referentially stable");
  assert(first.greetingTitle.includes("Сергей"), "cached snapshot keeps content");
}

function run() {
  testNextIndexAdvances();
  testNextIndexWraps();
  testSingleOption();
  testInvalidStoredIndex();
  testGreetingWithName();
  testGreetingWithoutName();
  testNoBrokenPlaceholders();
  testIndependentIndices();
  testStorageReadFailure();
  testStorageWriteFailure();
  testVisitRotationFromStorage();
  testCachedServerSnapshotPattern();
  console.log("personal-home-greeting-unit: all tests passed");
}

run();
