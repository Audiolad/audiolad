import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { isMusicLabAnalyticsRoute } from "../src/lib/analytics/yandex-metrika-environment";
import { decideMusicLabAccess } from "../src/lib/music-lab/access-policy";
import { assertMusicLabClientSafe } from "../src/lib/music-lab/client-safety";
import { buildMusicLabClientBundle } from "../src/lib/music-lab/client-view";
import { MUSIC_LAB_EXPERIMENT_CODE, MUSIC_LAB_FORBIDDEN_PRODUCTION_TABLES, MUSIC_LAB_TABLES } from "../src/lib/music-lab/constants";
import { MusicLabImportError, importListeningPacket } from "../src/lib/music-lab/import-packet";
import { createMemoryMusicLabRepository } from "../src/lib/music-lab/memory-store";
import { isWorkspaceDashboardPathname } from "../src/lib/navigation/bottom-nav";
import { defaultListeningPacketDir, readListeningPacketDir } from "../src/lib/music-lab/packet";
import { SEO_ROBOTS_DISALLOWED_PATHS } from "../src/lib/seo/robots-config";
import type { ListenAnswers, MusicLabRepository, SimilarityAnswers } from "../src/lib/music-lab/types";
import {
  MusicLabWorkflowError,
  authorizeMusicLabAudio,
  completeMusicLabExperiment,
  readMusicLabResults,
  reopenMusicLabExperiment,
  saveMusicLabResponse,
  saveMusicLabResultsSnapshot,
} from "../src/lib/music-lab/workflow";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const userId = "00000000-0000-4000-8000-0000000000aa";

function read(relPath: string): string {
  return readFileSync(path.join(root, relPath), "utf8");
}

function uncertainListen(): ListenAnswers {
  return {
    coarseGenre: "uncertain",
    styles: [],
    stylesUncertain: true,
    vocalRole: "uncertain",
    instruments: [],
    instrumentsOther: "",
    instrumentsUncertain: true,
    moods: [],
    moodsUncertain: true,
    soundCharacter: [],
    soundUncertain: true,
    comment: "без догадки",
  };
}

async function fillAll(repository: MusicLabRepository, experimentId: string) {
  const tasks = await repository.listTasks(experimentId);
  for (const task of tasks) {
    if (task.taskType === "listen") {
      await saveMusicLabResponse({
        repository,
        userId,
        taskCode: task.publicCode,
        answers: uncertainListen(),
      });
    } else if (task.taskType === "bpm_key") {
      await saveMusicLabResponse({
        repository,
        userId,
        taskCode: task.publicCode,
        answers: { bpm: null, bpmUncertain: true, key: null, keyUncertain: true },
      });
    } else if (task.definition && "sets" in task.definition) {
      const scores: SimilarityAnswers["scores"] = {};
      for (const neighbour of [...task.definition.sets.A, ...task.definition.sets.B]) {
        scores[neighbour.itemPublicCode] = { uncertain: true };
      }
      await saveMusicLabResponse({
        repository,
        userId,
        taskCode: task.publicCode,
        answers: { scores },
      });
    }
  }
}

function withBlindCounter(repository: MusicLabRepository) {
  let reads = 0;
  const wrapped: MusicLabRepository = {
    ...repository,
    async listBlindAssignments(experimentId) {
      reads += 1;
      return repository.listBlindAssignments(experimentId);
    },
  };
  return {
    repository: wrapped,
    reads: () => reads,
  };
}

function walk(directory: string): string[] {
  const entries: string[] = [];
  for (const name of readdirSync(directory)) {
    const full = path.join(directory, name);
    if (statSync(full).isDirectory()) {
      entries.push(...walk(full));
    } else if (/\.(ts|tsx)$/.test(name)) {
      entries.push(full);
    }
  }
  return entries;
}

const packet = readListeningPacketDir(defaultListeningPacketDir());
assert.equal(packet.listenTracks.length, 16);
assert.equal(packet.similaritySeedIds.length, 10);
assert.equal(packet.bpmTracks.length, 7);
assert.equal(packet.similarityRows.length, 100);
assert.equal(Object.keys(packet.blindBySeed).length, 10);

assert.equal(decideMusicLabAccess({ userId: null, roles: [] }), "anonymous");
assert.equal(decideMusicLabAccess({ userId: userId, roles: [] }), "denied");
assert.equal(decideMusicLabAccess({ userId: userId, roles: ["editor"] }), "denied");
assert.equal(decideMusicLabAccess({ userId: userId, roles: ["support"] }), "denied");
assert.equal(decideMusicLabAccess({ userId: userId, roles: ["analyst"] }), "denied");
assert.equal(decideMusicLabAccess({ userId: userId, roles: ["finance"] }), "denied");
assert.equal(decideMusicLabAccess({ userId: userId, roles: ["owner"] }), "allow");
assert.equal(decideMusicLabAccess({ userId: userId, roles: ["admin"] }), "allow");

const repository = createMemoryMusicLabRepository();
const blind = withBlindCounter(repository);
const first = await importListeningPacket(blind.repository, packet);
assert.equal(first.created, true);
assert.equal(first.responsesPreserved, 0);
assert.equal(first.tasks, 33);
assert.equal(first.blindAssignments, 20);

const experiment = await blind.repository.getExperimentByCode(MUSIC_LAB_EXPERIMENT_CODE);
assert.ok(experiment);
const items = await blind.repository.listItems(experiment.id);
const tasks = await blind.repository.listTasks(experiment.id);
assert.equal(new Set(items.map((item) => item.publicCode)).size, items.length);
assert.equal(new Set(tasks.map((task) => task.publicCode)).size, tasks.length);
assert.equal(tasks.filter((task) => task.taskType === "listen").length, 16);
for (const task of tasks) {
  assert.equal(JSON.stringify(task.definition).includes("clap_native"), false);
  assert.equal(JSON.stringify(task.definition).includes("openl3"), false);
}

const openBundle = buildMusicLabClientBundle({
  experiment,
  items,
  tasks,
  responses: [],
});
assert.equal(openBundle.progress.listen.done, 0);
assert.equal(openBundle.progress.listen.total, 16);
assert.equal(JSON.stringify(openBundle).includes("clap_native"), false);
assert.equal(JSON.stringify(openBundle).includes("OpenL3"), false);
assert.equal(JSON.stringify(openBundle).includes(packet.listenTracks[0].filename), false);

const readsBeforeOpenResults = blind.reads();
const openResults = await readMusicLabResults({
  repository: blind.repository,
  userId,
});
assert.equal(openResults.locked, true);
assert.equal(blind.reads(), readsBeforeOpenResults);
assert.equal(JSON.stringify(openResults).includes("CLAP"), false);

const listenTask = tasks.find((task) => task.taskType === "listen");
assert.ok(listenTask);
await saveMusicLabResponse({
  repository: blind.repository,
  userId,
  taskCode: listenTask.publicCode,
  answers: { ...uncertainListen(), coarseGenre: "jazz", comment: "сохранилось" },
});
const saved = await blind.repository.listResponses(experiment.id, userId);
const reloaded = buildMusicLabClientBundle({
  experiment,
  items,
  tasks,
  responses: saved,
});
assert.equal(reloaded.listen[0]?.answers.coarseGenre, "jazz");
assert.equal(reloaded.listen[0]?.answers.comment, "сохранилось");
assert.equal(reloaded.progress.listen.done, 1);

const preserved = await blind.repository.listResponses(experiment.id);
const second = await importListeningPacket(blind.repository, packet);
assert.equal(second.created, false);
assert.equal(second.responsesPreserved, 1);
assert.equal(second.items, first.items);
assert.deepEqual(await blind.repository.listResponses(experiment.id), preserved);
const tasksAfter = await blind.repository.listTasks(experiment.id);
assert.equal(tasksAfter.length, tasks.length);

const swappedSeed = packet.similaritySeedIds[0];
await assert.rejects(
  () =>
    importListeningPacket(blind.repository, {
      ...packet,
      blindBySeed: {
        ...packet.blindBySeed,
        [swappedSeed]: {
          A: packet.blindBySeed[swappedSeed].B,
          B: packet.blindBySeed[swappedSeed].A,
        },
      },
    }),
  (error: unknown) => error instanceof MusicLabImportError && error.code === "blind_key_conflict",
);
assert.deepEqual(await blind.repository.listResponses(experiment.id), preserved);

await assert.rejects(
  () =>
    importListeningPacket(blind.repository, {
      ...packet,
      listenTracks: packet.listenTracks.slice(1),
    }),
  (error: unknown) =>
    error instanceof MusicLabImportError && error.code === "import_would_drop_answered_task",
);

let signCalls = 0;
const anonymousAudio = await authorizeMusicLabAudio({
  decision: "anonymous",
  publicCode: "t01",
  repository: blind.repository,
  sign: async () => {
    signCalls += 1;
    return "https://audio.example/signed";
  },
});
assert.equal(anonymousAudio.status, 401);
assert.equal(anonymousAudio.body.url, undefined);
assert.equal(signCalls, 0);

const editorAudio = await authorizeMusicLabAudio({
  decision: "denied",
  publicCode: "t01",
  repository: blind.repository,
  sign: async () => {
    signCalls += 1;
    return "https://audio.example/signed";
  },
});
assert.equal(editorAudio.status, 404);
assert.equal(signCalls, 0);

const ownerAudio = await authorizeMusicLabAudio({
  decision: "allow",
  publicCode: items[0].publicCode,
  repository: blind.repository,
  sign: async () => {
    signCalls += 1;
    return "https://audio.example/signed";
  },
});
assert.equal(ownerAudio.status, 200);
assert.equal(ownerAudio.body.url, "https://audio.example/signed");
assert.equal(signCalls, 1);
assertMusicLabClientSafe(ownerAudio.body, [items[0].externalKey, items[0].sourceFilename, items[0].storagePath]);

await fillAll(blind.repository, experiment.id);
const filled = buildMusicLabClientBundle({
  experiment,
  items,
  tasks: await blind.repository.listTasks(experiment.id),
  responses: await blind.repository.listResponses(experiment.id, userId),
});
assert.equal(filled.progress.listen.done, 16);
assert.equal(filled.progress.similarity.done, 10);
assert.equal(filled.progress.bpm.done, 7);

await completeMusicLabExperiment({ repository: blind.repository, userId });
await assert.rejects(
  () =>
    saveMusicLabResponse({
      repository: blind.repository,
      userId,
      taskCode: listenTask.publicCode,
      answers: uncertainListen(),
    }),
  (error: unknown) =>
    error instanceof MusicLabWorkflowError && error.code === "responses_locked",
);

const completedExperiment = await blind.repository.getExperimentByCode(MUSIC_LAB_EXPERIMENT_CODE);
assert.equal(completedExperiment?.status, "completed");
const completedBundle = buildMusicLabClientBundle({
  experiment: completedExperiment!,
  items,
  tasks: await blind.repository.listTasks(experiment.id),
  responses: await blind.repository.listResponses(experiment.id, userId),
});
assert.equal(completedBundle.experiment.locked, true);
assert.equal(JSON.stringify(completedBundle).includes("clap_native"), false);
assert.equal(JSON.stringify(completedBundle).includes("openl3"), false);

const results = await readMusicLabResults({ repository: blind.repository, userId });
assert.equal(results.locked, false);
if (!results.locked) {
  assert.deepEqual(
    results.similarity.map((entry) => entry.label),
    ["CLAP", "OpenL3"],
  );
  assert.equal(JSON.stringify(results).includes("clap_native"), false);
  assert.equal(JSON.stringify(results).includes("openl3"), false);
  assert.equal(JSON.stringify(results).includes(packet.listenTracks[0].trackId), false);
}
assert.ok(blind.reads() > readsBeforeOpenResults);

const responseCount = (await blind.repository.listResponses(experiment.id)).length;
await saveMusicLabResultsSnapshot({
  repository: blind.repository,
  snapshot: { slots: { genre_top1: { text: "ожидает сверку", policy: "MANUAL" } } },
});
assert.equal((await blind.repository.listResponses(experiment.id)).length, responseCount);
await assert.rejects(
  () =>
    saveMusicLabResultsSnapshot({
      repository: blind.repository,
      snapshot: { slots: { genre_top1: { text: "clap_native" } } },
    }),
  (error: unknown) => error instanceof Error && error.message === "invalid_results_snapshot",
);

await reopenMusicLabExperiment({ repository: blind.repository });
const reopened = await readMusicLabResults({ repository: blind.repository, userId });
assert.equal(reopened.locked, true);
await saveMusicLabResponse({
  repository: blind.repository,
  userId,
  taskCode: listenTask.publicCode,
  answers: uncertainListen(),
});

const migration = read("supabase/migrations/20261203120000_music_analyzer_lab_v01.sql");
const sql = migration.replace(/\/\*[\s\S]*?\*\//g, "").replace(/--.*$/gm, "");
for (const table of MUSIC_LAB_FORBIDDEN_PRODUCTION_TABLES) {
  assert.equal(sql.includes(table), false, table);
}
assert.equal(sql.includes("CREATE POLICY"), false);
assert.equal(sql.includes("music-analyzer-lab"), true);
assert.match(sql, /public = false/);
assert.match(sql, /REVOKE ALL ON TABLE public\.music_lab_blind_assignments/);

const repositorySource = read("src/lib/music-lab/supabase-repository.ts");
const fromCalls = repositorySource.match(/\.from\(([^)]+)\)/g) ?? [];
assert.ok(fromCalls.length > 0);
for (const call of fromCalls) {
  assert.match(call, /MUSIC_LAB_TABLES/);
}
const constantsSource = read("src/lib/music-lab/constants.ts");
for (const table of Object.values(MUSIC_LAB_TABLES)) {
  assert.match(constantsSource, new RegExp(table));
  assert.equal(repositorySource.includes(`"${table}"`), false);
}
for (const table of MUSIC_LAB_FORBIDDEN_PRODUCTION_TABLES) {
  assert.equal(repositorySource.includes(table), false, table);
}
assert.equal(read("src/lib/music-lab/import-packet.ts").includes(".delete("), false);

const clientFiles = [
  ...walk(path.join(root, "src/components/music-lab")),
  ...walk(path.join(root, "src/app/(platform)/music-analyzer")),
  ...walk(path.join(root, "src/app/api/music-analyzer")),
];
for (const file of clientFiles) {
  const source = readFileSync(file, "utf8");
  assert.equal(source.includes("clap_native"), false, file);
  assert.equal(source.includes("openl3"), false, file);
  assert.equal(source.includes("similarity_ear_key"), false, file);
  assert.equal(source.includes("test_tracks"), false, file);
  if (source.includes('"use client"')) {
    assert.equal(source.includes("@/lib/music-lab/packet"), false, file);
    assert.equal(source.includes("@/lib/music-lab/results\""), false, file);
  }
}

assert.equal(read("src/lib/music-lab/guard.ts").includes("getPlatformAccess"), true);
assert.equal(read("src/lib/music-lab/guard.ts").includes("decideMusicLabAccess"), true);
assert.equal(read("src/lib/music-lab/guard.ts").includes("admin_panel.access"), false);
assert.match(read("src/app/(platform)/music-analyzer/layout.tsx"), /requireMusicLabPageAccess\(\)/);
assert.match(read("src/app/api/music-analyzer/audio/[experimentCode]/[publicCode]/route.ts"), /if \(!guard\.ok\)/);
assert.equal(read("src/lib/admin/nav.ts").includes("music-analyzer"), false);
assert.equal(read("src/lib/navigation/listener-nav.ts").includes("music-analyzer"), false);
assert.equal(isWorkspaceDashboardPathname("/music-analyzer/listen/l01"), true);
assert.equal(SEO_ROBOTS_DISALLOWED_PATHS.includes("/music-analyzer/"), true);
assert.equal(isMusicLabAnalyticsRoute("/music-analyzer/results"), true);
assert.match(read("src/app/(platform)/music-analyzer/layout.tsx"), /PRIVATE_PAGE_ROBOTS/);
assert.match(read("next.config.ts"), /\/music-analyzer[\s\S]*noindex, nofollow/);

const committedAudio = walk(path.join(root, "data/music-lab")).filter((file) =>
  /\.(mp3|wav|flac)$/i.test(file),
);
assert.deepEqual(committedAudio, []);

console.log("music-lab-unit: ok");
