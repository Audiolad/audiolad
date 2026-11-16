/**
 * t1508u: analytics sessions open only for a visible, non-prerendered page;
 * the session route ignores prefetch / prerender requests.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  isDocumentPresentForAnalytics,
  isPrefetchOrPrerenderRequest,
  whenDocumentPresentForAnalytics,
} from "../src/lib/analytics/page-presence";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

class FakeDocument {
  visibilityState: string | undefined = "visible";
  prerendering: boolean | undefined = false;
  listeners = new Map<string, Set<() => void>>();
  addEventListener(type: string, listener: () => void) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(listener);
  }
  removeEventListener(type: string, listener: () => void) {
    this.listeners.get(type)?.delete(listener);
  }
  fire(type: string) {
    for (const listener of [...(this.listeners.get(type) ?? [])]) listener();
  }
  listenerCount() {
    let total = 0;
    for (const set of this.listeners.values()) total += set.size;
    return total;
  }
}

function testPresence() {
  const doc = new FakeDocument();
  assert.equal(isDocumentPresentForAnalytics(doc), true, "visible page is present");
  doc.visibilityState = "hidden";
  assert.equal(isDocumentPresentForAnalytics(doc), false, "hidden tab is not present");
  doc.visibilityState = "visible";
  doc.prerendering = true;
  assert.equal(isDocumentPresentForAnalytics(doc), false, "prerendering page is not present");
  doc.prerendering = undefined;
  doc.visibilityState = undefined;
  assert.equal(isDocumentPresentForAnalytics(doc), true, "no visibility API = present");
  assert.equal(isDocumentPresentForAnalytics(null), false, "no document");
}

function testImmediateWhenVisible() {
  const doc = new FakeDocument();
  let calls = 0;
  whenDocumentPresentForAnalytics(doc, () => calls++);
  assert.equal(calls, 1, "visible page starts analytics at once");
  assert.equal(doc.listenerCount(), 0, "no listeners left");
}

function testPrerenderWaitsForActivation() {
  const doc = new FakeDocument();
  doc.prerendering = true;
  let calls = 0;
  whenDocumentPresentForAnalytics(doc, () => calls++);
  assert.equal(calls, 0, "prerender does not open a session");
  doc.fire("visibilitychange");
  assert.equal(calls, 0, "still prerendering");
  doc.prerendering = false;
  doc.fire("prerenderingchange");
  assert.equal(calls, 1, "activation opens the session");
  doc.fire("visibilitychange");
  assert.equal(calls, 1, "only once");
  assert.equal(doc.listenerCount(), 0, "listeners removed");
}

function testHiddenTabWaitsForVisible() {
  const doc = new FakeDocument();
  doc.visibilityState = "hidden";
  let calls = 0;
  whenDocumentPresentForAnalytics(doc, () => calls++);
  assert.equal(calls, 0, "background tab does not open a session");
  doc.visibilityState = "visible";
  doc.fire("visibilitychange");
  assert.equal(calls, 1, "opening the tab starts analytics");
}

function testCancelBeforeVisible() {
  const doc = new FakeDocument();
  doc.visibilityState = "hidden";
  let calls = 0;
  const cancel = whenDocumentPresentForAnalytics(doc, () => calls++);
  cancel();
  assert.equal(doc.listenerCount(), 0, "cancel removes listeners");
  doc.visibilityState = "visible";
  doc.fire("visibilitychange");
  assert.equal(calls, 0, "cancelled wait never fires");
}

function testPrefetchHeaders() {
  const h = (init: Record<string, string>) => new Headers(init);
  assert.equal(isPrefetchOrPrerenderRequest(h({ "sec-purpose": "prefetch" })), true);
  assert.equal(isPrefetchOrPrerenderRequest(h({ "sec-purpose": "prefetch;prerender" })), true);
  assert.equal(isPrefetchOrPrerenderRequest(h({ purpose: "prefetch" })), true);
  assert.equal(isPrefetchOrPrerenderRequest(h({ "x-purpose": "preview" })), false);
  assert.equal(isPrefetchOrPrerenderRequest(h({})), false);
}

function testWiring() {
  const route = readFileSync(join(ROOT, "src/app/api/analytics/session/route.ts"), "utf8");
  const guard = route.indexOf("isPrefetchOrPrerenderRequest(request.headers)");
  assert.ok(guard > 0, "session route checks prefetch headers");
  assert.ok(guard < route.indexOf("upsert_analytics_session"), "guard runs before the session RPC");
  assert.ok(guard < route.indexOf("request.json()"), "guard runs before reading the body");

  const provider = readFileSync(
    join(ROOT, "src/components/analytics/PlatformAnalyticsProvider.tsx"),
    "utf8",
  );
  assert.ok(
    provider.includes("whenDocumentPresentForAnalytics("),
    "provider waits for a visible page before opening a session",
  );
  assert.ok(provider.includes("cancelPresenceWait()"), "provider cancels the wait on unmount");
}

testPresence();
testImmediateWhenVisible();
testPrerenderWaitsForActivation();
testHiddenTabWaitsForVisible();
testCancelBeforeVisible();
testPrefetchHeaders();
testWiring();
console.log("analytics-page-presence-unit: ok");
