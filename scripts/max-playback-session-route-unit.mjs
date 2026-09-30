import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import {
  MAX_HOSTNAME,
  MAX_ORIGIN,
  MAX_PLAYBACK_SESSION_PATH,
} from "../src/lib/max/host.ts";
import { MAX_EXTERNAL_IDENTITY_PROVIDER } from "../src/lib/max/touch-external-identity.ts";
import { MAX_PLAYBACK_TICKET_TTL_SECONDS } from "../src/lib/max/playback-ticket.ts";
import {
  POST,
  setMaxPlaybackDepsForTests,
  setMaxPlaybackTicketNowForTests,
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
  assert.equal(ok.playbackMode, "full");
  assert.equal(ok.session.playbackMode, "full");
  assert.equal(ok.session.tracks[0].trackId, "track-1");
  assert.equal(ok.session.practiceId, undefined);
  assert.equal(typeof ok.playbackTicket, "string");
  assert.equal(ok.playbackTicketExpiresIn, MAX_PLAYBACK_TICKET_TTL_SECONDS);
  assert.match(ok.playbackTicket, /^v1\./);
  assert.equal(JSON.stringify(ok).includes(userId), false);
  assert.equal(JSON.stringify(ok).includes("browser-user"), false);
  assert.equal(JSON.stringify(ok).includes("initData"), false);
  assert.equal(JSON.stringify(ok).includes("access_token"), false);
  assert.equal(ok.playbackTicket.includes(userId), false);
  assert.equal(ok.playbackTicket.includes("providerUserId"), false);
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

  let guestUserId = "unset";
  setResolveMaxNativeUserForTests(async () => ({ ok: true, userId: null }));
  setMaxPlaybackDepsForTests({
    createClient: () => ({}),
    listCatalog: async () => [{ authorSlug: "author", slug: "product" }],
    getPractice: async () => ({
      practice: { id: "practice-1", slug: "product", status: "published", is_free: true },
      error: false,
    }),
    loadSession: async (_supabase, _author, _slug, linkedUserId) => {
      guestUserId = linkedUserId;
      sessions += 1;
      return {
        ok: true,
        session: {
          practiceTitle: "Бесплатно",
          authorName: "Анна",
          format: "Практика",
          tracks: [{ id: "track-free", title: "Трек", position: 1, durationSeconds: 40, coverImageUrl: null }],
          coverImageUrl: null,
        },
      };
    },
  });
  r = await POST(
    request({
      initData: init(),
      authorSlug: "author",
      productSlug: "product",
      user_id: "browser-user",
    }),
  );
  assert.equal(r.status, 200);
  const guestFull = await r.json();
  assert.equal(guestFull.playbackMode, "full");
  assert.equal(guestFull.session.playbackMode, "full");
  assert.equal(guestUserId, null);
  assert.equal(JSON.stringify(guestFull).includes("browser-user"), false);
  assert.equal(JSON.stringify(guestFull).includes("audio_path"), false);

  setMaxPlaybackDepsForTests({
    createClient: () => ({}),
    listCatalog: async () => [{ authorSlug: "author", slug: "product" }],
    getPractice: async () => ({ practice: { id: "practice-1" }, error: false }),
    loadSession: async (_supabase, _author, _slug, linkedUserId) => {
      assert.equal(linkedUserId, null);
      return { ok: false, reason: "unavailable" };
    },
    resolvePreview: async () => ({
      ok: true,
      track: {
        trackId: "preview-1",
        title: "Фрагмент",
        position: 1,
        durationSeconds: 30,
        coverUrl: null,
      },
      previewDurationSeconds: 30,
    }),
  });
  r = await POST(request({ initData: init(), authorSlug: "author", productSlug: "product" }));
  assert.equal(r.status, 200);
  const guestPreview = await r.json();
  assert.equal(guestPreview.playbackMode, "preview");
  assert.equal(guestPreview.session.playbackMode, "preview");
  assert.equal(guestPreview.session.tracks[0].trackId, "preview-1");

  setMaxPlaybackDepsForTests({
    createClient: () => ({}),
    listCatalog: async () => [{ authorSlug: "author", slug: "product" }],
    getPractice: async () => ({ practice: { id: "practice-1" }, error: false }),
    loadSession: async () => ({ ok: false, reason: "unavailable" }),
    resolvePreview: async () => ({ ok: false, reason: "preview_unavailable" }),
  });
  r = await POST(request({ initData: init(), authorSlug: "author", productSlug: "product" }));
  assert.equal(r.status, 403);
  assert.equal((await r.json()).reason, "preview_unavailable");

  setResolveMaxNativeUserForTests(async () => ({ ok: false, reason: "storage_unavailable" }));
  r = await POST(request({ initData: init(), authorSlug: "a", productSlug: "p" }));
  assert.equal(r.status, 503);

  setResolveMaxNativeUserForTests(async () => ({ ok: true, userId }));
  setMaxPlaybackDepsForTests({
    createClient: () => ({}),
    listCatalog: async () => [{ authorSlug: "author", slug: "product" }],
    getPractice: async () => ({ practice: { id: "practice-1" }, error: false }),
    loadSession: async () => ({ ok: false, reason: "unavailable" }),
    resolvePreview: async () => ({ ok: false, reason: "preview_unavailable" }),
  });
  r = await POST(request({ initData: init(), authorSlug: "author", productSlug: "product" }));
  assert.equal(r.status, 403);
  assert.equal((await r.json()).reason, "preview_unavailable");

  const track1 = "11111111-1111-4111-8111-111111111111";
  const track2 = "22222222-2222-4222-8222-222222222222";
  const foreignId = "33333333-3333-4333-8333-333333333333";
  let previewCalls = 0;
  setMaxPlaybackDepsForTests({
    createClient: () => ({}),
    listCatalog: async () => [{ authorSlug: "author", slug: "product" }],
    getPractice: async () => ({
      practice: {
        id: "practice-1",
        title: "Утро",
        slug: "product",
        product_kind: "practice",
        publication_class: "audio_product",
        price: 490,
        is_free: false,
        authors: { name: "Анна", slug: "author" },
      },
      error: false,
    }),
    loadSession: async () => ({ ok: false, reason: "unavailable" }),
    preview: {
      listAudioItems: async () => [
        {
          id: track1,
          title: "Первый",
          position: 1,
          duration_seconds: 180,
          audio_path: "practices/a.mp3",
          status: "published",
          is_preview: true,
          preview_start_ms: 0,
          preview_end_ms: 60_000,
        },
        {
          id: track2,
          title: "Второй",
          position: 2,
          duration_seconds: 200,
          audio_path: "practices/b.mp3",
          status: "published",
          preview_start_ms: 0,
          preview_end_ms: 45_000,
        },
      ],
      filterPlayable: async (rows) => rows,
    },
    resolvePreview: async (_practice, _client, audioItemId) => {
      previewCalls += 1;
      assert.fail(`resolver stub must not replace chooseCatalogPreviewAudioRow (${audioItemId})`);
    },
  });
  const callsBeforeInvalid = previewCalls;
  r = await POST(
    request({
      initData: init(),
      authorSlug: "author",
      productSlug: "product",
      audioItemId: "track-2",
    }),
  );
  assert.equal(r.status, 400);
  assert.equal((await r.json()).reason, "invalid_request");
  assert.equal(previewCalls, callsBeforeInvalid);
  r = await POST(
    request({
      initData: init(),
      authorSlug: "author",
      productSlug: "product",
      audioItemId: 12,
    }),
  );
  assert.equal(r.status, 400);
  assert.equal(previewCalls, callsBeforeInvalid);

  setMaxPlaybackDepsForTests({
    createClient: () => ({}),
    listCatalog: async () => [{ authorSlug: "author", slug: "product" }],
    getPractice: async () => ({
      practice: {
        id: "practice-1",
        title: "Утро",
        slug: "product",
        product_kind: "practice",
        publication_class: "audio_product",
        price: 490,
        is_free: false,
        authors: { name: "Анна", slug: "author" },
      },
      error: false,
    }),
    loadSession: async () => ({ ok: false, reason: "unavailable" }),
    preview: {
      listAudioItems: async () => [
        {
          id: track1,
          title: "Первый",
          position: 1,
          duration_seconds: 180,
          audio_path: "practices/a.mp3",
          status: "published",
          is_preview: true,
          preview_start_ms: 0,
          preview_end_ms: 60_000,
        },
        {
          id: track2,
          title: "Второй",
          position: 2,
          duration_seconds: 200,
          audio_path: "practices/b.mp3",
          status: "published",
          preview_start_ms: 0,
          preview_end_ms: 45_000,
        },
      ],
      filterPlayable: async (rows) => rows,
    },
  });
  r = await POST(request({ initData: init(), authorSlug: "author", productSlug: "product" }));
  assert.equal(r.status, 200);
  const canonical = await r.json();
  assert.equal(canonical.playbackMode, "preview");
  assert.equal(canonical.session.tracks.length, 1);
  assert.equal(canonical.session.tracks[0].trackId, track1);
  r = await POST(
    request({
      initData: init(),
      authorSlug: "author",
      productSlug: "product",
      audioItemId: track2,
    }),
  );
  assert.equal(r.status, 200);
  const selected = await r.json();
  assert.equal(selected.playbackMode, "preview");
  assert.equal(selected.session.tracks.length, 1);
  assert.equal(selected.session.tracks[0].trackId, track2);
  assert.equal(JSON.stringify(selected).includes("audio_path"), false);
  assert.equal(JSON.stringify(selected).includes(track1), false);
  r = await POST(
    request({
      initData: init(),
      authorSlug: "author",
      productSlug: "product",
      audioItemId: foreignId,
    }),
  );
  assert.equal(r.status, 403);
  assert.equal((await r.json()).reason, "preview_unavailable");
} finally {
  setResolveMaxNativeUserForTests(null);
  setMaxPlaybackDepsForTests(null);
  setMaxPlaybackTicketNowForTests(null);
}

console.log("max-playback-session-route-unit: ok");
