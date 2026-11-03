import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createVkAdsTracker, vkRoute, vkPixelId, vkDestinationGoal, vkBusinessReloadRoute, vkSdkInDocument } from '../src/lib/analytics/vk-ads.mjs';

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
assert.equal(win._tmr.filter(e => e.goal === 'atlas_coffee_page').length, 1);
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
for (const slug of shops) assert.equal(vkRoute('audiolad.ru', `/b/atlas-kofeen/${slug}`).group, 'atlas_coffee_page');
for (const path of ['/auth/sign-in', '/auth/recovery', '/profile', '/embed/test', '/vk']) assert.equal(vkRoute('audiolad.ru', path), null);
for (const path of ['/point', '/player', '/profile', '/documents', '/locations/private-id']) assert.equal(vkRoute('coffee.audiolad.ru', path), null);
console.log('VK Ads: consent, routes, SPA dedupe, goals, exclusions, no PII – passed');
for (const hostname of ['audiolad.ru', 'www.audiolad.ru', 'coffee.audiolad.ru', 'business.audiolad.ru']) {
  for (const prefix of ['', '/business-app']) {
    for (const route of ['/documents', '/point', '/player', '/coffee-handoff']) {
      for (const suffix of ['', '/', '/private-token']) {
        const pathname = `${prefix}${route}${suffix}`;
        assert.equal(vkRoute(hostname, pathname), null, `${hostname}${pathname}`);
        const blockedWin = { location: new URL(`https://${hostname}${pathname}`) };
        const blocked = createVkAdsTracker({ pixelId: '3811226', allowed: () => true, win: blockedWin, doc: {
          createElement: () => assert.fail('excluded route loaded SDK'),
        } });
        blocked.page(); blocked.goal('gift_interest'); blocked.access('paid');
        assert.equal(blockedWin._tmr, undefined, 'excluded route never queues');
      }
    }
  }
}
for (const state of ['unknown', 'denied', 'granted']) {
  const freshWin = { location: new URL('https://coffee.audiolad.ru/music') };
  const freshScripts = [];
  const freshDoc = {
    getElementById: () => freshScripts[0], querySelector: () => null,
    createElement: () => ({}), head: { appendChild: script => freshScripts.push(script) },
  };
  let choice = state;
  const fresh = createVkAdsTracker({ pixelId: '3811226', allowed: () => choice === 'granted', win: freshWin, doc: freshDoc });
  fresh.page(); fresh.goal('gift_interest');
  assert.equal(freshScripts.length, state === 'granted' ? 1 : 0);
  assert.equal(Boolean(freshWin._tmr), state === 'granted');
  const before = freshWin._tmr?.length;
  choice = 'denied'; fresh.page(); fresh.goal('gift_interest'); fresh.access('paid');
  assert.equal(freshWin._tmr?.length, before);
}
// Allowed -> excluded SPA navigation on business hosts must reload a document that has the SDK.
for (const host of ['coffee.audiolad.ru', 'business.audiolad.ru']) {
  for (const route of ['/documents', '/point/x', '/player', '/coffee-handoff', '/business-app/documents']) {
    assert.equal(vkBusinessReloadRoute(host, route), true, `${host}${route} reload boundary`);
  }
  for (const route of ['/', '/music', '/cabinet', '/workspace']) assert.equal(vkBusinessReloadRoute(host, route), false);
}
assert.equal(vkBusinessReloadRoute('127.0.0.1', '/business-app/point'), true);
// Platform player keeps playback: no reload there (vkRoute already sends nothing on /player).
assert.equal(vkBusinessReloadRoute('audiolad.ru', '/player'), false);
assert.equal(vkRoute('audiolad.ru', '/player'), null);
assert.equal(vkSdkInDocument({ getElementById: () => null, querySelector: () => null }), false);
assert.equal(vkSdkInDocument({ getElementById: (id) => (id === 'audiolad-vk-ads' ? {} : null), querySelector: () => null }), true);
const boundary = readFileSync(new URL('../src/components/analytics/VkAdsPixel.tsx', import.meta.url), 'utf8');
assert.match(boundary, /vkBusinessReloadRoute\([\s\S]*vkSdkInDocument\(document\)\) window\.location\.reload\(\)/, 'VkAdsPixel reloads on business excluded routes');
console.log('VK Ads: all sensitive route prefixes and explicit consent states – passed');
