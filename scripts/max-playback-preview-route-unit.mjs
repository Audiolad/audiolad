import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

import {
  MAX_HOSTNAME,
  MAX_ORIGIN,
  MAX_PLAYBACK_AUDIO_PATH,
  MAX_PLAYBACK_PREVIEW_PATH,
  MAX_PLAYBACK_SESSION_PATH,
} from "../src/lib/max/host.ts";
import { MAX_EXTERNAL_IDENTITY_PROVIDER } from "../src/lib/max/touch-external-identity.ts";
import { POST as SESSION_POST } from "../src/app/api/max/playback/session/route.ts";
import { POST as AUDIO_POST } from "../src/app/api/max/playback/audio/route.ts";
import {
  POST,
  setMaxPlaybackDepsForTests,
  setMaxPlaybackTicketNowForTests,
  setResolveMaxNativeUserForTests,
} from "../src/app/api/max/playback/preview/route.ts";

const token = "test-max-bot-token-not-real-0001";
const userId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const t0 = Math.floor(Date.now() / 1000);
const clipBytes = new Uint8Array([0xff, 0xfb, 0x90, 0x00, 1, 2, 3, 4]);

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
let linked = true;
let lastClipTrackId = null;

setResolveMaxNativeUserForTests(async (provider, id) => {
  assert.equal(provider, MAX_EXTERNAL_IDENTITY_PROVIDER);
  assert.equal(id, "101");
  if (!linked) {
    return { ok: true, userId: null };
  }
  return { ok: true, userId };
});

function previewDeps() {
  return {
    createClient: () => ({}),
    listCatalog: async () => [{ authorSlug: "author", slug: "product" }],
    getPractice: async () => ({
      practice: { id: "practice-1", slug: "product", status: "published" },
      error: false,
    }),
    loadSession: async () => ({ ok: false, reason: "unavailable" }),
    resolvePreview: async () => ({
      ok: true,
      track: {
        trackId: "preview-1",
        title: "Отрывок",
        position: 1,
        durationSeconds: 45,
        coverUrl: null,
      },
      previewDurationSeconds: 45,
      window: { startMs: 0, endMs: 45_000, durationMs: 45_000, durationSeconds: 45 },
      audioItem: { id: "preview-1", audio_path: "practices/a.mp3" },
    }),
    buildPreviewClip: async ({ trackId }) => {
      lastClipTrackId = trackId;
      if (trackId !== "preview-1") {
        return { ok: false, reason: "forbidden" };
      }
      return { ok: true, bytes: clipBytes, startMs: 0, endMs: 45_000 };
    },
    signAudio: async () => ({ ok: false, reason: "access_required" }),
  };
}

setMaxPlaybackDepsForTests(previewDeps());
setMaxPlaybackTicketNowForTests(t0);

async function mintPreviewTicket() {
  const response = await SESSION_POST(
    request(MAX_PLAYBACK_SESSION_PATH, {
      initData: init(t0),
      authorSlug: "author",
      productSlug: "product",
    }),
  );
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.playbackMode, "preview");
  assert.equal(payload.previewDurationSeconds, 45);
  assert.equal(payload.session.tracks.length, 1);
  assert.equal(payload.session.tracks[0].trackId, "preview-1");
  assert.equal(typeof payload.playbackTicket, "string");
  return payload.playbackTicket;
}

try {
  const ticket = await mintPreviewTicket();

  let r = await POST(
    request(MAX_PLAYBACK_PREVIEW_PATH, {
      playbackTicket: ticket,
      trackId: "preview-1",
    }),
  );
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("content-type"), "audio/mpeg");
  assert.equal(r.headers.get("cache-control"), "no-store");
  assert.equal(lastClipTrackId, "preview-1");
  const bytes = new Uint8Array(await r.arrayBuffer());
  assert.deepEqual([...bytes], [...clipBytes]);
  const text = new TextDecoder().decode(bytes);
  assert.equal(text.includes("https://"), false);
  assert.equal(text.includes("signed"), false);
  assert.equal(text.includes("practice-audio"), false);
  assert.equal(text.includes("music-streams"), false);
  assert.equal(text.includes("audio_path"), false);

  r = await AUDIO_POST(
    request(MAX_PLAYBACK_AUDIO_PATH, {
      playbackTicket: ticket,
      trackId: "preview-1",
    }),
  );
  assert.equal(r.status, 403);
  assert.equal((await r.json()).reason, "access_required");

  r = await POST(request(MAX_PLAYBACK_PREVIEW_PATH, { playbackTicket: ticket, trackId: "other-track" }));
  assert.equal(r.status, 403);
  assert.equal((await r.json()).reason, "forbidden");

  linked = false;
  r = await POST(request(MAX_PLAYBACK_PREVIEW_PATH, { playbackTicket: ticket, trackId: "preview-1" }));
  assert.equal(r.status, 403);
  assert.equal((await r.json()).reason, "unlinked");
  linked = true;

  const [version, iv, ciphertext, tag] = ticket.split(".");
  const tamper = (part) => {
    const buf = Buffer.from(part, "base64url");
    buf[0] ^= 0xff;
    return buf.toString("base64url");
  };
  r = await POST(
    request(MAX_PLAYBACK_PREVIEW_PATH, {
      playbackTicket: `${version}.${iv}.${tamper(ciphertext)}.${tag}`,
      trackId: "preview-1",
    }),
  );
  assert.equal(r.status, 401);
  r = await POST(
    request(MAX_PLAYBACK_PREVIEW_PATH, {
      playbackTicket: `${version}.${iv}.${ciphertext}.${tamper(tag)}`,
      trackId: "preview-1",
    }),
  );
  assert.equal(r.status, 401);
  r = await POST(request(MAX_PLAYBACK_PREVIEW_PATH, { playbackTicket: "not-a-ticket", trackId: "preview-1" }));
  assert.equal(r.status, 400);

  setMaxPlaybackTicketNowForTests(t0 + 21600);
  r = await POST(request(MAX_PLAYBACK_PREVIEW_PATH, { playbackTicket: ticket, trackId: "preview-1" }));
  assert.equal(r.status, 401);
  assert.equal((await r.json()).reason, "playback_expired");
  assert.equal(r.headers.get("cache-control"), "no-store");
  setMaxPlaybackTicketNowForTests(t0);

  setMaxPlaybackDepsForTests({
    ...previewDeps(),
    buildPreviewClip: async ({ trackId }) => {
      assert.equal(trackId, "preview-1");
      return {
        ok: true,
        bytes: clipBytes,
        startMs: 0,
        endMs: 60_000,
        url: "https://cdn.example/music-streams/full.mp3",
        audio_path: "streams/full.mp3",
      };
    },
  });
  r = await POST(request(MAX_PLAYBACK_PREVIEW_PATH, { playbackTicket: ticket, trackId: "preview-1" }));
  assert.equal(r.status, 200);
  const musicBody = new TextDecoder().decode(await r.arrayBuffer());
  assert.equal(musicBody.includes("https://cdn.example"), false);
  assert.equal(musicBody.includes("music-streams"), false);
  assert.equal(r.headers.get("content-type"), "audio/mpeg");
} finally {
  setResolveMaxNativeUserForTests(null);
  setMaxPlaybackDepsForTests(null);
  setMaxPlaybackTicketNowForTests(null);
}

console.log("max-playback-preview-route-unit: ok");
