#!/usr/bin/env node
/**
 * MAX playlist catalog and detail routes: host, origin, HMAC, safe DTO.
 */
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

import {
  MAX_HOSTNAME,
  MAX_ORIGIN,
  MAX_PLAYLISTS_CATALOG_PATH,
  MAX_PLAYLISTS_DETAIL_PATH,
} from "../src/lib/max/host.ts";
import { MAX_EXTERNAL_IDENTITY_PROVIDER } from "../src/lib/max/touch-external-identity.ts";
import { parsePlaylistListingQuery, toPlaylistListingItem } from "../src/lib/playlists/listing-contract.ts";
import {
  POST as postCatalog,
  setListMaxPublicPlaylistsForTests,
  setResolveMaxNativeUserForTests,
} from "../src/app/api/max/playlists/catalog/route.ts";
import {
  POST as postDetail,
  setLoadMaxPublicPlaylistForTests,
} from "../src/app/api/max/playlists/detail/route.ts";

const token = "test-max-bot-token-not-real-0001";
const linkedUserId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function signInitData(fields, botToken = token) {
  const entries = Object.entries(fields).filter(([key]) => key !== "hash");
  entries.sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
  const launchParams = entries.map(([key, value]) => `${key}=${value}`).join("\n");
  const secretKey = createHmac("sha256", "WebAppData").update(botToken).digest();
  const hash = createHmac("sha256", secretKey).update(launchParams).digest("hex");
  return `${entries.map(([key, value]) => `${key}=${encodeURIComponent(value)}`).join("&")}&hash=${hash}`;
}

function currentInitData(extra = {}) {
  return signInitData({
    auth_date: String(Math.floor(Date.now() / 1000)),
    query_id: "max-playlists-test",
    user: '{"id":101,"first_name":"Playlists"}',
    ...extra,
  });
}

function maxRequest(pathname, body, { host = MAX_HOSTNAME, headers = {} } = {}) {
  return new Request(`${MAX_ORIGIN}${pathname}`, {
    method: "POST",
    headers: {
      host,
      origin: MAX_ORIGIN,
      "sec-fetch-site": "same-origin",
      "content-type": "application/json",
      ...headers,
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

async function readJson(response) {
  return { status: response.status, body: await response.json() };
}

const previousToken = process.env.MAX_BOT_TOKEN;
process.env.MAX_BOT_TOKEN = token;

const catalogCalls = [];
let linked = false;

setResolveMaxNativeUserForTests(async (provider, providerUserId) => {
  assert.equal(provider, MAX_EXTERNAL_IDENTITY_PROVIDER);
  assert.equal(providerUserId, "101");
  return { ok: true, userId: linked ? linkedUserId : null };
});

setListMaxPublicPlaylistsForTests(async (query, userId) => {
  catalogCalls.push({ query, userId });
  return {
    items: [
      {
        ...toPlaylistListingItem({
          source: {
            id: "internal-playlist-id",
            slug: "morning-set",
            title: "Утро",
            coverUrl: "https://cdn.example.test/cover.webp",
            items_count: 3,
            duration_seconds: 180,
            saves_count: 9,
          },
          creator: "Плейлист АудиоЛада",
          topics: ["sleep"],
          access: "free",
          viewer: { saved: true, playing: true },
        }),
        user_id: linkedUserId,
        cover_path: "secret/cover.webp",
      },
    ],
    nextCursor: "cursor-next",
  };
});

const detailCalls = [];
setLoadMaxPublicPlaylistForTests(async (slug) => {
  detailCalls.push(slug);
  if (slug === "missing-set") {
    return { ok: false, reason: "not_found" };
  }

  return {
    ok: true,
    detail: {
      playlist: {
        title: "Утро",
        slug,
        visibility: "public",
        published_at: "2026-08-25T00:00:00.000Z",
        updated_at: "2026-08-25T00:00:00.000Z",
        isEditorial: true,
        isPlatformOwned: true,
        description: "Спокойное утро",
        user_id: "user-secret",
        cover_path: "secret/cover.webp",
      },
      items: [
        {
          practiceId: "practice-secret",
          audioItemId: "audio-1",
          position: 1,
          title: "Трек утра",
          authorName: "Анна",
          authorSlug: "anna",
          formatLabel: "Практика",
          metaLabel: "1:30",
          durationLabel: "1:30",
          durationSeconds: 90,
          productSlug: "morning-light",
          productHref: "/practice/anna/morning-light",
          coverUrl: "https://cdn.example.test/track.webp",
          coverImage: null,
          updatedAt: null,
          available: true,
          href: "/listen/anna/morning-light?autoplay=1",
        },
      ],
      itemsCount: 1,
      availableCount: 1,
      totalDurationLabel: "1 мин",
      hasUnavailable: false,
      allUnavailable: false,
      coverUrl: "https://cdn.example.test/cover.webp",
      mosaicCoverUrls: [null],
      ownerLabel: "Плейлист АудиоЛада",
    },
  };
});

try {
  const guest = await readJson(
    await postCatalog(
      maxRequest(MAX_PLAYLISTS_CATALOG_PATH, {
        initData: currentInitData(),
        user_id: "browser-user",
        q: "  сон  ",
        sort: "popular",
        access: "paid",
        cursor: "cursor-1",
        limit: "2",
      }),
    ),
  );
  assert.equal(guest.status, 200);
  assert.equal(guest.body.ok, true);
  assert.equal(guest.body.nextCursor, "cursor-next");
  assert.equal(catalogCalls.length, 1);
  assert.equal(catalogCalls[0].userId, null);
  assert.deepEqual(
    catalogCalls[0].query,
    parsePlaylistListingQuery({
      q: "  сон  ",
      sort: "popular",
      access: "paid",
      cursor: "cursor-1",
      limit: "2",
    }),
  );
  assert.deepEqual(guest.body.items, [
    {
      slug: "morning-set",
      title: "Утро",
      coverUrl: "https://cdn.example.test/cover.webp",
      creator: "Плейлист АудиоЛада",
      trackCount: 3,
      durationSeconds: 180,
      access: "free",
      topics: ["sleep"],
    },
  ]);
  const guestJson = JSON.stringify(guest.body);
  assert.equal(guestJson.includes("internal-playlist-id"), false);
  assert.equal(guestJson.includes("user-secret"), false);
  assert.equal(guestJson.includes(linkedUserId), false);
  assert.equal(guestJson.includes("cover_path"), false);
  assert.equal(guestJson.includes("secret/cover.webp"), false);
  assert.equal(guestJson.includes("browser-user"), false);
  assert.equal(guest.body.items[0].id, undefined);
  assert.equal(guest.body.items[0].viewer, undefined);
  assert.equal(guest.body.items[0].saved, undefined);
  assert.equal(guest.body.items[0].href, undefined);
  assert.equal(guest.body.user_id, undefined);

  linked = true;
  const linkedResponse = await readJson(
    await postCatalog(
      maxRequest(MAX_PLAYLISTS_CATALOG_PATH, {
        initData: currentInitData(),
        user_id: "browser-user",
      }),
    ),
  );
  assert.equal(linkedResponse.status, 200);
  assert.equal(catalogCalls.at(-1).userId, linkedUserId);
  assert.equal(JSON.stringify(linkedResponse.body).includes(linkedUserId), false);
  assert.equal(linkedResponse.body.items[0].slug, "morning-set");
  linked = false;

  const callsAfterSuccess = catalogCalls.length;
  const invalid = await readJson(
    await postCatalog(
      maxRequest(MAX_PLAYLISTS_CATALOG_PATH, {
        initData: currentInitData().replace(/hash=[0-9a-f]+/, "hash=ff"),
      }),
    ),
  );
  assert.equal(invalid.status, 401);
  assert.equal(invalid.body.reason, "invalid_hash");
  assert.equal(catalogCalls.length, callsAfterSuccess);

  const blockedHost = await readJson(
    await postCatalog(
      maxRequest(
        MAX_PLAYLISTS_CATALOG_PATH,
        { initData: currentInitData() },
        { host: "audiolad.ru", headers: { origin: "https://audiolad.ru" } },
      ),
    ),
  );
  assert.equal(blockedHost.status, 404);
  assert.equal(blockedHost.body.reason, "forbidden_host");
  assert.equal(catalogCalls.length, callsAfterSuccess);

  const blockedOrigin = await readJson(
    await postCatalog(
      maxRequest(
        MAX_PLAYLISTS_CATALOG_PATH,
        { initData: currentInitData() },
        { headers: { origin: "https://evil.example" } },
      ),
    ),
  );
  assert.equal(blockedOrigin.status, 403);
  assert.equal(blockedOrigin.body.reason, "forbidden_origin");
  assert.equal(catalogCalls.length, callsAfterSuccess);

  const canonicalAccess = await readJson(
    await postCatalog(
      maxRequest(MAX_PLAYLISTS_CATALOG_PATH, {
        initData: currentInitData(),
        access: "gift",
        sort: "trending",
      }),
    ),
  );
  assert.equal(canonicalAccess.status, 200);
  assert.equal(catalogCalls.at(-1).query.access, "all");
  assert.equal(catalogCalls.at(-1).query.sort, "newest");

  const badAccess = await readJson(
    await postCatalog(
      maxRequest(MAX_PLAYLISTS_CATALOG_PATH, {
        initData: currentInitData(),
        access: 1,
      }),
    ),
  );
  assert.equal(badAccess.status, 400);
  assert.equal(badAccess.body.reason, "invalid_request");

  const detail = await readJson(
    await postDetail(
      maxRequest(MAX_PLAYLISTS_DETAIL_PATH, {
        initData: currentInitData(),
        slug: "morning-set",
        user_id: linkedUserId,
      }),
    ),
  );
  assert.equal(detail.status, 200);
  assert.deepEqual(detailCalls, ["morning-set"]);
  assert.equal(detail.body.detail.slug, "morning-set");
  assert.equal(detail.body.detail.items[0].authorSlug, "anna");
  assert.equal(detail.body.detail.items[0].productSlug, "morning-light");
  assert.equal(detail.body.detail.items[0].audioItemId, "audio-1");
  assert.equal(detail.body.detail.items[0].practiceId, undefined);
  assert.equal(detail.body.detail.items[0].href, undefined);
  const detailJson = JSON.stringify(detail.body);
  assert.equal(detailJson.includes("practice-secret"), false);
  assert.equal(detailJson.includes("user-secret"), false);
  assert.equal(detailJson.includes("cover_path"), false);
  assert.equal(detailJson.includes("secret/cover.webp"), false);
  assert.equal(detailJson.includes("/listen/"), false);
  assert.equal(detailJson.includes("/practice/"), false);
  assert.equal(detailJson.includes(linkedUserId), false);

  const missing = await readJson(
    await postDetail(
      maxRequest(MAX_PLAYLISTS_DETAIL_PATH, {
        initData: currentInitData(),
        slug: "missing-set",
      }),
    ),
  );
  assert.equal(missing.status, 404);
  assert.equal(missing.body.reason, "not_found");

  const detailCallsBeforeReject = detailCalls.length;
  const detailInvalid = await readJson(
    await postDetail(
      maxRequest(MAX_PLAYLISTS_DETAIL_PATH, {
        initData: currentInitData().replace(/hash=[0-9a-f]+/, "hash=ff"),
        slug: "morning-set",
      }),
    ),
  );
  assert.equal(detailInvalid.status, 401);
  assert.equal(detailCalls.length, detailCallsBeforeReject);

  const detailHost = await readJson(
    await postDetail(
      maxRequest(
        MAX_PLAYLISTS_DETAIL_PATH,
        { initData: currentInitData(), slug: "morning-set" },
        { host: "audiolad.ru", headers: { origin: "https://audiolad.ru" } },
      ),
    ),
  );
  assert.equal(detailHost.status, 404);
  assert.equal(detailCalls.length, detailCallsBeforeReject);

  const detailOrigin = await readJson(
    await postDetail(
      maxRequest(
        MAX_PLAYLISTS_DETAIL_PATH,
        { initData: currentInitData(), slug: "morning-set" },
        { headers: { origin: "https://evil.example" } },
      ),
    ),
  );
  assert.equal(detailOrigin.status, 403);
  assert.equal(detailCalls.length, detailCallsBeforeReject);
} finally {
  setListMaxPublicPlaylistsForTests(null);
  setLoadMaxPublicPlaylistForTests(null);
  setResolveMaxNativeUserForTests(null);
  if (previousToken === undefined) {
    delete process.env.MAX_BOT_TOKEN;
  } else {
    process.env.MAX_BOT_TOKEN = previousToken;
  }
}

console.log("max-playlists-route-unit: ok");
