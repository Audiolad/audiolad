import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ADVERTISING_COOKIES_STORAGE_KEY as KEY,
  ADVERTISING_CONSENT_CHANGED_EVENT as CHANGE,
  readAdvertisingConsent, writeAdvertisingConsent, subscribeAdvertisingConsent,
} from '../src/lib/analytics/advertising-consent.mjs';
import { consentBannerVariant, applyConsentBannerChoice } from '../src/lib/analytics/consent-banner-choice.mjs';
import { createVkAdsTracker, vkDestinationGoal, vkPixelId } from '../src/lib/analytics/vk-ads.mjs';

assert.equal(readAdvertisingConsent(), 'unknown', 'SSR');
globalThis.CustomEvent = class extends Event {
  constructor(type, init) { super(type); this.detail = init?.detail; }
};
const storage = new Map();
const win = new EventTarget();
win.location = new URL('https://business.audiolad.ru/music');
win.localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) };
globalThis.window = win;
const ANALYTICS_KEY = 'audiolad_analytics_cookies';
assert.notEqual(KEY, ANALYTICS_KEY);
assert.notEqual(CHANGE, 'audiolad:analytics-consent-changed');
for (const legacy of ['0', 'granted', 'denied']) {
  storage.set(ANALYTICS_KEY, legacy);
  assert.equal(readAdvertisingConsent(), 'unknown', `analytics ${legacy} never grants advertising`);
}
let changes = 0;
const unsubscribe = subscribeAdvertisingConsent(() => changes++);
writeAdvertisingConsent('granted');
assert.equal(readAdvertisingConsent(), 'granted');
assert.equal(storage.get(ANALYTICS_KEY), 'denied');
assert.equal(changes, 1);
storage.set(KEY, 'denied');
win.dispatchEvent(new Event('storage'));
assert.equal(readAdvertisingConsent(), 'denied');
assert.equal(changes, 2, 'cross-tab subscription');
unsubscribe(); win.dispatchEvent(new Event('storage'));
assert.equal(changes, 2, 'subscription cleanup');
for (const invalid of ['0', '1', '', 'true']) {
  storage.set(KEY, invalid); assert.equal(readAdvertisingConsent(), 'unknown');
}
for (const analytics of ['unknown', 'granted', 'denied']) {
  for (const advertising of ['unknown', 'granted', 'denied']) {
    const variant = consentBannerVariant(analytics, advertising);
    assert.equal(variant, analytics === 'unknown' ? advertising === 'unknown' ? 'all' : 'analytics' : advertising === 'unknown' ? 'advertising' : null);
    if (!variant) continue;
    for (const action of variant === 'all' ? ['allow', 'analytics-only', 'deny'] : ['allow', 'deny']) {
      storage.set(ANALYTICS_KEY, analytics); storage.set(KEY, advertising);
      applyConsentBannerChoice(variant, action, {
        analytics: value => storage.set(ANALYTICS_KEY, value), advertising: writeAdvertisingConsent,
      });
      assert.equal(storage.get(ANALYTICS_KEY), variant === 'advertising' ? analytics : action === 'deny' ? 'denied' : 'granted');
      assert.equal(storage.get(KEY), variant === 'analytics' ? advertising : action === 'allow' ? 'granted' : 'denied');
    }
  }
}
// Exercise the component's actual effects offline, replaying setup/cleanup as StrictMode does.
// Remove only TS annotations and imports; hooks are an effect collection, not a React renderer.
const source = readFileSync(new URL('../src/components/analytics/VkAdsPixel.tsx', import.meta.url), 'utf8')
  .replace(/^import .*;\n/gm, '')
  .replace('export default function', 'function')
  .replace('useRef<ReturnType<typeof createVkAdsTracker> | null>', 'useRef')
  .replace('event: MouseEvent', 'event').replace('event: Event', 'event');
const effects = [];
const scripts = [];
const doc = new EventTarget();
doc.getElementById = () => scripts[0]; doc.querySelector = () => null;
doc.createElement = () => ({}); doc.head = { appendChild: script => scripts.push(script) };
globalThis.document = doc;
process.env.NEXT_PUBLIC_VK_PIXEL_ID = '3811226';
const component = new Function('usePathname', 'useEffect', 'useRef', 'useAdvertisingConsent', 'readAdvertisingConsent', 'createVkAdsTracker', 'vkDestinationGoal', 'vkPixelId', `${source}\nreturn VkAdsPixel;`)(
  () => '/music', fn => effects.push(fn), value => ({ current: value }), readAdvertisingConsent,
  readAdvertisingConsent, createVkAdsTracker, vkDestinationGoal, vkPixelId,
);
win.addEventListener('audiolad:vk-business-access-request', () => win.dispatchEvent(new CustomEvent('audiolad:vk-business-access', { detail: 'trial' })));
for (const state of ['unknown', 'denied']) {
  storage.set(KEY, state); effects.length = 0; component();
  const cleanups = effects.map(fn => fn()); cleanups.forEach(fn => fn?.());
  assert.equal(scripts.length, 0); assert.equal(win._tmr, undefined);
}
writeAdvertisingConsent('granted'); effects.length = 0; component();
const cleanups = effects.map(fn => fn());
assert.equal(scripts.length, 1);
assert.equal(win._tmr.filter(e => e.goal === 'gift_started').length, 1, 'synchronous access response observed');
cleanups.forEach(fn => fn?.());
const replayCleanups = effects.map(fn => fn());
assert.equal(win._tmr.filter(e => e.type === 'pageView').length, 1, 'StrictMode dedupe');
win.dispatchEvent(new CustomEvent('audiolad:vk-business-access', { detail: 'paid' }));
assert.equal(win._tmr.filter(e => e.goal === 'subscription_active').length, 1, 'StrictMode replay retains granted consent');
const count = win._tmr.length;
writeAdvertisingConsent('denied');
win.dispatchEvent(new CustomEvent('audiolad:vk-business-access', { detail: 'trial' }));
effects[1](); assert.equal(win._tmr.length, count, 'revocation blocks dispatch');
replayCleanups.forEach(fn => fn?.());
delete win._tmr; scripts.length = 0;
effects.length = 0; component(); effects.map(fn => fn()).forEach(fn => fn?.());
assert.equal(win._tmr, undefined); assert.equal(scripts.length, 0, 'next visit denied');
const privacy = readFileSync(new URL('../src/app/(platform)/privacy/page.tsx', import.meta.url), 'utf8');
assert(privacy.includes('Последнее обновление: [дата публикации]'));
assert(privacy.includes('{/* Дата ставится в день выкладки. */}'));
console.log('advertising-consent-unit: storage, choices, subscriptions, VK effects/StrictMode – passed');
