#!/usr/bin/env node
/**
 * Paid Audiocourse storefront preview: configured L1 30–90s clip only.
 * No full-audio fallback, no L2 leak, no public lesson list.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { chooseCatalogPreviewAudioRow } from "../src/lib/catalog/catalog-preview-audio-choice";
import {
  collectCourseLevel1AudioItemIds,
  isCourseLessonEligibleForStorefrontPreview,
  isCourseStorefrontPreviewAudioReady,
  isCourseStorefrontPreviewClipEligible,
} from "../src/lib/course-content/storefront-preview";
import {
  parseCourseStorefrontPreviewWrite,
  resolveCourseStorefrontPreviewDto,
} from "../src/lib/author-products/course-storefront-preview";
import type { CourseBuilderLessonDto } from "../src/lib/author-products/course-builder-shared";
import { resolveListenApiDecision } from "../src/lib/listen/preview-access";
import {
  COMPATIBILITY_FALLBACK_PREVIEW_DURATION_MS,
  PREVIEW_DURATION_MAX_MS,
  PREVIEW_DURATION_MIN_MS,
  resolvePlaybackPreviewWindow,
} from "../src/lib/listen/preview-window";
import { shouldLoadPublicAudioItemsOnProductPage } from "../src/lib/products/public-audio-items";
import { PREVIEW_ACTION_LABEL } from "../src/lib/ui/action-labels";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath: string): string {
  return readFileSync(join(root, relativePath), "utf8");
}

const L1_AUDIO = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const L2_AUDIO = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function configuredRow(id: string) {
  return {
    id,
    is_preview: true,
    preview_start_ms: 15_000,
    preview_end_ms: 75_000,
  };
}

function unconfiguredRow(id: string, isPreview = true) {
  return {
    id,
    is_preview: isPreview,
    preview_start_ms: null,
    preview_end_ms: null,
  };
}

function testLevel1Eligibility() {
  assert.equal(isCourseLessonEligibleForStorefrontPreview(1), true);
  assert.equal(isCourseLessonEligibleForStorefrontPreview(null), true);
  assert.equal(isCourseLessonEligibleForStorefrontPreview(2), false);
  assert.equal(isCourseLessonEligibleForStorefrontPreview(3), false);

  const ids = collectCourseLevel1AudioItemIds([
    {
      required_access_level: 1,
      blocks: [
        { type: "audio", asset_id: L1_AUDIO },
        { type: "file", asset_id: "file-1" },
      ],
    },
    {
      required_access_level: 2,
      blocks: [{ type: "audio", asset_id: L2_AUDIO }],
    },
  ]);

  assert.equal(ids.has(L1_AUDIO), true);
  assert.equal(ids.has(L2_AUDIO), false);
}

function testConfiguredL1PreviewSucceeds() {
  const chosen = chooseCatalogPreviewAudioRow(
    [configuredRow(L1_AUDIO), configuredRow(L2_AUDIO)],
    {
      isCourse: true,
      allowedAudioItemIds: new Set([L1_AUDIO]),
    },
  );
  assert.equal(chosen.ok, true);
  if (chosen.ok) {
    assert.equal(chosen.row?.id, L1_AUDIO);
  }

  assert.equal(
    isCourseStorefrontPreviewClipEligible(
      L1_AUDIO,
      configuredRow(L1_AUDIO),
      new Set([L1_AUDIO]),
    ),
    true,
  );

  const window = resolvePlaybackPreviewWindow({
    previewStartMs: 15_000,
    previewEndMs: 75_000,
  });
  assert.equal(window.source, "configured");
  assert.equal(window.needsSetup, false);
  const duration = window.endMs - window.startMs;
  assert.ok(duration >= PREVIEW_DURATION_MIN_MS);
  assert.ok(duration <= PREVIEW_DURATION_MAX_MS);
}

function testDurationContract() {
  const tooShort = parseCourseStorefrontPreviewWrite(
    {
      audio_item_id: L1_AUDIO,
      preview_start_ms: 0,
      preview_end_ms: 20_000,
    },
    new Set([L1_AUDIO]),
  );
  assert.equal(tooShort.ok, false);
  if (!tooShort.ok) {
    assert.equal(tooShort.reason, "preview_duration_out_of_range");
  }

  const tooLong = parseCourseStorefrontPreviewWrite(
    {
      audio_item_id: L1_AUDIO,
      preview_start_ms: 0,
      preview_end_ms: 120_000,
    },
    new Set([L1_AUDIO]),
  );
  assert.equal(tooLong.ok, false);

  const ok = parseCourseStorefrontPreviewWrite(
    {
      audio_item_id: L1_AUDIO,
      preview_start_ms: 0,
      preview_end_ms: 60_000,
    },
    new Set([L1_AUDIO]),
  );
  assert.equal(ok.ok, true);
}

function testL2NeverSelected() {
  const l2Only = chooseCatalogPreviewAudioRow([configuredRow(L2_AUDIO)], {
    isCourse: true,
    allowedAudioItemIds: new Set([L1_AUDIO]),
  });
  assert.equal(l2Only.ok, false, "L2 audio is never selected for storefront preview");

  const requestedL2 = chooseCatalogPreviewAudioRow(
    [configuredRow(L1_AUDIO), configuredRow(L2_AUDIO)],
    {
      isCourse: true,
      allowedAudioItemIds: new Set([L1_AUDIO]),
      audioItemId: L2_AUDIO,
    },
  );
  assert.equal(requestedL2.ok, false, "requested L2 id fails closed");

  assert.equal(
    isCourseStorefrontPreviewClipEligible(
      L2_AUDIO,
      configuredRow(L2_AUDIO),
      new Set([L1_AUDIO]),
    ),
    false,
  );
}

function testAccidentalL2PreviewMarkIgnored() {
  const accidental = chooseCatalogPreviewAudioRow(
    [
      unconfiguredRow(L1_AUDIO, false),
      {
        id: L2_AUDIO,
        is_preview: true,
        preview_start_ms: 10_000,
        preview_end_ms: 70_000,
      },
    ],
    {
      isCourse: true,
      allowedAudioItemIds: new Set([L1_AUDIO]),
    },
  );
  assert.equal(
    accidental.ok,
    false,
    "L2 marked preview / windowed is ignored when only L1 is allowed",
  );
}

function testMissingConfigFailsClosed() {
  const missingAllowList = chooseCatalogPreviewAudioRow(
    [configuredRow(L1_AUDIO)],
    { isCourse: true },
  );
  assert.equal(missingAllowList.ok, false, "missing L1 allow-list fails closed");

  const noWindow = chooseCatalogPreviewAudioRow([unconfiguredRow(L1_AUDIO)], {
    isCourse: true,
    allowedAudioItemIds: new Set([L1_AUDIO]),
  });
  assert.equal(noWindow.ok, false, "course has no first-track fallback");

  const fallback = resolvePlaybackPreviewWindow({
    previewStartMs: null,
    previewEndMs: null,
  });
  assert.equal(fallback.source, "compatibility_fallback");
  assert.equal(fallback.endMs, COMPATIBILITY_FALLBACK_PREVIEW_DURATION_MS);

  const playLoader = read("src/lib/catalog/catalog-playback.ts");
  assert.match(playLoader, /previewWindow\.source !== "configured"/);
  assert.doesNotMatch(
    playLoader,
    /isCourse[\s\S]{0,180}COMPATIBILITY_FALLBACK/,
    "course preview does not apply the old 60s compatibility fallback",
  );
}

function testListenApiDecisions() {
  const anonymousPreview = resolveListenApiDecision({
    purpose: "preview_audio",
    isCourse: true,
    courseAllowed: false,
    canListen: false,
    accessReason: "payment_required",
    catalogPreviewEligible: true,
    listenAccess: null,
  });
  assert.equal(anonymousPreview.ok, true);
  if (anonymousPreview.ok) {
    assert.equal(anonymousPreview.access.mode, "catalog_preview");
  }

  const unpublished = resolveListenApiDecision({
    purpose: "preview_audio",
    isCourse: true,
    courseAllowed: false,
    canListen: false,
    accessReason: "not_authenticated",
    catalogPreviewEligible: false,
    listenAccess: null,
  });
  assert.equal(unpublished.ok, false, "unpublished course has no public preview");

  const fullAudio = resolveListenApiDecision({
    purpose: "full_audio",
    isCourse: true,
    courseAllowed: false,
    canListen: false,
    accessReason: "payment_required",
    catalogPreviewEligible: true,
    listenAccess: null,
  });
  assert.equal(fullAudio.ok, false);

  const entitledL1 = resolveListenApiDecision({
    purpose: "full_audio",
    isCourse: true,
    courseAllowed: true,
    canListen: false,
    accessReason: "purchased",
    catalogPreviewEligible: true,
    listenAccess: { mode: "entitled" },
  });
  assert.equal(entitledL1.ok, true);
  if (entitledL1.ok) {
    assert.equal(entitledL1.access.mode, "entitled");
  }

  const ordinaryPaid = resolveListenApiDecision({
    purpose: "preview_audio",
    isCourse: false,
    courseAllowed: false,
    canListen: false,
    accessReason: "payment_required",
    catalogPreviewEligible: true,
    listenAccess: null,
  });
  assert.equal(ordinaryPaid.ok, true);
  if (ordinaryPaid.ok) {
    assert.equal(ordinaryPaid.access.mode, "catalog_preview");
  }

  const freePractice = resolveListenApiDecision({
    purpose: "full_audio",
    isCourse: false,
    courseAllowed: false,
    canListen: true,
    accessReason: "free",
    catalogPreviewEligible: true,
    listenAccess: { mode: "entitled" },
  });
  assert.equal(freePractice.ok, true);
  if (freePractice.ok) {
    assert.equal(freePractice.access.mode, "entitled");
  }
}

function lessonWithAudio(input: {
  lessonId: string;
  title: string;
  requiredAccessLevel: number;
  audioId: string;
  status: string;
  previewStartMs?: number | null;
  previewEndMs?: number | null;
}): CourseBuilderLessonDto {
  return {
    id: input.lessonId,
    publication_id: "course-1",
    title: input.title,
    position: 0,
    required_access_level: input.requiredAccessLevel,
    created_at: "",
    updated_at: "",
    blocks: [
      {
        id: `block-${input.audioId}`,
        lesson_id: input.lessonId,
        type: "audio",
        position: 0,
        asset_id: input.audioId,
        payload: null,
        created_at: "",
        updated_at: "",
        audio: {
          id: input.audioId,
          title: input.title,
          duration_seconds: 180,
          original_file_name: "a.mp3",
          audio_path: "practices/c/a.mp3",
          preview_start_ms: input.previewStartMs ?? null,
          preview_end_ms: input.previewEndMs ?? null,
          status: input.status,
        },
        file: null,
      },
    ],
  };
}

function testAuthorConfigAndPdp() {
  const dto = resolveCourseStorefrontPreviewDto([
    lessonWithAudio({
      lessonId: "lesson-1",
      title: "Работа с собой",
      requiredAccessLevel: 1,
      audioId: L1_AUDIO,
      status: "published",
      previewStartMs: 0,
      previewEndMs: 60_000,
    }),
    lessonWithAudio({
      lessonId: "lesson-2",
      title: "Работа с другими",
      requiredAccessLevel: 2,
      audioId: L2_AUDIO,
      status: "published",
      previewStartMs: 0,
      previewEndMs: 60_000,
    }),
  ]);

  assert.equal(dto.candidates.length, 1);
  assert.equal(dto.candidates[0]?.audioItemId, L1_AUDIO);
  assert.equal(dto.audio_item_id, L1_AUDIO);

  const rejectL2 = parseCourseStorefrontPreviewWrite(
    {
      audio_item_id: L2_AUDIO,
      preview_start_ms: 0,
      preview_end_ms: 60_000,
    },
    new Set(dto.candidates.map((item) => item.audioItemId)),
  );
  assert.equal(rejectL2.ok, false);
  if (!rejectL2.ok) {
    assert.equal(rejectL2.reason, "storefront_preview_not_playable");
  }

  assert.equal(PREVIEW_ACTION_LABEL, "Прослушать фрагмент");
  assert.equal(
    shouldLoadPublicAudioItemsOnProductPage("course", "practice"),
    false,
    "course PDP still does not flatten lessons into publicAudioItems",
  );
}

function testPublishedLifecyclePreviewSucceeds() {
  assert.equal(
    isCourseStorefrontPreviewAudioReady({
      audio_path: "practices/c/a.mp3",
      status: "published",
    }),
    true,
    "real post-publish course audio is published",
  );

  const dto = resolveCourseStorefrontPreviewDto([
    lessonWithAudio({
      lessonId: "lesson-1",
      title: "Активация",
      requiredAccessLevel: 1,
      audioId: L1_AUDIO,
      status: "published",
      previewStartMs: 0,
      previewEndMs: 60_000,
    }),
  ]);
  assert.equal(dto.candidates.length, 1);
  assert.equal(dto.audio_item_id, L1_AUDIO);

  const chosen = chooseCatalogPreviewAudioRow(
    [
      {
        id: L1_AUDIO,
        status: "published",
        is_preview: true,
        preview_start_ms: 0,
        preview_end_ms: 60_000,
      },
    ],
    {
      isCourse: true,
      allowedAudioItemIds: new Set([L1_AUDIO]),
    },
  );
  assert.equal(chosen.ok, true);
  if (chosen.ok) {
    assert.equal(chosen.row?.id, L1_AUDIO);
  }

  const window = resolvePlaybackPreviewWindow({
    previewStartMs: 0,
    previewEndMs: 60_000,
  });
  assert.equal(window.source, "configured");
  assert.equal(window.startMs, 0);
  assert.equal(window.endMs, 60_000);

  const anonymous = resolveListenApiDecision({
    purpose: "preview_audio",
    isCourse: true,
    courseAllowed: false,
    canListen: false,
    accessReason: "payment_required",
    catalogPreviewEligible: true,
    listenAccess: null,
  });
  assert.equal(anonymous.ok, true);
  if (anonymous.ok) {
    assert.equal(anonymous.access.mode, "catalog_preview");
    assert.notEqual(anonymous.access.mode, "entitled");
  }
}

function testDraftL1CannotBeSaved() {
  assert.equal(
    isCourseStorefrontPreviewAudioReady({
      audio_path: "practices/c/a.mp3",
      status: "draft",
    }),
    false,
  );

  const dto = resolveCourseStorefrontPreviewDto([
    lessonWithAudio({
      lessonId: "lesson-1",
      title: "Черновик L1",
      requiredAccessLevel: 1,
      audioId: L1_AUDIO,
      status: "draft",
      previewStartMs: 0,
      previewEndMs: 60_000,
    }),
  ]);
  assert.equal(dto.candidates.length, 0);
  assert.equal(dto.audio_item_id, null);

  const saved = parseCourseStorefrontPreviewWrite(
    {
      audio_item_id: L1_AUDIO,
      preview_start_ms: 0,
      preview_end_ms: 60_000,
    },
    new Set(dto.candidates.map((item) => item.audioItemId)),
  );
  assert.equal(saved.ok, false, "draft L1 cannot be saved as storefront preview");
  if (!saved.ok) {
    assert.equal(saved.reason, "storefront_preview_not_playable");
  }
}

function testPreviewWriteParser() {
  const candidates = new Set([L1_AUDIO]);

  for (const body of [null, "x", 1, [], [{ audio_item_id: L1_AUDIO }]]) {
    const parsed = parseCourseStorefrontPreviewWrite(body, candidates);
    assert.equal(parsed.ok, false, `${JSON.stringify(body)} is invalid_request`);
    if (!parsed.ok) {
      assert.equal(parsed.reason, "invalid_request");
    }
  }

  const clear = parseCourseStorefrontPreviewWrite(
    { audio_item_id: null, preview_start_ms: null, preview_end_ms: null },
    candidates,
  );
  assert.equal(clear.ok, true);
  if (clear.ok) {
    assert.equal(clear.clear, true);
  }

  const emptyClear = parseCourseStorefrontPreviewWrite({ audio_item_id: "" }, candidates);
  assert.equal(emptyClear.ok, true);
  if (emptyClear.ok) {
    assert.equal(emptyClear.clear, true);
  }
}

function testSourceContracts() {
  const playLoader = read("src/lib/catalog/catalog-playback.ts");
  const signedAudio = read("src/lib/listen/signed-audio.ts");
  const clipResponse = read("src/lib/listen/serve-preview-clip-response.ts");
  const clip = read("src/lib/listen/serve-preview-clip.ts");
  const builder = read("src/components/author-dashboard/AuthorCourseBuilder.tsx");
  const route = read(
    "src/app/api/author/products/[id]/course/storefront-preview/route.ts",
  );
  const audioPatch = read("src/app/api/author/products/[id]/audio/[audioId]/route.ts");
  const pdp = read("src/components/products/practice-page/PracticePageParts.tsx");
  const publicAudio = read("src/lib/products/public-audio-items.ts");

  assert.match(playLoader, /listCourseStorefrontPreviewAudioItemIds/);
  assert.match(playLoader, /allowedAudioItemIds/);
  assert.match(
    playLoader,
    /\.eq\("status", "published"\)/,
    "catalog preview still reads only published audio_items",
  );
  assert.match(
    signedAudio,
    /courseAudio\.status !== "published"/,
    "course signed preview still forbids unpublished lesson audio",
  );
  assert.match(
    read("src/lib/author-products/course-storefront-preview.ts"),
    /isCourseStorefrontPreviewAudioReady/,
  );
  assert.match(
    read("src/lib/author-products/course-storefront-preview.ts"),
    /Array\.isArray\(body\)/,
    "top-level arrays are invalid_request, not an implicit clear",
  );
  assert.match(
    read("src/lib/author-products/course-builder.ts"),
    /status: "draft"/,
    "new course lesson audio is created as draft",
  );
  assert.match(
    read("supabase/migrations/20260902120200_author_support_mode.sql"),
    /UPDATE public\.audio_items[\s\S]+SET status = 'published'/,
    "publish_audio_product publishes every audio_item of the practice",
  );
  assert.match(signedAudio, /isCourse && access.mode === "catalog_preview"/);
  assert.match(signedAudio, /isCourseStorefrontPreviewClipEligible/);
  assert.match(signedAudio, /canPlayCourseAudioItem/);
  assert.match(clipResponse, /requireConfiguredWindow: isCourse/);
  assert.match(clip, /requireConfiguredWindow/);
  assert.match(builder, /data-author-course-storefront-preview/);
  assert.match(builder, /course\/storefront-preview/);
  assert.match(route, /requirePracticeMutationAccess/);
  assert.doesNotMatch(route, /requireCourseBuilderMutationAccess/);
  assert.match(audioPatch, /validateAudioPreviewWindow/);
  assert.match(pdp, /PREVIEW_ACTION_LABEL/);
  assert.match(pdp, /kind === "buy"/);
  assert.match(publicAudio, /shouldLoadPublicAudioItemsOnProductPage/);
  assert.equal(
    existsSync(
      join(root, "src/app/api/author/products/[id]/course/storefront-preview/route.ts"),
    ),
    true,
  );
}

testLevel1Eligibility();
testConfiguredL1PreviewSucceeds();
testDurationContract();
testL2NeverSelected();
testAccidentalL2PreviewMarkIgnored();
testMissingConfigFailsClosed();
testListenApiDecisions();
testAuthorConfigAndPdp();
testPublishedLifecyclePreviewSucceeds();
testDraftL1CannotBeSaved();
testPreviewWriteParser();
testSourceContracts();

console.log("course-storefront-preview-unit: ok");
