import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createVkAdsTracker, vkRoute, vkPixelId, vkDestinationGoal } from '../src/lib/analytics/vk-ads.mjs';

let consent = false;
const scripts = [];
const win = { location: new URL('https://audiolad.ru/b/atlas-kofeen?email=private#token') };
const doc = {
  getElementById: () => scripts[0], querySelector: () => null,
  createElement: () => ({}), head: { appendChild: (script) => scripts.push(script) },
};
const tracker = createVkAdsTracker({ pixelId: '12345', allowed: () => consent, win, doc });
tracker.page(); tracker.goal('gift_interest'); tracker.access('paid');
assert.equal(win._tmr, undefined, 'no queue or SDK before advertising consent');
assert.equal(scripts.length, 0);
consent = true;
tracker.page(); tracker.page();
assert.equal(scripts.length, 1);
assert.equal(win._tmr.filter(e => e.type === 'pageView').length, 1, 'initial/remount dedupe');
assert.equal(win._tmr[0].url, 'https://audiolad.ru/b/atlas-kofeen');
assert.equal(win._tmr[0].referrer, '');
win.location = new URL('https://audiolad.ru/b/atlas-kofeen/caffe-florian?phone=secret');
tracker.page(); tracker.page();
assert.equal(win._tmr.filter(e => e.goal === 'atlas_page').length, 1);
win.location = new URL('https://audiolad.ru/b/atlas-kofeen'); tracker.page();
assert.equal(win._tmr.filter(e => e.type === 'pageView').length, 3, 'back navigation counts');
tracker.access('trial'); tracker.access('trial'); tracker.access('paid'); tracker.access('paid');
assert.equal(win._tmr.filter(e => e.goal === 'gift_started').length, 1);
assert.equal(win._tmr.filter(e => e.goal === 'subscription_active').length, 1);
assert.equal(win._tmr.filter(e => e.goal === 'payment_success').length, 0, 'paid status is not a new payment');
assert.equal(tracker.goal('email_private'), false);
const count = win._tmr.length;
consent = false; tracker.page(); tracker.goal('gift_interest');
assert.equal(win._tmr.length, count, 'revocation blocks app dispatches');
consent = true;
win.location = new URL('https://audiolad.ru/auth/reset-password?token=secret');
tracker.page(); tracker.goal('gift_interest');
assert.equal(win._tmr.length, count, 'credentials routes excluded');
assert.equal(vkPixelId('123abc'), null); assert.equal(vkPixelId(undefined), null);
assert.equal(vkPixelId('12345'), '12345');
assert.equal(vkRoute('evil.example', '/music'), null);
assert.equal(vkRoute('coffee.audiolad.ru', '/business-app/music').group, 'coffee_music');
assert.equal(vkDestinationGoal('https://max-potok.ru/r/gqwvf?ch=tg', win.location.origin), 'go_to_funnel');
assert.equal(vkDestinationGoal('https://evil.example/music', win.location.origin), null);
assert.equal(vkDestinationGoal('https://coffee.audiolad.ru/music?email=secret', win.location.origin), 'go_to_music');
assert.equal(vkDestinationGoal('https://coffee.audiolad.ru/', win.location.origin), 'go_to_cabinet');
assert(!JSON.stringify(win._tmr).includes('private'));
assert(!JSON.stringify(win._tmr).includes('secret'));
assert(!JSON.stringify(win._tmr).includes('token'));
for (const state of [true, false]) {
  const noId = createVkAdsTracker({ pixelId: null, allowed: () => state, win, doc });
  noId.page(); assert.equal(noId.goal('gift_interest'), false);
}
assert.equal(scripts.length, 1);
const shops = [...readFileSync(new URL('../src/lib/business/coffee-atlas/shops.ts', import.meta.url), 'utf8').matchAll(/slug: "([a-z0-9-]+)"/g)].map(match => match[1]);
assert.equal(shops.length, 10);
for (const slug of shops) assert.equal(vkRoute('audiolad.ru', `/b/atlas-kofeen/${slug}`).group, 'atlas_page');
for (const path of ['/auth/sign-in', '/auth/recovery', '/profile', '/embed/test', '/vk']) assert.equal(vkRoute('audiolad.ru', path), null);
for (const path of ['/point', '/player', '/profile', '/documents', '/locations/private-id']) assert.equal(vkRoute('coffee.audiolad.ru', path), null);
console.log('VK Ads: consent, routes, SPA dedupe, goals, exclusions, no PII – passed');
