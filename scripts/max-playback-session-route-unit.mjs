import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import {
  MAX_HOSTNAME,
  MAX_ORIGIN,
  MAX_PLAYBACK_SESSION_PATH,
} from "../src/lib/max/host.ts";
import { MAX_EXTERNAL_IDENTITY_PROVIDER } from "../src/lib/max/touch-external-identity.ts";
import {
  POST,
  setMaxPlaybackDepsForTests,
  setResolveMaxNativeUserForTests,
} from "../src/app/api/max/playback/session/route.ts";

const token = "test-max-bot-token-not-real-0001";
const userId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function init(extra = {}) {
  const fields = { auth_date: String(Math.floor(Date.now() / 1000)), user: '{"id":101}', ...extra };
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
  return new Request(`${MAX_ORIGIN}${MAX_PLAYBACK_SESSION_PATH}`, {
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
let sessions = 0;

setResolveMaxNativeUserForTests(async (provider, id) => {
  assert.equal(provider, MAX_EXTERNAL_IDENTITY_PROVIDER);
  assert.equal(id, "101");
  return { ok: true, userId };
});
setMaxPlaybackDepsForTests({
  createClient: () => ({}),
  listCatalog: async () => [{ authorSlug: "author", slug: "product" }],
  getPractice: async () => ({
    practice: { id: "practice-1", slug: "product", status: "published" },
    error: false,
  }),
  loadSession: async (_supabase, _author, _slug, linkedUserId) => {
    sessions += 1;
    assert.equal(linkedUserId, userId);
    return {
      ok: true,
      session: {
        practiceTitle: "Утро",
        authorName: "Анна",
        format: "Практика",
        tracks: [{ id: "track-1", title: "Трек", position: 1, durationSeconds: 65, coverImageUrl: null }],
        coverImageUrl: null,
      },
    };
  },
});

try {
  let r = await POST(
    request({
      initData: init(),
      authorSlug: "author",
      productSlug: "product",
      user_id: "browser-user",
      max_user_id: "999",
      maxAuthenticated: true,
      canListen: true,
    }),
  );
  assert.equal(r.status, 200);
  const ok = await r.json();
  assert.equal(ok.ok, true);
  assert.equal(ok.session.tracks[0].trackId, "track-1");
  assert.equal(ok.session.practiceId, undefined);
  assert.equal(JSON.stringify(ok).includes(userId), false);
  assert.equal(JSON.stringify(ok).includes("browser-user"), false);
  assert.equal(JSON.stringify(ok).includes("initData"), false);
  assert.equal(JSON.stringify(ok).includes("access_token"), false);
  assert.equal(r.headers.get("cache-control"), "no-store");

  const before = sessions;
  r = await POST(request({ initData: init().replace(/hash=.*/, "hash=ff"), authorSlug: "a", productSlug: "p" }));
  assert.equal(r.status, 401);
  assert.equal(sessions, before);

  const expired = init({ auth_date: String(Math.floor(Date.now() / 1000) - 60 * 60 * 24 * 3) });
  r = await POST(request({ initData: expired, authorSlug: "a", productSlug: "p" }));
  assert.equal(r.status, 401);
  assert.equal(sessions, before);

  for (const body of ["null", "[]", '"x"', "1", "{"]) {
    r = await POST(request(body));
    assert.equal(r.status, 400);
  }
  r = await POST(request({ initData: init(), authorSlug: "a", productSlug: "p" }, { "content-length": "20000" }));
  assert.equal(r.status, 413);

  setResolveMaxNativeUserForTests(async () => ({ ok: true, userId: null }));
  r = await POST(request({ initData: init(), authorSlug: "a", productSlug: "p" }));
  assert.equal(r.status, 403);

  setResolveMaxNativeUserForTests(async () => ({ ok: false, reason: "storage_unavailable" }));
  r = await POST(request({ initData: init(), authorSlug: "a", productSlug: "p" }));
  assert.equal(r.status, 503);

  setResolveMaxNativeUserForTests(async () => ({ ok: true, userId }));
  setMaxPlaybackDepsForTests({
    createClient: () => ({}),
    listCatalog: async () => [{ authorSlug: "author", slug: "product" }],
    getPractice: async () => ({ practice: { id: "practice-1" }, error: false }),
    loadSession: async () => ({ ok: false, reason: "unavailable" }),
  });
  r = await POST(request({ initData: init(), authorSlug: "author", productSlug: "product" }));
  assert.equal(r.status, 403);
  assert.equal((await r.json()).reason, "access_required");
} finally {
  setResolveMaxNativeUserForTests(null);
  setMaxPlaybackDepsForTests(null);
}

console.log("max-playback-session-route-unit: ok");
