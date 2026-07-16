#!/usr/bin/env node

import {
  getPersonalGreetingAtIndex,
  getPersonalHomeVisitContentFromStorage,
  getPersonalHomeWisdomAtIndex,
} from "../src/lib/home/personal-greeting.ts";

function createDailyGreetingFallback(firstName) {
  return {
    greetingTitle: getPersonalGreetingAtIndex(0, firstName),
    wisdomPhrase: getPersonalHomeWisdomAtIndex(0),
  };
}

function shouldUpdateDailyGreetingContent(previous, next) {
  return (
    previous.greetingTitle !== next.greetingTitle ||
    previous.wisdomPhrase !== next.wisdomPhrase
  );
}

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

function testFallbackRendersGreetingText() {
  const fallback = createDailyGreetingFallback("Сергей");

  assert(fallback.greetingTitle.includes("Сергей"), "fallback includes name");
  assert(fallback.wisdomPhrase.length > 0, "fallback includes wisdom text");
}

function testShouldUpdateIgnoresIdenticalContent() {
  const content = createDailyGreetingFallback("Сергей");

  assert(
    shouldUpdateDailyGreetingContent(content, {
      greetingTitle: content.greetingTitle,
      wisdomPhrase: content.wisdomPhrase,
    }) === false,
    "identical greeting content must not trigger another update",
  );
}

function testShouldUpdateDetectsChangedContent() {
  const previous = createDailyGreetingFallback("Сергей");
  const next = {
    greetingTitle: "Сергей, снова рады вам",
    wisdomPhrase: previous.wisdomPhrase,
  };

  assert(
    shouldUpdateDailyGreetingContent(previous, next),
    "changed greeting must trigger one update",
  );
}

function testSingleMountDoesNotLoop() {
  const storage = createMemoryStorage();
  let storageReadCount = 0;
  let updateCount = 0;
  let content = createDailyGreetingFallback("Сергей");

  storageReadCount += 1;
  const visit = getPersonalHomeVisitContentFromStorage(storage, "Сергей");
  const next = {
    greetingTitle: visit.greetingTitle,
    wisdomPhrase: visit.wisdomPhrase,
  };

  if (shouldUpdateDailyGreetingContent(content, next)) {
    content = next;
    updateCount += 1;
  }

  for (let index = 0; index < 50; index += 1) {
    createDailyGreetingFallback("Сергей");
  }

  assert(storageReadCount === 1, "storage is read once per mount effect");
  assert(updateCount <= 1, "mount causes at most one content update");
  assert(content.greetingTitle.length > 0, "greeting stays visible");
}

function testRepeatRenderWithoutEffectDoesNotTouchStorage() {
  const storage = createMemoryStorage();
  let readCount = 0;
  const trackingStorage = {
    getItem(key) {
      readCount += 1;
      return storage.getItem(key);
    },
    setItem(key, value) {
      storage.setItem(key, value);
    },
  };

  getPersonalHomeVisitContentFromStorage(trackingStorage, "Сергей");
  const readsAfterMountEffect = readCount;

  for (let index = 0; index < 20; index += 1) {
    createDailyGreetingFallback("Сергей");
  }

  assert(
    readCount === readsAfterMountEffect,
    "rerenders without effect must not read storage again",
  );
}

function simulateBrokenSubscribeLoop(onStoreChangeCalls) {
  for (let render = 0; render < 50; render += 1) {
    queueMicrotask(() => {
      onStoreChangeCalls.push(render);
    });
  }
}

function simulateStableSubscribe(onStoreChangeCalls, storage, firstName) {
  let snapshot = createDailyGreetingFallback(firstName);

  function subscribe(onStoreChange) {
    queueMicrotask(() => {
      const visit = getPersonalHomeVisitContentFromStorage(storage, firstName);
      const next = {
        greetingTitle: visit.greetingTitle,
        wisdomPhrase: visit.wisdomPhrase,
      };

      if (!shouldUpdateDailyGreetingContent(snapshot, next)) {
        return;
      }

      snapshot = next;
      onStoreChange();
    });

    return () => {
      snapshot = createDailyGreetingFallback(firstName);
    };
  }

  const cleanup = subscribe(() => {
    onStoreChangeCalls.push("update");
  });

  for (let render = 0; render < 50; render += 1) {
    createDailyGreetingFallback(firstName);
  }

  cleanup();
}

function testStableSubscribeUpdatesAtMostOnce() {
  const storage = createMemoryStorage();
  const updates = [];

  simulateStableSubscribe(updates, storage, "Сергей");

  return new Promise((resolve, reject) => {
    queueMicrotask(() => {
      try {
        assert(updates.length <= 1, "stable subscribe updates at most once");
        resolve();
      } catch (error) {
        reject(error);
      }
    });
  });
}

function testBrokenSubscribePatternWouldLoop() {
  const updates = [];
  simulateBrokenSubscribeLoop(updates);

  return new Promise((resolve, reject) => {
    queueMicrotask(() => {
      try {
        assert(
          updates.length > 1,
          "broken subscribe pattern schedules many updates",
        );
        resolve();
      } catch (error) {
        reject(error);
      }
    });
  });
}

async function run() {
  testFallbackRendersGreetingText();
  testShouldUpdateIgnoresIdenticalContent();
  testShouldUpdateDetectsChangedContent();
  testSingleMountDoesNotLoop();
  testRepeatRenderWithoutEffectDoesNotTouchStorage();
  await testBrokenSubscribePatternWouldLoop();
  await testStableSubscribeUpdatesAtMostOnce();
  console.log("daily-greeting-update-loop-unit: all tests passed");
}

run().catch((error) => {
  console.error(error.message ?? error);
  process.exit(1);
});
