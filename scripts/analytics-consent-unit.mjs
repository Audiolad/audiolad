#!/usr/bin/env node
import assert from "node:assert/strict";
import {
  ANALYTICS_CONSENT_CHANGED_EVENT,
  ANALYTICS_COOKIES_STORAGE_KEY,
  readAnalyticsConsent,
  writeAnalyticsConsent,
} from "../src/lib/analytics/analytics-consent.ts";

const storage = new Map();
const events = [];

globalThis.window = {
  localStorage: {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => {
      storage.set(key, value);
    },
    removeItem: (key) => {
      storage.delete(key);
    },
  },
  dispatchEvent: (event) => {
    events.push(event.type);
  },
  CustomEvent: class CustomEvent {
    type;
    detail;

    constructor(type, init) {
      this.type = type;
      this.detail = init?.detail;
    }
  },
};

storage.clear();
events.length = 0;

assert.equal(readAnalyticsConsent(), "unknown");

writeAnalyticsConsent("granted");
assert.equal(readAnalyticsConsent(), "granted");
assert.equal(storage.get(ANALYTICS_COOKIES_STORAGE_KEY), "granted");
assert.equal(events.at(-1), ANALYTICS_CONSENT_CHANGED_EVENT);

writeAnalyticsConsent("denied");
assert.equal(readAnalyticsConsent(), "denied");
assert.equal(storage.get(ANALYTICS_COOKIES_STORAGE_KEY), "denied");

storage.set(ANALYTICS_COOKIES_STORAGE_KEY, "granted");
assert.equal(readAnalyticsConsent(), "granted");

console.log("analytics-consent-unit: ok");
