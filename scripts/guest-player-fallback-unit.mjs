#!/usr/bin/env node
import assert from "node:assert/strict";
import {
  GUEST_PLAYER_FALLBACK_REGISTERED_EVENT,
  pickGuestDefaultListenTarget,
  peekGuestPlayerFallbackTarget,
  registerGuestPlayerFallbackTarget,
} from "../src/lib/listen/guest-player-fallback.ts";

const events = [];

globalThis.window = {
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

registerGuestPlayerFallbackTarget(null);
assert.equal(peekGuestPlayerFallbackTarget(), null);
assert.equal(events.length, 0);

registerGuestPlayerFallbackTarget({
  authorSlug: "author-a",
  productSlug: "product-a",
});
assert.deepEqual(peekGuestPlayerFallbackTarget(), {
  authorSlug: "author-a",
  productSlug: "product-a",
});
assert.deepEqual(events, [GUEST_PLAYER_FALLBACK_REGISTERED_EVENT]);

registerGuestPlayerFallbackTarget({
  authorSlug: "author-a",
  productSlug: "product-a",
});
assert.equal(events.length, 1, "duplicate target does not re-emit");

registerGuestPlayerFallbackTarget(null);
assert.equal(peekGuestPlayerFallbackTarget(), null);
assert.equal(events.length, 1, "clearing target does not emit");

registerGuestPlayerFallbackTarget({
  authorSlug: "author-b",
  productSlug: "product-b",
});
assert.equal(events.at(-1), GUEST_PLAYER_FALLBACK_REGISTERED_EVENT);

const picked = pickGuestDefaultListenTarget({
  featuredFreeProduct: {
    authorSlug: "  featured-author ",
    slug: " featured-product ",
  },
  freeProducts: [
    {
      authorSlug: "fallback-author",
      slug: "fallback-product",
    },
  ],
});
assert.deepEqual(picked, {
  authorSlug: "featured-author",
  productSlug: "featured-product",
});

const fromRail = pickGuestDefaultListenTarget({
  featuredFreeProduct: null,
  freeProducts: [
    {
      authorSlug: null,
      slug: "invalid",
    },
    {
      authorSlug: "rail-author",
      slug: "rail-product",
    },
  ],
});
assert.deepEqual(fromRail, {
  authorSlug: "rail-author",
  productSlug: "rail-product",
});

assert.equal(
  pickGuestDefaultListenTarget({
    featuredFreeProduct: null,
    freeProducts: [],
  }),
  null,
);

console.log("guest-player-fallback-unit: ok");
