#!/usr/bin/env node
import { readFileSync } from "node:fs";

import {
  DEFAULT_LISTENING_NOTICE_TEXT,
  DEFAULT_LISTENING_NOTICE_TITLE,
  resolveListeningNotice,
  resolvePublicListeningNotice,
  shouldShowListeningNoticeForPublication,
} from "../src/lib/products/listening-notice.ts";
import { shouldShowPracticeListeningNotice } from "../src/lib/author-products/course-builder-shared.ts";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function read(path) {
  return readFileSync(path, "utf8");
}

function wouldRenderListeningNoticeCard(notice) {
  return notice != null;
}

function testDefaultLegacyProduct() {
  const notice = resolveListeningNotice({});
  assert(notice !== null, "legacy product shows default notice");
  assert(
    notice.title === DEFAULT_LISTENING_NOTICE_TITLE,
    "legacy default title",
  );
  assert(notice.text === DEFAULT_LISTENING_NOTICE_TEXT, "legacy default text");
}

function testCustomText() {
  const notice = resolveListeningNotice({
    listening_notice_enabled: true,
    listening_notice_title: "Перед лекцией",
    listening_notice_text: "Строка 1\n\nСтрока 2",
  });
  assert(notice?.title === "Перед лекцией", "custom title");
  assert(notice?.text === "Строка 1\n\nСтрока 2", "custom text preserves breaks");
}

function testDisabled() {
  assert(
    resolveListeningNotice({ listening_notice_enabled: false }) === null,
    "disabled hides card",
  );
}

function testEmptyTextDoesNotRender() {
  assert(
    resolveListeningNotice({
      listening_notice_enabled: true,
      listening_notice_title: "Заголовок",
      listening_notice_text: "   \n  ",
    }) === null,
    "whitespace-only text hides card",
  );
}

function testEmptyTitleUsesDefault() {
  const notice = resolveListeningNotice({
    listening_notice_enabled: true,
    listening_notice_title: "   ",
    listening_notice_text: "Есть текст",
  });
  assert(
    notice?.title === DEFAULT_LISTENING_NOTICE_TITLE,
    "empty title falls back to default",
  );
}

function testCourseEnabledDoesNotRender() {
  assert(
    shouldShowListeningNoticeForPublication("course", "practice") === false,
    "course publication hides notice",
  );
  const notice = resolvePublicListeningNotice({
    publication_class: "course",
    product_kind: "practice",
    listening_notice_enabled: true,
  });
  assert(notice === null, "course + enabled=true => notice NOT resolved");
  assert(
    wouldRenderListeningNoticeCard(notice) === false,
    "course + enabled=true => notice NOT rendered",
  );
}

function testCourseCustomNoticeDoesNotRender() {
  const notice = resolvePublicListeningNotice({
    publication_class: "course",
    product_kind: "practice",
    listening_notice_enabled: true,
    listening_notice_title: "Перед курсом",
    listening_notice_text: "Кастомный текст для курса",
  });
  assert(notice === null, "course + custom notice still NOT resolved");
  assert(
    wouldRenderListeningNoticeCard(notice) === false,
    "course + custom notice still NOT rendered",
  );
}

function testPracticeEnabledRenders() {
  assert(
    shouldShowListeningNoticeForPublication("practice", "practice") === true,
    "practice publication allows notice",
  );
  const notice = resolvePublicListeningNotice({
    publication_class: "practice",
    product_kind: "practice",
    listening_notice_enabled: true,
    listening_notice_title: "Перед практикой",
    listening_notice_text: "Кастомный текст практики",
  });
  assert(notice !== null, "practice + enabled=true => notice resolved");
  assert(notice.title === "Перед практикой", "practice keeps custom title");
  assert(notice.text === "Кастомный текст практики", "practice keeps custom text");
  assert(
    wouldRenderListeningNoticeCard(notice) === true,
    "practice + enabled=true => notice rendered",
  );
}

function testPracticeDisabledDoesNotRender() {
  const notice = resolvePublicListeningNotice({
    publication_class: "practice",
    product_kind: "practice",
    listening_notice_enabled: false,
    listening_notice_title: "Перед практикой",
    listening_notice_text: "Кастомный текст практики",
  });
  assert(notice === null, "practice + enabled=false => notice NOT resolved");
  assert(
    wouldRenderListeningNoticeCard(notice) === false,
    "practice + enabled=false => notice NOT rendered",
  );
}

function testAudiobookUnchanged() {
  assert(
    shouldShowListeningNoticeForPublication("audiobook", "practice") === true,
    "audiobook publication still allows notice",
  );
  const notice = resolvePublicListeningNotice({
    publication_class: "audiobook",
    product_kind: "practice",
    listening_notice_enabled: true,
  });
  assert(notice !== null, "audiobook + enabled=true still resolves notice");
  assert(
    resolvePublicListeningNotice({
      publication_class: "audiobook",
      product_kind: "practice",
      listening_notice_enabled: false,
    }) === null,
    "audiobook + enabled=false still hides notice",
  );
}

function testMusicAndAudioPostUnchanged() {
  const music = resolvePublicListeningNotice({
    publication_class: "release",
    product_kind: "music",
    listening_notice_enabled: true,
  });
  assert(music !== null, "music + enabled=true still resolves notice");
  assert(
    resolvePublicListeningNotice({
      publication_class: "release",
      product_kind: "music",
      listening_notice_enabled: false,
    }) === null,
    "music + enabled=false still hides notice",
  );

  const post = resolvePublicListeningNotice({
    publication_class: "post",
    product_kind: "audio_post",
    listening_notice_enabled: true,
  });
  assert(post !== null, "audio post + enabled=true still resolves notice");
}

function testEditorReusesSharedPredicate() {
  assert(
    shouldShowPracticeListeningNotice("course", "practice") === false,
    "editor hides listening notice for course",
  );
  assert(
    shouldShowPracticeListeningNotice("practice", "practice") === true,
    "editor still shows listening notice for practice",
  );
  assert(
    shouldShowPracticeListeningNotice("audiobook", "practice") === true,
    "editor still shows listening notice for audiobook",
  );

  const shared = read("src/lib/author-products/course-builder-shared.ts");
  assert(
    shared.includes("shouldShowListeningNoticeForPublication"),
    "editor predicate reuses the shared publication-class gate",
  );
  assert(
    !/normalizeProductKind\(productKind\) === PRODUCT_KIND\.PRACTICE &&\s*!isCoursePublication\(/.test(
      shared,
    ),
    "editor must not duplicate the course publication condition",
  );
}

function testDesktopMobileCoursePdpAbsent() {
  const courseNotice = resolvePublicListeningNotice({
    publication_class: "course",
    product_kind: "practice",
    listening_notice_enabled: true,
    listening_notice_title: "Перед курсом",
    listening_notice_text: "Не должно появиться",
  });
  assert(
    wouldRenderListeningNoticeCard(courseNotice) === false,
    "course view-model notice is null for both desktop and mobile PDP",
  );

  const practiceContent = read(
    "src/components/products/practice-page/PracticePageContent.tsx",
  );

  assert(
    practiceContent.includes("ListeningNoticeCard"),
    "practice PDP still uses shared card",
  );
  assert(
    (practiceContent.match(/<ListeningNoticeCard/g) || []).length === 1,
    "ONE ListeningNoticeCard mount",
  );
  assert(
    /\{listeningNotice \? \(/.test(practiceContent),
    "practice PDP renders card only when view-model notice is set",
  );
  assert(
    !practiceContent.includes("resolveListeningNotice") &&
      !practiceContent.includes("shouldShowListeningNoticeForPublication"),
    "practice PDP does not copy the publication-class rule",
  );
}

function testListenRouteUsesSharedGate() {
  const listenShared = read("src/lib/listen/page-shared.tsx");
  const listenMobile = read("src/components/audio/ListenPlayerMobile.tsx");
  const listenDesktop = read("src/components/audio/ListenPlayerDesktop.tsx");

  assert(
    listenShared.includes("resolvePublicListeningNotice"),
    "listen route uses the public publication-class gate",
  );
  assert(
    listenShared.includes("import { resolvePublicListeningNotice }"),
    "listen route imports the gated public resolver",
  );
  assert(
    !listenShared.includes("import { resolveListeningNotice }"),
    "listen route must not import the ungated data resolver",
  );
  assert(
    /\{listeningNotice \? \(/.test(listenMobile),
    "listen mobile renders card only when notice is set",
  );
  assert(
    /\{listeningNotice \? \(/.test(listenDesktop),
    "listen desktop renders notice only when notice is set",
  );
}

function testWiring() {
  const migration = read(
    "supabase/migrations/20260718220000_practice_listening_notice.sql",
  );
  assert(
    migration.includes("listening_notice_enabled"),
    "migration adds enabled column",
  );
  assert(
    migration.includes("listening_notice_title"),
    "migration adds title column",
  );
  assert(
    migration.includes("listening_notice_text"),
    "migration adds text column",
  );

  const route = read("src/app/api/author/products/[id]/route.ts");
  assert(
    route.includes("listening_notice_enabled"),
    "PATCH route handles enabled flag",
  );

  const form = read("src/components/author-dashboard/AuthorProductForm.tsx");
  assert(
    form.includes("Рекомендации перед прослушиванием"),
    "author form section present",
  );
  assert(
    form.includes("Вернуть стандартный текст"),
    "reset to default control present",
  );

  const practicePage = read(
    "src/app/(platform)/(listener)/practice/[...segments]/page.tsx",
  );
  const practiceContentPage = read(
    "src/components/products/practice-page/PracticePageContent.tsx",
  );
  assert(
    practiceContentPage.includes("ListeningNoticeCard"),
    "practice page uses shared card",
  );
  assert(
    practicePage.includes("resolvePublicListeningNotice"),
    "practice PDP uses the public publication-class gate",
  );
  assert(
    practicePage.includes("import { resolvePublicListeningNotice }"),
    "practice PDP imports the gated public resolver",
  );
  assert(
    !practicePage.includes("import { resolveListeningNotice }"),
    "practice PDP must not import the ungated data resolver",
  );
  assert(
    !practicePage.includes("Выберите спokойное"),
    "practice page no hardcoded notice text",
  );

  const listenPlayerShared = read(
    "src/components/audio/listen-player-shared.tsx",
  );
  assert(
    listenPlayerShared.includes("listeningNotice"),
    "listen player accepts notice prop",
  );
  assert(
    !listenPlayerShared.includes("Выберите спокойное и безопасное место."),
    "listen player no hardcoded notice text",
  );
}

testDefaultLegacyProduct();
testCustomText();
testDisabled();
testEmptyTextDoesNotRender();
testEmptyTitleUsesDefault();
testCourseEnabledDoesNotRender();
testCourseCustomNoticeDoesNotRender();
testPracticeEnabledRenders();
testPracticeDisabledDoesNotRender();
testAudiobookUnchanged();
testMusicAndAudioPostUnchanged();
testEditorReusesSharedPredicate();
testDesktopMobileCoursePdpAbsent();
testListenRouteUsesSharedGate();
testWiring();

console.log("listening-notice-unit: ok");
