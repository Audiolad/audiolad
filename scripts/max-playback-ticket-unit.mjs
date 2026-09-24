import assert from "node:assert/strict";

import {
  MAX_PLAYBACK_TICKET_TTL_SECONDS,
  mintMaxPlaybackTicket,
  setMaxPlaybackTicketNowForTests,
  verifyMaxPlaybackTicket,
} from "../src/lib/max/playback-ticket.ts";

const token = "test-max-bot-token-not-real-0001";
process.env.MAX_BOT_TOKEN = token;

const t0 = 1_700_000_000;
setMaxPlaybackTicketNowForTests(t0);

try {
  const minted = mintMaxPlaybackTicket({
    providerUserId: "max-user-778899",
    authorSlug: "author",
    productSlug: "product",
  });
  assert.equal(minted.expiresIn, MAX_PLAYBACK_TICKET_TTL_SECONDS);
  assert.equal(MAX_PLAYBACK_TICKET_TTL_SECONDS, 21600);
  assert.match(minted.token, /^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  assert.equal(minted.token.includes("max-user-778899"), false);
  assert.equal(minted.token.includes("providerUserId"), false);
  assert.equal(minted.token.includes("authorSlug"), false);
  assert.equal(minted.token.includes("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"), false);

  for (const part of minted.token.split(".").slice(1)) {
    const decoded = Buffer.from(part, "base64url").toString("utf8");
    assert.equal(decoded.includes("max-user-778899"), false);
    assert.equal(decoded.includes("providerUserId"), false);
  }

  const valid = verifyMaxPlaybackTicket(minted.token, { nowSeconds: t0 + 3700 });
  assert.equal(valid.ok, true);
  assert.equal(valid.claims.providerUserId, "max-user-778899");
  assert.equal(valid.claims.authorSlug, "author");
  assert.equal(valid.claims.productSlug, "product");

  const expired = verifyMaxPlaybackTicket(minted.token, { nowSeconds: t0 + 21600 });
  assert.deepEqual(expired, { ok: false, reason: "expired" });

  const [version, iv, ciphertext, tag] = minted.token.split(".");
  const tamper = (part) => {
    const buf = Buffer.from(part, "base64url");
    buf[0] ^= 0xff;
    return buf.toString("base64url");
  };
  assert.deepEqual(verifyMaxPlaybackTicket(`v2.${iv}.${ciphertext}.${tag}`), {
    ok: false,
    reason: "wrong_version",
  });
  assert.equal(verifyMaxPlaybackTicket(`${version}.${iv}.${tamper(ciphertext)}.${tag}`).reason, "tampered");
  assert.equal(verifyMaxPlaybackTicket(`${version}.${iv}.${ciphertext}.${tamper(tag)}`).reason, "tampered");
  assert.deepEqual(verifyMaxPlaybackTicket("not-a-ticket"), { ok: false, reason: "malformed" });
  assert.deepEqual(verifyMaxPlaybackTicket(""), { ok: false, reason: "malformed" });
} finally {
  setMaxPlaybackTicketNowForTests(null);
}

console.log("max-playback-ticket-unit: ok");
