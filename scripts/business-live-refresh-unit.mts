import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  BUSINESS_ENTRY_COOKIE,
  BUSINESS_LIVE_IDLE_AFTER_MS,
  BUSINESS_LIVE_IDLE_REFRESH_MS,
  BUSINESS_LIVE_REFRESH_MS,
  businessEntryCookieValue,
  businessEntrySwitchAction,
  businessLiveRefreshPath,
  isTypingTarget,
  parseBusinessEntry,
  startBusinessLiveRefresh,
} from "../src/lib/business-app/live-refresh";

function fakeEnv() {
  const state = { t: 0, hidden: false, busy: false, tick: null as null | (() => void), cancelled: false };
  const wake = new Set<() => void>();
  const activity = new Set<() => void>();
  return {
    state,
    wake: () => wake.forEach((f) => f()),
    act: () => activity.forEach((f) => f()),
    /** Advance time and fire the interval callback for every whole interval that passed. */
    advance(ms: number, step = BUSINESS_LIVE_REFRESH_MS) {
      for (let done = 0; done < ms; done += step) {
        state.t += step;
        state.tick?.();
      }
    },
    listeners: () => wake.size + activity.size,
    env: {
      now: () => state.t,
      isHidden: () => state.hidden,
      isBusy: () => state.busy,
      schedule: (cb: () => void) => ((state.tick = cb), 1),
      cancel: () => {
        state.cancelled = true;
      },
      addWakeListener: (cb: () => void) => (wake.add(cb), () => wake.delete(cb)),
      addActivityListener: (cb: () => void) => (activity.add(cb), () => activity.delete(cb)),
    },
  };
}

// Cadence like audiolad.ru asked for: about every 3 s.
assert.equal(BUSINESS_LIVE_REFRESH_MS, 3_000);
assert.ok(BUSINESS_LIVE_IDLE_REFRESH_MS >= 15_000 && BUSINESS_LIVE_IDLE_AFTER_MS >= 60_000);

{
  const f = fakeEnv();
  let n = 0;
  const stop = startBusinessLiveRefresh(() => n++, f.env);
  assert.equal(f.listeners(), 2);
  f.advance(9_000);
  assert.equal(n, 3, "refreshes every 3 s while visible and active");

  f.state.hidden = true;
  f.advance(30_000);
  assert.equal(n, 3, "hidden tab does not refresh");
  f.state.hidden = false;
  f.wake();
  assert.equal(n, 4, "back to the tab – refresh at once");
  f.wake();
  assert.equal(n, 4, "focus + visibility burst refreshes once");

  f.state.busy = true;
  f.advance(15_000);
  assert.equal(n, 4, "typing, open dialog or refresh in flight – skip");
  f.state.busy = false;
  f.act();
  f.advance(3_000);
  assert.equal(n, 5);

  stop();
  assert.equal(f.state.cancelled, true);
  assert.equal(f.listeners(), 0);
  f.state.tick?.();
  assert.equal(n, 5, "queued tick after stop is ignored");
}

{
  // Idle page backs off to the slow cadence; activity brings it back at once.
  const f = fakeEnv();
  let n = 0;
  startBusinessLiveRefresh(() => n++, f.env);
  f.advance(BUSINESS_LIVE_IDLE_AFTER_MS);
  const beforeIdle = n;
  // The tick that lands exactly on the idle boundary already uses the slow cadence.
  assert.equal(beforeIdle, BUSINESS_LIVE_IDLE_AFTER_MS / BUSINESS_LIVE_REFRESH_MS - 1);
  f.advance(60_000);
  const idleRefreshes = n - beforeIdle;
  assert.ok(idleRefreshes >= 1 && idleRefreshes <= 60_000 / BUSINESS_LIVE_IDLE_REFRESH_MS + 1, `idle backoff, got ${idleRefreshes}`);
  const before = n;
  f.state.t += 2_000;
  f.act();
  assert.equal(n, before + 1, "first activity after idle refreshes at once");
  f.advance(3_000);
  assert.equal(n, before + 2, "fast cadence again");
}

// Which screens refresh: data screens yes, player, settings, onboarding no.
for (const path of ["/", "/documents", "/help", "/profile"]) assert.equal(businessLiveRefreshPath(path), true, path);
for (const path of ["/music", "/preferences", "/onboarding", "/point", "/guest", "/spa", "/coffee-handoff"]) {
  assert.equal(businessLiveRefreshPath(path), false, path);
}

// Typing targets pause the refresh, buttons and checkboxes do not.
assert.equal(isTypingTarget({ tagName: "INPUT", type: "text" }), true);
assert.equal(isTypingTarget({ tagName: "INPUT" }), true);
assert.equal(isTypingTarget({ tagName: "TEXTAREA" }), true);
assert.equal(isTypingTarget({ tagName: "SELECT" }), true);
assert.equal(isTypingTarget({ tagName: "DIV", isContentEditable: true }), true);
assert.equal(isTypingTarget({ tagName: "INPUT", type: "checkbox" }), false);
assert.equal(isTypingTarget({ tagName: "BUTTON" }), false);
assert.equal(isTypingTarget(null), false);

// Header switcher side survives a reload via a UI cookie.
assert.equal(parseBusinessEntry("venue"), "venue");
assert.equal(parseBusinessEntry("person"), "person");
assert.equal(parseBusinessEntry(undefined), "person");
assert.equal(parseBusinessEntry("admin"), "person");
const cookie = businessEntryCookieValue("venue", true);
assert.match(cookie, new RegExp(`^${BUSINESS_ENTRY_COOKIE}=venue; Path=/; Max-Age=\\d+; SameSite=Lax; Secure$`));
assert.doesNotMatch(businessEntryCookieValue("person", false), /Secure/);

// A switch opens home or re-reads it.
assert.deepEqual(businessEntrySwitchAction("/"), { kind: "refresh" });
assert.deepEqual(businessEntrySwitchAction("/music"), { kind: "navigate", href: "/" });
assert.deepEqual(businessEntrySwitchAction("/documents"), { kind: "navigate", href: "/" });

// Wiring (string checks, the components are client-only).
const switcher = readFileSync("src/components/business-app/BusinessEntrySwitcher.tsx", "utf8");
assert.match(switcher, /businessEntrySwitchAction\(pathname\)/);
assert.match(switcher, /router\.push\(action\.href\)/);
assert.match(switcher, /router\.refresh\(\)/);
assert.doesNotMatch(switcher, /setEntry\("venue"\)/, "switcher goes through switchTo");
const provider = readFileSync("src/components/business-app/BusinessPointMode.tsx", "utf8");
assert.match(provider, /document\.cookie = businessEntryCookieValue/);
assert.match(provider, /useState<Entry>\(initialEntry\)/);
const layout = readFileSync("src/app/business-app/layout.tsx", "utf8");
assert.match(layout, /cookies\(\)\)\.get\(BUSINESS_ENTRY_COOKIE\)/);
assert.match(layout, /initialEntry=\{initialEntry\}/);
const shell = readFileSync("src/components/business-app/BusinessAppShell.tsx", "utf8");
assert.match(shell, /<BusinessEntryProvider initialEntry=\{initialEntry\}>/);
assert.match(shell, /<BusinessLiveRefresh enabled=\{signedIn \|\| pointReports\} \/>/);
const live = readFileSync("src/components/business-app/BusinessLiveRefresh.tsx", "utf8");
assert.match(live, /startTransition\(\(\) => router\.refresh\(\)\)/);
assert.match(live, /restoreWindowScrollY\(scrollY\)/);
assert.match(live, /visibilityState === "hidden"/);
const home = readFileSync("src/components/business-app/BusinessHomePage.tsx", "utf8");
assert.match(home, /data-entry=\{venueSide \? "venue" : "person"\}/);
assert.match(home, /venueSide \? locationName \|\| "Кофейня" : greeting/);

console.log("business-live-refresh-unit OK");
