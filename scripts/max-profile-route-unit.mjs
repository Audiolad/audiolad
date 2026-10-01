#!/usr/bin/env node
/**
 * POST /api/max/profile — linked listener profile, host/origin/HMAC, safe DTO.
 */
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  MAX_HOSTNAME,
  MAX_ORIGIN,
  MAX_PROFILE_PATH,
} from "../src/lib/max/host.ts";
import { readMaxProfilePayload, toMaxProfileDto } from "../src/lib/max/profile.ts";
import {
  POST,
  setMaxProfileDepsForTests,
  setResolveMaxNativeUserForTests,
} from "../src/app/api/max/profile/route.ts";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const FICTIONAL_BOT_TOKEN = "test-max-bot-token-not-real-0001";
const USER_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const WORKSPACE_ID = "workspace-secret-id";
const STORAGE_PATH = `${USER_A}/11111111-1111-4111-8111-111111111111.webp`;

const routeSource = readFileSync(
  join(repoRoot, "src/app/api/max/profile/route.ts"),
  "utf8",
);
const queriesSource = readFileSync(
  join(repoRoot, "src/lib/profile/queries.ts"),
  "utf8",
);

assert.equal(MAX_PROFILE_PATH, "/api/max/profile");
assert.match(routeSource, /readMaxAuthenticatedPost\(request, \[\]\)/);
assert.match(routeSource, /authenticated\.userId/);
assert.match(routeSource, /auth\.admin\.getUserById\(userId\)/);
assert.match(routeSource, /getProfilePageData/);
assert.match(routeSource, /createServiceRoleClient/);
assert.match(routeSource, /toMaxProfileDto/);
assert.doesNotMatch(routeSource, /body\.user_id|body\.userId|body\.max_user_id/);
assert.doesNotMatch(routeSource, /from "@\/lib\/supabase\/server"/);
assert.match(queriesSource, /listAuthorWorkspacesForUser\(user\.id, supabase\)/);
assert.match(queriesSource, /getProfilePageData/);

function signInitData(fields, token = FICTIONAL_BOT_TOKEN) {
  const entries = Object.entries(fields).filter(([key]) => key !== "hash");
  entries.sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
  const launchParams = entries.map(([key, value]) => `${key}=${value}`).join("\n");
  const secretKey = createHmac("sha256", "WebAppData").update(token).digest();
  const hash = createHmac("sha256", secretKey).update(launchParams).digest("hex");
  return `${entries
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join("&")}&hash=${hash}`;
}

function currentInitData(userId = "101") {
  return signInitData({
    auth_date: String(Math.floor(Date.now() / 1000)),
    query_id: "profile-route-test",
    user: JSON.stringify({ id: Number(userId), first_name: "Route" }),
  });
}

function maxRequest(body, { host = MAX_HOSTNAME, headers = {} } = {}) {
  return new Request(`${MAX_ORIGIN}${MAX_PROFILE_PATH}`, {
    method: "POST",
    headers: {
      host,
      origin: MAX_ORIGIN,
      "sec-fetch-site": "same-origin",
      "content-type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

function counters() {
  return [
    { key: "library", value: 3, label: "в аудиотеке", href: "/my-practices" },
    { key: "playlists", value: 2, label: "плейлистов", href: "/playlists" },
    { key: "completed", value: null, label: "завершено", href: "/history?filter=completed" },
  ];
}

function pageFor(user) {
  if (user.id === USER_A) {
    return {
      card: {
        displayName: "Анна",
        initial: "А",
        email: user.email ?? "",
        avatarUrl: "https://cdn.example/avatars/anna.webp",
        rolePrimaryLabel: "Слушатель · Автор",
        authorWorkspaceCountLabel: "2 авторских пространства",
      },
      counters: counters(),
      authorSection: {
        kind: "member",
        workspaces: [
          {
            id: WORKSPACE_ID,
            name: "Тишина",
            slug: "tishina",
            role: "owner",
            accessStatus: "free",
            canBypassProductModeration: true,
            defaultAudioProductAuthor: "secret-author",
          },
          {
            id: "workspace-two",
            name: "Рассвет",
            slug: "rassvet",
            role: "editor",
            accessStatus: "commercial",
            canBypassProductModeration: false,
            defaultAudioProductAuthor: null,
          },
        ],
      },
      showAdminPanel: true,
    };
  }

  return {
    card: {
      displayName: "Борис",
      initial: "Б",
      email: user.email ?? "",
      avatarUrl: STORAGE_PATH,
      rolePrimaryLabel: "Слушатель",
      authorWorkspaceCountLabel: null,
    },
    counters: counters().map((counter, index) =>
      index === 0 ? { ...counter, value: 1 } : counter,
    ),
    authorSection: {
      kind: "application",
      variant: "needs_changes",
      reviewComment: "Поправьте описание",
      admin_note: "internal-note",
      user_id: USER_B,
    },
    showAdminPanel: false,
  };
}

const FORBIDDEN_KEYS = [
  "user_id",
  "userId",
  "avatar_path",
  "avatarPath",
  "user_metadata",
  "showAdminPanel",
  "accessStatus",
  "canBypassProductModeration",
  "defaultAudioProductAuthor",
  "id",
  "href",
  "admin_note",
];

function assertNoForbiddenKeys(value, path = "$") {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoForbiddenKeys(item, `${path}[${index}]`));
    return;
  }
  for (const key of Object.keys(value)) {
    assert.equal(FORBIDDEN_KEYS.includes(key), false, `${path}.${key}`);
    assertNoForbiddenKeys(value[key], `${path}.${key}`);
  }
}

const previousToken = process.env.MAX_BOT_TOKEN;
process.env.MAX_BOT_TOKEN = FICTIONAL_BOT_TOKEN;

const lookups = [];
const profileCalls = [];
let mismatchUser = false;

setResolveMaxNativeUserForTests(async (_provider, providerUserId) => {
  if (providerUserId === "101") return { ok: true, userId: USER_A };
  if (providerUserId === "202") return { ok: true, userId: USER_B };
  return { ok: true, userId: null };
});

setMaxProfileDepsForTests({
  createClient: () => ({
    auth: {
      admin: {
        getUserById: async (userId) => {
          lookups.push(userId);
          if (mismatchUser) {
            return {
              data: { user: { id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", email: "other@example.com" } },
              error: null,
            };
          }
          return {
            data: {
              user: {
                id: userId,
                email: userId === USER_A ? "anna@example.com" : "boris@example.com",
                user_metadata: {
                  full_name: userId === USER_A ? "Анна" : "Борис",
                  secret: "do-not-leak",
                },
              },
            },
            error: null,
          };
        },
      },
    },
  }),
  getProfilePageData: async (_client, user) => {
    profileCalls.push({
      id: user.id,
      email: user.email,
      metadata: user.user_metadata,
    });
    return pageFor(user);
  },
});

try {
  const stripped = toMaxProfileDto({
    card: {
      displayName: "Анна",
      initial: "А",
      email: "anna@example.com",
      avatarUrl: STORAGE_PATH,
      rolePrimaryLabel: "Слушатель",
      authorWorkspaceCountLabel: null,
    },
    counters: counters(),
    authorSection: {
      kind: "member",
      workspaces: [
        {
          id: WORKSPACE_ID,
          name: "Тишина",
          slug: "tishina",
          role: "owner",
          accessStatus: "free",
          canBypassProductModeration: false,
          defaultAudioProductAuthor: null,
        },
      ],
    },
    showAdminPanel: true,
  });
  assert.equal(stripped.card.avatarUrl, null);
  assert.equal(JSON.stringify(stripped).includes(STORAGE_PATH), false);
  assert.equal(JSON.stringify(stripped).includes(WORKSPACE_ID), false);
  assert.equal(JSON.stringify(stripped).includes(USER_A), false);
  assert.equal("showAdminPanel" in stripped, false);
  assert.deepEqual(Object.keys(stripped.authorSection.workspaces[0]), ["name", "slug", "role"]);
  assertNoForbiddenKeys(stripped);

  const ignored = readMaxProfilePayload({
    ok: true,
    user_id: USER_A,
    profile: {
      userId: USER_B,
      showAdminPanel: true,
      user_metadata: { secret: "do-not-leak" },
      card: {
        displayName: "Анна",
        initial: "А",
        email: "anna@example.com",
        avatarUrl: STORAGE_PATH,
        rolePrimaryLabel: "Слушатель",
        authorWorkspaceCountLabel: null,
        user_id: USER_A,
      },
      counters: counters(),
      authorSection: {
        kind: "member",
        workspaces: [
          {
            id: WORKSPACE_ID,
            name: "Тишина",
            slug: "tishina",
            role: "owner",
          },
        ],
      },
    },
  });
  assert.equal(ignored.card.avatarUrl, null);
  assert.equal(JSON.stringify(ignored).includes(USER_A), false);
  assert.equal(JSON.stringify(ignored).includes(USER_B), false);
  assert.equal(JSON.stringify(ignored).includes(WORKSPACE_ID), false);
  assert.equal(JSON.stringify(ignored).includes("do-not-leak"), false);
  assertNoForbiddenKeys(ignored);

  const linked = await POST(
    maxRequest({
      initData: currentInitData("101"),
      user_id: USER_B,
      userId: USER_B,
      max_user_id: "202",
    }),
  );
  assert.equal(linked.status, 200);
  assert.equal(linked.headers.get("cache-control"), "no-store");
  const linkedBody = await linked.json();
  assert.equal(linkedBody.ok, true);
  assert.equal(linkedBody.profile.card.displayName, "Анна");
  assert.equal(linkedBody.profile.card.email, "anna@example.com");
  assert.equal(linkedBody.profile.card.avatarUrl, "https://cdn.example/avatars/anna.webp");
  assert.deepEqual(
    linkedBody.profile.counters.map((counter) => counter.value),
    [3, 2, null],
  );
  assert.equal(linkedBody.profile.authorSection.kind, "member");
  assert.equal(linkedBody.profile.authorSection.workspaces[0].name, "Тишина");
  assert.deepEqual(lookups, [USER_A]);
  assert.equal(profileCalls[0].id, USER_A);
  assert.equal(profileCalls[0].email, "anna@example.com");
  assert.equal(profileCalls[0].metadata.full_name, "Анна");
  assert.equal("secret" in profileCalls[0].metadata, false);
  const linkedJson = JSON.stringify(linkedBody);
  assert.equal(linkedJson.includes(USER_A), false);
  assert.equal(linkedJson.includes(USER_B), false);
  assert.equal(linkedJson.includes(WORKSPACE_ID), false);
  assert.equal(linkedJson.includes("do-not-leak"), false);
  assert.equal(linkedJson.includes("/my-practices"), false);
  assert.equal(linkedJson.includes("showAdminPanel"), false);
  assertNoForbiddenKeys(linkedBody);

  const other = await POST(maxRequest({ initData: currentInitData("202"), user_id: USER_A }));
  assert.equal(other.status, 200);
  const otherBody = await other.json();
  assert.equal(otherBody.profile.card.displayName, "Борис");
  assert.equal(otherBody.profile.card.email, "boris@example.com");
  assert.equal(otherBody.profile.card.avatarUrl, null);
  assert.equal(otherBody.profile.authorSection.kind, "application");
  assert.equal(otherBody.profile.authorSection.variant, "needs_changes");
  assert.equal(otherBody.profile.authorSection.reviewComment, "Поправьте описание");
  assert.equal(JSON.stringify(otherBody).includes("internal-note"), false);
  assert.equal(JSON.stringify(otherBody).includes(STORAGE_PATH), false);
  assert.equal(JSON.stringify(otherBody).includes(USER_A), false);
  assert.equal(JSON.stringify(otherBody).includes(USER_B), false);
  assert.deepEqual(lookups, [USER_A, USER_B]);
  assert.equal(profileCalls[1].id, USER_B);
  assertNoForbiddenKeys(otherBody);

  const callsAfterLinked = lookups.length;
  const profilesAfterLinked = profileCalls.length;

  const wrongHost = await POST(
    maxRequest(
      { initData: currentInitData("101"), user_id: USER_B },
      { host: "audiolad.ru", headers: { origin: "https://audiolad.ru" } },
    ),
  );
  assert.equal(wrongHost.status, 404);
  assert.equal((await wrongHost.json()).reason, "forbidden_host");

  const wrongOrigin = await POST(
    maxRequest(
      { initData: currentInitData("101") },
      { headers: { origin: "https://audiolad.ru" } },
    ),
  );
  assert.equal(wrongOrigin.status, 403);
  assert.equal((await wrongOrigin.json()).reason, "forbidden_origin");

  const badHash = await POST(
    maxRequest({
      initData: currentInitData("101").replace(/hash=[0-9a-f]+/, "hash=ff"),
      user_id: USER_B,
    }),
  );
  assert.equal(badHash.status, 401);
  assert.equal((await badHash.json()).reason, "invalid_hash");

  const expired = await POST(
    maxRequest({
      initData: signInitData({
        auth_date: String(Math.floor(Date.now() / 1000) - 4000),
        user: '{"id":101,"first_name":"Route"}',
      }),
      user_id: USER_A,
    }),
  );
  assert.equal(expired.status, 401);
  assert.equal((await expired.json()).reason, "expired");

  const unlinked = await POST(
    maxRequest({ initData: currentInitData("303"), user_id: USER_A }),
  );
  assert.equal(unlinked.status, 403);
  assert.equal((await unlinked.json()).reason, "unlinked");

  mismatchUser = true;
  const mismatched = await POST(maxRequest({ initData: currentInitData("101") }));
  assert.equal(mismatched.status, 503);
  assert.equal((await mismatched.json()).reason, "storage_unavailable");
  mismatchUser = false;

  assert.equal(lookups.length, callsAfterLinked + 1);
  assert.equal(profileCalls.length, profilesAfterLinked);
  assert.deepEqual(lookups.slice(0, 2), [USER_A, USER_B]);
} finally {
  setResolveMaxNativeUserForTests(null);
  setMaxProfileDepsForTests(null);
  if (previousToken === undefined) delete process.env.MAX_BOT_TOKEN;
  else process.env.MAX_BOT_TOKEN = previousToken;
}

console.log("max-profile-route-unit: ok");
