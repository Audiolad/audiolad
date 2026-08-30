import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { PlaylistAccessRow } from "../src/lib/playlists/playlist-access";
import {
  handleSetPlaylistTopics,
  parsePlaylistTopicsRequestBody,
} from "../src/lib/playlists/playlist-topics-api";
import {
  PLAYLIST_TOPIC_LIMIT,
  parsePlaylistTopicKeysInput,
} from "../src/lib/playlists/playlist-topics";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const PLAYLIST = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const USER = "11111111-1111-4111-8111-111111111111";

function read(relativePath: string) {
  return readFileSync(join(repoRoot, relativePath), "utf8");
}

const editorialPlaylist: PlaylistAccessRow = {
  id: PLAYLIST,
  user_id: null,
  is_editorial: true,
  visibility: "private",
  owner_type: "platform",
  published_at: null,
  slug: "morning",
  direction_id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
};

const userOwnedPlaylist: PlaylistAccessRow = {
  id: PLAYLIST,
  user_id: USER,
  is_editorial: false,
  visibility: "private",
  owner_type: "user",
  published_at: null,
  slug: null,
  direction_id: null,
};

function createDeps(options: {
  playlist?: PlaylistAccessRow | null;
  canEdit?: boolean;
  activeKeys?: string[];
  replace?: (
    playlistId: string,
    keys: string[],
  ) => Promise<
    | {
        ok: true;
        result: {
          playlist_id: string;
          topic_keys: string[];
          topic_count: number;
          topic_limit: number;
        };
      }
    | { ok: false; status: number; code: string; message: string }
  >;
}) {
  const replaceCalls: Array<{ playlistId: string; keys: string[] }> = [];

  return {
    replaceCalls,
    deps: {
      loadPlaylist: async () => ({
        playlist: options.playlist === undefined ? editorialPlaylist : options.playlist,
        error: null,
      }),
      canEditEditorial: async () => options.canEdit === true,
      resolveActiveTopicIds: async (keys: string[]) => {
        const allowed = new Set(options.activeKeys ?? keys);
        return new Map(
          keys.filter((key) => allowed.has(key)).map((key) => [key, key]),
        );
      },
      replaceTopics: async (playlistId: string, keys: string[]) => {
        replaceCalls.push({ playlistId, keys });

        if (options.replace) {
          return options.replace(playlistId, keys);
        }

        return {
          ok: true as const,
          result: {
            playlist_id: playlistId,
            topic_keys: keys,
            topic_count: keys.length,
            topic_limit: PLAYLIST_TOPIC_LIMIT,
          },
        };
      },
    },
  };
}

assert.deepEqual(parsePlaylistTopicsRequestBody({ topicKeys: [] }), {
  ok: true,
  keys: [],
});
assert.deepEqual(parsePlaylistTopicsRequestBody({ topicKeys: ["Money"] }), {
  ok: true,
  keys: ["money"],
});
assert.deepEqual(parsePlaylistTopicsRequestBody({ topicKeys: ["sleep"] }), {
  ok: true,
  keys: ["sleep"],
});
assert.deepEqual(
  parsePlaylistTopicsRequestBody({ topicKeys: ["sleep", "calm", "money"] }),
  { ok: true, keys: ["sleep", "calm", "money"] },
);
const tooManyKeys = parsePlaylistTopicKeysInput(["a", "b", "c", "d"]);
if (!tooManyKeys.ok) {
  assert.equal(tooManyKeys.code, "topic_limit_exceeded");
} else {
  assert.fail("expected more than 3 keys to fail");
}
assert.equal(parsePlaylistTopicKeysInput(["not a key"]).ok, false);

const anonymous = await handleSetPlaylistTopics({
  userId: null,
  playlistId: PLAYLIST,
  body: { topicKeys: ["money"] },
  deps: createDeps({ canEdit: true }).deps,
});
assert.deepEqual(anonymous, { status: 401, body: { error: "unauthorized" } });

const userOwner = await handleSetPlaylistTopics({
  userId: USER,
  playlistId: PLAYLIST,
  body: { topicKeys: ["money"] },
  deps: createDeps({ playlist: userOwnedPlaylist, canEdit: false }).deps,
});
assert.deepEqual(userOwner, { status: 403, body: { error: "forbidden" } });

const missing = await handleSetPlaylistTopics({
  userId: USER,
  playlistId: PLAYLIST,
  body: { topicKeys: ["money"] },
  deps: createDeps({ playlist: null, canEdit: true }).deps,
});
assert.deepEqual(missing, { status: 404, body: { error: "not_found" } });

for (const role of ["editorial admin", "direction editor", "collaborator"]) {
  const { deps, replaceCalls } = createDeps({
    canEdit: true,
    activeKeys: ["money"],
  });
  const allowed = await handleSetPlaylistTopics({
    userId: USER,
    playlistId: PLAYLIST,
    body: { topicKeys: ["money"] },
    deps,
  });
  assert.equal(allowed.status, 200, `${role} must succeed`);
  assert.deepEqual(allowed.body, { topicKeys: ["money"], topicCount: 1 });
  assert.deepEqual(replaceCalls, [{ playlistId: PLAYLIST, keys: ["money"] }]);
}

const tooMany = await handleSetPlaylistTopics({
  userId: USER,
  playlistId: PLAYLIST,
  body: { topicKeys: ["sleep", "money", "purpose", "calm"] },
  deps: createDeps({ canEdit: true }).deps,
});
assert.equal(tooMany.status, 400);
assert.equal(
  "error" in tooMany.body ? tooMany.body.error : null,
  "topic_limit_exceeded",
);

const invalidKey = await handleSetPlaylistTopics({
  userId: USER,
  playlistId: PLAYLIST,
  body: { topicKeys: ["not a key"] },
  deps: createDeps({ canEdit: true }).deps,
});
assert.equal(invalidKey.status, 400);

const unknownKey = await handleSetPlaylistTopics({
  userId: USER,
  playlistId: PLAYLIST,
  body: { topicKeys: ["missing-topic"] },
  deps: createDeps({ canEdit: true, activeKeys: [] }).deps,
});
assert.equal(unknownKey.status, 400);
assert.equal(
  "error" in unknownKey.body ? unknownKey.body.error : null,
  "topic_not_found",
);

const cleared = await handleSetPlaylistTopics({
  userId: USER,
  playlistId: PLAYLIST,
  body: { topicKeys: [] },
  deps: createDeps({ canEdit: true }).deps,
});
assert.deepEqual(cleared, {
  status: 200,
  body: { topicKeys: [], topicCount: 0 },
});

const route = read("src/app/api/playlists/[id]/topics/route.ts");
assert.match(route, /canUserEditEditorialPlaylist/);
assert.match(route, /setPlaylistTopics/);
assert.match(route, /createServiceRoleClient/);
assert.doesNotMatch(route, /canUserEditPlaylist\(/);
assert.doesNotMatch(route, /PATCH \/api\/playlists\/\[id\]/);

const patchRoute = read("src/app/api/playlists/[id]/route.ts");
assert.doesNotMatch(patchRoute, /topicKeys/);
assert.doesNotMatch(patchRoute, /set_playlist_topics/);

const detail = read("src/lib/playlists/editorial-workspace-detail.ts");
assert.match(detail, /topicKeys: string\[\]/);
assert.match(detail, /getPlaylistTopicKeys/);
assert.match(detail, /listActiveTopics/);

const editor = read(
  "src/components/playlists/editorial/EditorialPlaylistEditorClient.tsx",
);
assert.match(editor, /TopicSelector/);
assert.match(editor, /from ["']@\/components\/author-products\/TopicSelector["']/);
assert.match(editor, /value=\{topicKeys\}/);
assert.match(editor, /limit=\{PLAYLIST_TOPIC_LIMIT\}/);
assert.match(editor, /\/api\/playlists\/\$\{detail\.playlist\.id\}\/topics/);
assert.match(editor, /method: "PUT"/);
assert.match(editor, /JSON\.stringify\(\{ topicKeys \}\)/);
assert.match(editor, /hasMetadataChanges/);
assert.match(editor, /hasTopicChanges/);
assert.doesNotMatch(editor, /body\.topicKeys/);
assert.match(
  editor,
  /const body: Record<string, unknown> = \{\s*title,/,
);
assert.doesNotMatch(editor, /body\.title[\s\S]*topicKeys/);

const ownerEditor = read("src/app/(platform)/playlists/[id]/page.tsx");
assert.doesNotMatch(ownerEditor, /TopicSelector/);
assert.doesNotMatch(ownerEditor, /\/topics/);

assert.equal(
  existsSync(join(repoRoot, "src/app/api/playlists/[id]/topics/route.ts")),
  true,
);
assert.doesNotMatch(editor, /PlaylistCatalogFilters|TopicFilterBar/);

const sleepSeed = read("supabase/migrations/20260910120000_topics_sleep.sql");
assert.match(sleepSeed, /INSERT INTO public\.topics/);
assert.match(sleepSeed, /'sleep'/);
assert.match(sleepSeed, /'Сон'/);
assert.match(sleepSeed, /ON CONFLICT \(key\) DO NOTHING/);
assert.doesNotMatch(sleepSeed, /UPDATE\s+public\.topics/i);
assert.doesNotMatch(sleepSeed, /UPDATE\s+public\.playlist_topics/i);
assert.doesNotMatch(sleepSeed, /Спокойствие/);
assert.doesNotMatch(
  editor,
  /key:\s*"sleep"|title:\s*"Сон"/,
  "editorial editor does not hardcode Сон",
);
assert.match(detail, /listActiveTopics/);

const sleepSave = await handleSetPlaylistTopics({
  userId: USER,
  playlistId: PLAYLIST,
  body: { topicKeys: ["sleep", "calm"] },
  deps: createDeps({ canEdit: true, activeKeys: ["sleep", "calm"] }).deps,
});
assert.equal(sleepSave.status, 200);
assert.deepEqual(sleepSave.body, { topicKeys: ["sleep", "calm"], topicCount: 2 });

console.log("playlist-editorial-topics-unit: ok");
