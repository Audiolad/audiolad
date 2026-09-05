#!/usr/bin/env node
/**
 * practice_audio_progress write hardening: access decisions, source contracts,
 * resume helpers, and REST-bypass guards. No database.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  canWritePracticeProgress,
  resolveListenApiDecision,
} from "../src/lib/listen/preview-access";
import {
  isTrackCompleted,
  listPracticeProgress,
  resetPracticeProgress,
  resolveInitialPlayback,
  upsertPracticeProgress,
} from "../src/lib/listen/progress";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath: string): string {
  return readFileSync(join(root, relativePath), "utf8");
}

function entitledAccess(reason: "free" | "purchased" | "granted" | "admin" | "guest_promo") {
  return resolveListenApiDecision({
    purpose: "progress",
    isCourse: false,
    courseAllowed: false,
    canListen: true,
    accessReason: reason,
    catalogPreviewEligible: true,
    listenAccess: { mode: "entitled" },
  });
}

function testAccessDecisions() {
  const previewProgress = resolveListenApiDecision({
    purpose: "progress",
    isCourse: false,
    courseAllowed: false,
    canListen: false,
    accessReason: "payment_required",
    catalogPreviewEligible: true,
    listenAccess: null,
  });
  assert.equal(previewProgress.ok, false, "preview-only progress API 403");

  const previewQueryDoesNotGrant = resolveListenApiDecision({
    purpose: "progress",
    isCourse: false,
    courseAllowed: false,
    canListen: false,
    accessReason: "payment_required",
    catalogPreviewEligible: true,
    listenAccess: { mode: "catalog_preview" },
  });
  assert.equal(previewQueryDoesNotGrant.ok, false, "catalog_preview cannot write progress");

  const free = entitledAccess("free");
  assert.equal(free.ok, true);
  if (free.ok) {
    assert.equal(canWritePracticeProgress(free.access), true, "free auth can save progress");
  }

  for (const reason of ["purchased", "granted", "admin"] as const) {
    const paid = entitledAccess(reason);
    assert.equal(paid.ok, true, `${reason} progress allowed`);
    if (paid.ok) {
      assert.equal(canWritePracticeProgress(paid.access), true);
    }
  }

  const guestPromo = entitledAccess("guest_promo");
  assert.equal(guestPromo.ok, true, "registered guest_promo keeps full+progress");
  if (guestPromo.ok) {
    assert.equal(guestPromo.access.mode, "entitled");
    assert.equal(canWritePracticeProgress(guestPromo.access), true);
  }

  const author = resolveListenApiDecision({
    purpose: "progress",
    isCourse: false,
    courseAllowed: false,
    canListen: true,
    accessReason: "author_owner",
    catalogPreviewEligible: false,
    listenAccess: { mode: "author_preview" },
  });
  assert.equal(author.ok, true);
  if (author.ok) {
    assert.equal(canWritePracticeProgress(author.access), true);
  }

  assert.equal(canWritePracticeProgress({ mode: "catalog_preview" }), false);
}

type ProgressRow = {
  user_id: string;
  practice_id: string;
  audio_item_id: string;
  position_seconds: number;
  completed: boolean;
};

function createMemoryProgressClient(seed: ProgressRow[] = []) {
  const rows = [...seed];
  const writes: Array<{ op: string; payload: unknown }> = [];

  return {
    rows,
    writes,
    from(table: string) {
      assert.equal(table, "practice_audio_progress");
      return {
        select() {
          return {
            eq(column: string, value: string) {
              const first = { column, value };
              return {
                eq(column2: string, value2: string) {
                  const filtered = rows.filter(
                    (row) =>
                      row[first.column as keyof ProgressRow] === first.value &&
                      row[column2 as keyof ProgressRow] === value2,
                  );
                  return {
                    data: filtered.map((row) => ({
                      audio_item_id: row.audio_item_id,
                      position_seconds: row.position_seconds,
                      completed: row.completed,
                    })),
                    error: null,
                  };
                },
              };
            },
          };
        },
        async upsert(payload: ProgressRow) {
          writes.push({ op: "upsert", payload });
          const index = rows.findIndex(
            (row) =>
              row.user_id === payload.user_id &&
              row.practice_id === payload.practice_id &&
              row.audio_item_id === payload.audio_item_id,
          );
          if (index >= 0) {
            rows[index] = { ...rows[index], ...payload };
          } else {
            rows.push({ ...payload });
          }
          return { error: null };
        },
        delete() {
          return {
            eq(column: string, value: string) {
              const first = { column, value };
              return {
                async eq(column2: string, value2: string) {
                  writes.push({
                    op: "delete",
                    payload: { [first.column]: first.value, [column2]: value2 },
                  });
                  for (let index = rows.length - 1; index >= 0; index -= 1) {
                    const row = rows[index];
                    if (
                      row[first.column as keyof ProgressRow] === first.value &&
                      row[column2 as keyof ProgressRow] === value2
                    ) {
                      rows.splice(index, 1);
                    }
                  }
                  return { error: null };
                },
              };
            },
          };
        },
      };
    },
  };
}

async function testProgressHelpers() {
  const userId = "11111111-1111-4111-8111-111111111111";
  const practiceId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const trackA = "a1111111-1111-4111-8111-111111111111";
  const trackB = "a2222222-2222-4222-8222-222222222222";

  const client = createMemoryProgressClient([
    {
      user_id: userId,
      practice_id: practiceId,
      audio_item_id: trackA,
      position_seconds: 15,
      completed: false,
    },
  ]);

  const listed = await listPracticeProgress(
    client as never,
    userId,
    practiceId,
  );
  assert.equal(listed.length, 1);
  assert.equal(listed[0]?.audioItemId, trackA);
  assert.equal(listed[0]?.positionSeconds, 15);

  const resume = resolveInitialPlayback(
    [
      { id: trackA, durationSeconds: 60 },
      { id: trackB, durationSeconds: 90 },
    ],
    listed,
  );
  assert.equal(resume.trackIndex, 0);
  assert.equal(resume.positionSeconds, 15);
  assert.equal(resume.allCompleted, false);

  await upsertPracticeProgress(
    client as never,
    userId,
    practiceId,
    trackA,
    59,
    true,
  );
  await upsertPracticeProgress(
    client as never,
    userId,
    practiceId,
    trackB,
    10,
    false,
  );

  const afterSave = await listPracticeProgress(
    client as never,
    userId,
    practiceId,
  );
  assert.equal(afterSave.length, 2);
  assert.equal(isTrackCompleted(60, 59, true), true);

  const afterFirstComplete = resolveInitialPlayback(
    [
      { id: trackA, durationSeconds: 60 },
      { id: trackB, durationSeconds: 90 },
    ],
    afterSave,
  );
  assert.equal(afterFirstComplete.trackIndex, 1);
  assert.equal(afterFirstComplete.positionSeconds, 10);

  await resetPracticeProgress(client as never, userId, practiceId);
  const afterReset = await listPracticeProgress(
    client as never,
    userId,
    practiceId,
  );
  assert.equal(afterReset.length, 0);
  assert.ok(client.writes.some((entry) => entry.op === "delete"));
}

function testSourceContracts() {
  const productProgress = read(
    "src/app/api/listen/product/[slug]/[productSlug]/progress/route.ts",
  );
  const legacyProgress = read(
    "src/app/api/listen/legacy/[slug]/progress/route.ts",
  );
  const progressWrite = read("src/lib/listen/progress-write.ts");
  const progress = read("src/lib/listen/progress.ts");
  const promo = read("src/app/api/promo/complete-signup/route.ts");
  const player = read("src/components/audio/useSequentialPlayer.ts");
  const browserClient = read("src/lib/supabase/client.ts");
  const apiContext = read("src/lib/listen/api-context.ts");
  const previewAccess = read("src/lib/listen/preview-access.ts");

  assert.match(progressWrite, /import "server-only"/);
  assert.match(progressWrite, /createServiceRoleClient/);
  assert.match(progressWrite, /upsertPracticeProgress/);
  assert.match(progressWrite, /resetPracticeProgress/);
  assert.doesNotMatch(progress, /createServiceRoleClient/);
  assert.doesNotMatch(progress, /from "server-only"/);

  for (const source of [productProgress, legacyProgress]) {
    assert.match(source, /purpose:\s*"progress"/);
    assert.match(source, /canWritePracticeProgress/);
    assert.match(source, /writeOwnPracticeProgress/);
    assert.match(source, /resetOwnPracticeProgress/);
    assert.doesNotMatch(source, /upsertPracticeProgress\(/);
    assert.doesNotMatch(source, /resetPracticeProgress\(/);
    assert.doesNotMatch(source, /searchParams/);
    assert.doesNotMatch(source, /preview=1/);
    assert.doesNotMatch(source, /body\.user_id/);
    assert.doesNotMatch(source, /body\.practice_id/);
  }

  assert.match(promo, /writeOwnPracticeProgress/);
  assert.match(promo, /userId: user\.id/);
  assert.match(promo, /practiceId: data\.practice_id/);
  assert.doesNotMatch(promo, /\.from\("practice_audio_progress"\)/);

  assert.match(player, /\$\{saveApiBase\}\/progress/);
  assert.match(player, /isPreviewModeRef\.current/);
  assert.doesNotMatch(player, /\.from\("practice_audio_progress"\)/);
  assert.doesNotMatch(browserClient, /practice_audio_progress/);

  assert.match(apiContext, /purpose \?\? "full_audio"/);
  assert.match(
    previewAccess,
    /Client `preview=1` \/ playbackMode never grant full audio, progress writes/,
  );

  const preflight = read("src/lib/admin/test-user-reset/preflight.ts");
  assert.match(preflight, /"practice_audio_progress"/);

  const home = read("src/lib/home/listening-progress.ts");
  const history = read("src/lib/history/queries.ts");
  const profile = read("src/lib/profile/queries.ts");
  const resume = read("src/app/api/listen/resume-session/route.ts");
  for (const source of [home, history, profile, resume, progress]) {
    assert.match(source, /\.from\("practice_audio_progress"\)/);
    assert.doesNotMatch(source, /createServiceRoleClient/);
  }
}

await testProgressHelpers();
testAccessDecisions();
testSourceContracts();

console.log("practice-audio-progress-security-unit: ok");
