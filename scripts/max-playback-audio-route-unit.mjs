import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import {
  MAX_HOSTNAME,
  MAX_ORIGIN,
  MAX_PLAYBACK_AUDIO_PATH,
} from "../src/lib/max/host.ts";
import { MAX_EXTERNAL_IDENTITY_PROVIDER } from "../src/lib/max/touch-external-identity.ts";
import {
  POST,
  setMaxPlaybackDepsForTests,
  setResolveMaxNativeUserForTests,
} from "../src/app/api/max/playback/audio/route.ts";

const token = "test-max-bot-token-not-real-0001";
const userId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function init() {
  const fields = { auth_date: String(Math.floor(Date.now() / 1000)), user: '{"id":101}' };
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

function request(body, headers = {}) {
  return new Request(`${MAX_ORIGIN}${MAX_PLAYBACK_AUDIO_PATH}`, {
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

setResolveMaxNativeUserForTests(async (provider, id) => {
  assert.equal(provider, MAX_EXTERNAL_IDENTITY_PROVIDER);
  assert.equal(id, "101");
  return { ok: true, userId };
});
setMaxPlaybackDepsForTests({
  createClient: () => ({}),
  listCatalog: async () => [{ authorSlug: "author", slug: "product" }],
  getPractice: async () => ({ practice: { id: "practice-1" }, error: false }),
  signAudio: async (input) => {
    signs += 1;
    assert.equal(input.userId, userId);
    assert.equal(input.audioId, "track-1");
    return { ok: true, url: "https://cdn.example/audio?token=abc", expiresIn: 3600 };
  },
});

try {
  let r = await POST(
    request({
      initData: init(),
      authorSlug: "author",
      productSlug: "product",
      trackId: "track-1",
      user_id: "browser-user",
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

  const before = signs;
  r = await POST(
    request({ initData: init().replace(/hash=.*/, "hash=ff"), authorSlug: "a", productSlug: "p", trackId: "t" }),
  );
  assert.equal(r.status, 401);
  assert.equal(signs, before);

  setMaxPlaybackDepsForTests({
    createClient: () => ({}),
    listCatalog: async () => [{ authorSlug: "author", slug: "product" }],
    getPractice: async () => ({ practice: { id: "practice-1" }, error: false }),
    signAudio: async () => ({ ok: false, reason: "not_found" }),
  });
  r = await POST(request({ initData: init(), authorSlug: "author", productSlug: "product", trackId: "other" }));
  assert.equal(r.status, 404);

  setMaxPlaybackDepsForTests({
    createClient: () => ({}),
    listCatalog: async () => [{ authorSlug: "author", slug: "product" }],
    getPractice: async () => ({ practice: { id: "practice-1" }, error: false }),
    signAudio: async () => ({ ok: false, reason: "forbidden" }),
  });
  r = await POST(request({ initData: init(), authorSlug: "author", productSlug: "product", trackId: "hidden" }));
  assert.equal(r.status, 403);

  for (const body of ["null", "[]", '"x"', "1"]) {
    r = await POST(request(body));
    assert.equal(r.status, 400);
  }
  r = await POST(
    request({ initData: init(), authorSlug: "a", productSlug: "p", trackId: "t" }, { "content-length": "20000" }),
  );
  assert.equal(r.status, 413);
} finally {
  setResolveMaxNativeUserForTests(null);
  setMaxPlaybackDepsForTests(null);
}

console.log("max-playback-audio-route-unit: ok");
