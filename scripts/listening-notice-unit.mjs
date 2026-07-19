#!/usr/bin/env node
import { readFileSync } from "node:fs";

import {
  DEFAULT_LISTENING_NOTICE_TEXT,
  DEFAULT_LISTENING_NOTICE_TITLE,
  resolveListeningNotice,
} from "../src/lib/products/listening-notice.ts";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function read(path) {
  return readFileSync(path, "utf8");
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

  const practicePage = read("src/app/practice/[...segments]/page.tsx");
  assert(
    practicePage.includes("ListeningNoticeCard"),
    "practice page uses shared card",
  );
  assert(
    !practicePage.includes("Выберите спokойное"),
    "practice page no hardcoded notice text",
  );

  const audioPlayer = read("src/components/audio/AudioPlayer.tsx");
  assert(
    audioPlayer.includes("listeningNotice"),
    "audio player accepts notice prop",
  );
  assert(
    !audioPlayer.includes("Выберите спокойное и безопасное место."),
    "audio player no hardcoded notice text",
  );
}

testDefaultLegacyProduct();
testCustomText();
testDisabled();
testEmptyTextDoesNotRender();
testEmptyTitleUsesDefault();
testWiring();

console.log("listening-notice-unit: ok");
