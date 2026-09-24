import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import {
  MAX_HOSTNAME,
  MAX_ORIGIN,
  MAX_PLAYBACK_AUDIO_PATH,
  MAX_PLAYBACK_SESSION_PATH,
} from "../src/lib/max/host.ts";
import { MAX_EXTERNAL_IDENTITY_PROVIDER } from "../src/lib/max/touch-external-identity.ts";
import { verifyMaxInitData } from "../src/lib/max/verify-init-data.ts";
import { POST as SESSION_POST, setMaxPlaybackTicketNowForTests } from "../src/app/api/max/playback/session/route.ts";
import {
  POST,
  setMaxPlaybackDepsForTests,
  setResolveMaxNativeUserForTests,
} from "../src/app/api/max/playback/audio/route.ts";

const token = "test-max-bot-token-not-real-0001";
const userId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const t0 = Math.floor(Date.now() / 1000);

function init(authDate = t0) {
  const fields = { auth_date: String(authDate), user: '{"id":101}' };
  const data = Object.entries(fields)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
  const key = createHmac("sha256", "WebAppData").update(token).digest();
  const hash = createHmac("sha256", key).update(data).digest("hex");
  return `${Object.entries(fields)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join("&")}&hash=${hash}`;
}

function request(path, body, headers = {}) {
  return new Request(`${MAX_ORIGIN}${path}`, {
    method: "POST",
    headers: {
      host: MAX_HOSTNAME,
      origin: MAX_ORIGIN,
      "sec-fetch-site": "same-origin",
      "content-type": "application/json",
      ...headers,
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

process.env.MAX_BOT_TOKEN = token;
let signs = 0;
let linked = true;
let entitled = true;
let lastSignInput = null;

setResolveMaxNativeUserForTests(async (provider, id) => {
  assert.equal(provider, MAX_EXTERNAL_IDENTITY_PROVIDER);
  assert.equal(id, "101");
  if (!linked) {
    return { ok: true, userId: null };
  }
  return { ok: true, userId };
});

function playbackDeps() {
  return {
    createClient: () => ({}),
    listCatalog: async () => [{ authorSlug: "author", slug: "product" }],
    getPractice: async () => ({ practice: { id: "practice-1" }, error: false }),
    loadSession: async () => ({
      ok: true,
      session: {
        practiceTitle: "Утро",
        authorName: "Анна",
        format: "Практика",
        tracks: [{ id: "track-1", title: "Трек", position: 1, durationSeconds: 65, coverImageUrl: null }],
        coverImageUrl: null,
      },
    }),
    signAudio: async (input) => {
      lastSignInput = input;
      if (!entitled) {
        return { ok: false, reason: "access_required" };
      }
      signs += 1;
      assert.equal(input.userId, userId);
      return { ok: true, url: "https://cdn.example/audio?token=abc", expiresIn: 3600 };
    },
  };
}

setMaxPlaybackDepsForTests(playbackDeps());
setMaxPlaybackTicketNowForTests(t0);

async function mintTicket() {
  const response = await SESSION_POST(
    request(MAX_PLAYBACK_SESSION_PATH, {
      initData: init(t0),
      authorSlug: "author",
      productSlug: "product",
    }),
  );
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(typeof payload.playbackTicket, "string");
  return payload.playbackTicket;
}

try {
  const ticket = await mintTicket();
  const initData = init(t0);

  let r = await POST(
    request(MAX_PLAYBACK_AUDIO_PATH, {
      playbackTicket: ticket,
      trackId: "track-1",
      initData,
      authorSlug: "other-author",
      productSlug: "other-product",
      user_id: "browser-user",
      max_user_id: "999",
    }),
  );
  assert.equal(r.status, 200);
  const ok = await r.json();
  assert.equal(ok.url, "https://cdn.example/audio?token=abc");
  assert.equal(ok.expiresIn, 3600);
  assert.equal(ok.audio_path, undefined);
  assert.equal(JSON.stringify(ok).includes(userId), false);
  assert.equal(JSON.stringify(ok).includes("initData"), false);
  assert.equal(r.headers.get("cache-control"), "no-store");
  assert.equal(lastSignInput.authorSlug, "author");
  assert.equal(lastSignInput.productSlug, "product");
  assert.equal(lastSignInput.audioId, "track-1");

  const before = signs;
  setMaxPlaybackTicketNowForTests(t0 + 3700);
  const expiredInit = verifyMaxInitData(initData, token, { nowSeconds: t0 + 3700 });
  assert.equal(expiredInit.ok, false);
  assert.equal(expiredInit.reason, "expired");
  r = await POST(request(MAX_PLAYBACK_AUDIO_PATH, { playbackTicket: ticket, trackId: "track-1" }));
  assert.equal(r.status, 200);
  assert.equal(signs, before + 1);

  const [version, iv, ciphertext, tag] = ticket.split(".");
  const tamper = (part) => {
    const buf = Buffer.from(part, "base64url");
    buf[0] ^= 0xff;
    return buf.toString("base64url");
  };
  r = await POST(request(MAX_PLAYBACK_AUDIO_PATH, { playbackTicket: `${version}.${iv}.${tamper(ciphertext)}.${tag}`, trackId: "track-1" }));
  assert.equal(r.status, 401);
  r = await POST(request(MAX_PLAYBACK_AUDIO_PATH, { playbackTicket: `${version}.${iv}.${ciphertext}.${tamper(tag)}`, trackId: "track-1" }));
  assert.equal(r.status, 401);
  r = await POST(request(MAX_PLAYBACK_AUDIO_PATH, { playbackTicket: `v2.${iv}.${ciphertext}.${tag}`, trackId: "track-1" }));
  assert.equal(r.status, 401);
  setMaxPlaybackTicketNowForTests(t0 + 21600);
  r = await POST(request(MAX_PLAYBACK_AUDIO_PATH, { playbackTicket: ticket, trackId: "track-1" }));
  assert.equal(r.status, 401);
  assert.equal((await r.json()).reason, "playback_expired");
  assert.equal(r.headers.get("cache-control"), "no-store");

  setMaxPlaybackTicketNowForTests(t0);
  const scopedTicket = await mintTicket();
  r = await POST(
    request(MAX_PLAYBACK_AUDIO_PATH, {
      playbackTicket: scopedTicket,
      trackId: "track-1",
      authorSlug: "intruder",
      productSlug: "other",
    }),
  );
  assert.equal(r.status, 200);
  assert.equal(lastSignInput.authorSlug, "author");
  assert.equal(lastSignInput.productSlug, "product");

  linked = false;
  r = await POST(request(MAX_PLAYBACK_AUDIO_PATH, { playbackTicket: scopedTicket, trackId: "track-1" }));
  assert.equal(r.status, 403);
  assert.equal((await r.json()).reason, "unlinked");
  linked = true;

  entitled = false;
  r = await POST(request(MAX_PLAYBACK_AUDIO_PATH, { playbackTicket: scopedTicket, trackId: "track-1" }));
  assert.equal(r.status, 403);
  assert.equal((await r.json()).reason, "access_required");
  entitled = true;

  setMaxPlaybackDepsForTests({
    ...playbackDeps(),
    signAudio: async () => ({ ok: false, reason: "not_found" }),
  });
  r = await POST(request(MAX_PLAYBACK_AUDIO_PATH, { playbackTicket: scopedTicket, trackId: "other" }));
  assert.equal(r.status, 404);

  setMaxPlaybackDepsForTests({
    ...playbackDeps(),
    signAudio: async () => ({ ok: false, reason: "forbidden" }),
  });
  r = await POST(request(MAX_PLAYBACK_AUDIO_PATH, { playbackTicket: scopedTicket, trackId: "hidden" }));
  assert.equal(r.status, 403);

  for (const body of ["null", "[]", '"x"', "1", { trackId: "t" }, { playbackTicket: "" }]) {
    r = await POST(request(MAX_PLAYBACK_AUDIO_PATH, body));
    assert.equal(r.status, 400);
  }
  r = await POST(
    request(MAX_PLAYBACK_AUDIO_PATH, { playbackTicket: scopedTicket, trackId: "t" }, { "content-length": "20000" }),
  );
  assert.equal(r.status, 413);
} finally {
  setResolveMaxNativeUserForTests(null);
  setMaxPlaybackDepsForTests(null);
  setMaxPlaybackTicketNowForTests(null);
}

console.log("max-playback-audio-route-unit: ok");
