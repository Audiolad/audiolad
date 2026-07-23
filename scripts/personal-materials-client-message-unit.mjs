#!/usr/bin/env node
/**
 * Unit checks for personal materials client delivery message UX.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  DEFAULT_CLIENT_MESSAGE_TEMPLATE,
  normalizeStoredClientMessageTemplate,
  renderClientMessageTemplate,
  resolveClientMessageTemplate,
  resolveClientNameForMessage,
  resolveContentActionForMessage,
  scrollElementIntoView,
  validateClientMessageTemplate,
} from "../src/lib/personal-materials/client-message-template.ts";
import { copyTextToClipboard } from "../src/lib/personal-materials/client/clipboard.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath) {
  return readFileSync(path.join(ROOT, relativePath), "utf8");
}

function testLinkBlockPlacement() {
  const editor = read(
    "src/components/author-dashboard/personal-materials/AuthorDiagnosticsEditorClient.tsx",
  );
  const formSectionMarker = editor.indexOf("<AuthorDiagnosticsFormFields");
  const linkPanelMarker = editor.indexOf("<AuthorDiagnosticsOneTimeLinkPanel");
  const audioUploadMarker = editor.indexOf("<AuthorDiagnosticsAudioUpload");
  const accessSectionMarker = editor.indexOf("Управление доступом");
  const templateEditorMarker = editor.indexOf("<AuthorDiagnosticsMessageTemplateEditor");

  assert.ok(formSectionMarker > -1, "form fields present");
  assert.ok(linkPanelMarker > formSectionMarker, "link panel after form fields");
  assert.ok(linkPanelMarker > audioUploadMarker, "link panel after audio upload");
  assert.ok(linkPanelMarker > accessSectionMarker, "link panel after access controls");
  assert.ok(templateEditorMarker > -1, "template editor present");
  assert.ok(templateEditorMarker < linkPanelMarker, "template editor before link result");
}

function testScrollAfterLinkCreation() {
  const editor = read(
    "src/components/author-dashboard/personal-materials/AuthorDiagnosticsEditorClient.tsx",
  );
  const templateLib = read("src/lib/personal-materials/client-message-template.ts");

  assert.match(editor, /linkResultRef/, "link result ref");
  assert.match(editor, /scrollElementIntoView\(linkResultRef\.current\)/, "scroll to result");
  assert.match(templateLib, /prefers-reduced-motion/, "respect reduced motion");
  assert.match(templateLib, /scrollIntoView/, "uses scrollIntoView");
  assert.doesNotMatch(editor, /window\.scrollTo/, "no hard-coded scroll coordinates");
}

function testTemplateSubstitution() {
  const message = renderClientMessageTemplate(null, {
    clientName: "Анна",
    publicUrl: "https://audiolad.ru/d/test-token",
    hasAudio: true,
    hasPdf: false,
  });

  assert.match(message, /^Анна, ваша диагностика готова:/);
  assert.match(message, /https:\/\/audiolad\.ru\/d\/test-token/);
  assert.match(message, /После прослушивания её можно сохранить/);
  assert.match(message, /Ждём обратную связь 🙏/);
  assert.equal(resolveClientNameForMessage("Анна", "Иванова"), "Анна");
  assert.equal(resolveClientNameForMessage("", "Иванова"), "Иванова");
}

function testContentActionVariants() {
  assert.equal(
    resolveContentActionForMessage({ hasAudio: true, hasPdf: false }),
    "прослушивания",
  );
  assert.equal(resolveContentActionForMessage({ hasAudio: false, hasPdf: true }), "просмотра");
  assert.equal(
    resolveContentActionForMessage({ hasAudio: true, hasPdf: true }),
    "прослушивания и просмотра",
  );
  assert.equal(
    resolveContentActionForMessage({ hasAudio: false, hasPdf: false }),
    "ознакомления",
  );

  const audioMessage = renderClientMessageTemplate(null, {
    clientName: "Anna",
    publicUrl: "https://audiolad.ru/d/a",
    hasAudio: true,
    hasPdf: false,
  });
  assert.match(audioMessage, /После прослушивания её можно сохранить/);

  const pdfMessage = renderClientMessageTemplate(null, {
    clientName: "Anna",
    publicUrl: "https://audiolad.ru/d/p",
    hasAudio: false,
    hasPdf: true,
  });
  assert.match(pdfMessage, /После просмотра её можно сохранить/);

  const bothMessage = renderClientMessageTemplate(null, {
    clientName: "Anna",
    publicUrl: "https://audiolad.ru/d/b",
    hasAudio: true,
    hasPdf: true,
  });
  assert.match(bothMessage, /После прослушивания и просмотра её можно сохранить/);

  const neutralMessage = renderClientMessageTemplate(null, {
    clientName: "Anna",
    publicUrl: "https://audiolad.ru/d/n",
    hasAudio: false,
    hasPdf: false,
  });
  assert.match(neutralMessage, /После ознакомления её можно сохранить/);
}

function testCustomTemplateWithContentAction() {
  const custom = "После {contentAction} откройте:\n{publicUrl}";
  const message = renderClientMessageTemplate(custom, {
    clientName: "Olga",
    publicUrl: "https://audiolad.ru/d/new",
    hasAudio: false,
    hasPdf: true,
  });

  assert.equal(message, "После просмотра откройте:\nhttps://audiolad.ru/d/new");
}

function testLegacyTemplateWithoutContentAction() {
  const legacy =
    "{clientName}, ваша диагностика готова:\n{publicUrl}\n\nПосле прослушивания её можно сохранить в личном кабинете.";
  const message = renderClientMessageTemplate(legacy, {
    clientName: "Olga",
    publicUrl: "https://audiolad.ru/d/legacy",
    hasAudio: false,
    hasPdf: true,
  });

  assert.match(message, /После прослушивания её можно сохранить/);
  assert.doesNotMatch(message, /просмотра/);
}

function testRestoreDefaultUsesNullFallback() {
  const templateEditor = read(
    "src/components/author-dashboard/personal-materials/AuthorDiagnosticsMessageTemplateEditor.tsx",
  );

  assert.equal(normalizeStoredClientMessageTemplate("   "), null);
  assert.equal(resolveClientMessageTemplate(null), DEFAULT_CLIENT_MESSAGE_TEMPLATE);
  assert.match(DEFAULT_CLIENT_MESSAGE_TEMPLATE, /{contentAction}/);
  assert.match(templateEditor, /clientMessageTemplate: null/);
  assert.match(templateEditor, /Вернуть стандартный шаблон/);
}

function testCopyPreservesFormatting() {
  const message = renderClientMessageTemplate(DEFAULT_CLIENT_MESSAGE_TEMPLATE, {
    clientName: "Maria",
    publicUrl: "https://example.test/d/abc",
    hasAudio: true,
    hasPdf: false,
  });

  assert.match(message, /\n\nПосле прослушивания её можно сохранить/);
  assert.match(message, /🙏$/);
  assert.doesNotMatch(message, /^\s+Maria/m, "no leading spaces on lines");
}

async function testClipboardFallback() {
  const originalNavigator = globalThis.navigator;
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {},
  });

  try {
    const copied = await copyTextToClipboard("line one\nline two\nhttps://example.test/d/x 🙏");
    assert.equal(typeof copied, "boolean");
  } finally {
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: originalNavigator,
    });
  }
}

function testCustomTemplateApplied() {
  const custom = "Привет, {clientName}!\n{publicUrl}";
  const message = renderClientMessageTemplate(custom, {
    clientName: "Olga",
    publicUrl: "https://audiolad.ru/d/new",
  });

  assert.equal(message, "Привет, Olga!\nhttps://audiolad.ru/d/new");
}

function testFallbackTemplate() {
  assert.equal(resolveClientMessageTemplate(null), DEFAULT_CLIENT_MESSAGE_TEMPLATE);
  assert.equal(resolveClientMessageTemplate("   "), DEFAULT_CLIENT_MESSAGE_TEMPLATE);
}

function testRotateUsesNewUrl() {
  const oldUrl = "https://audiolad.ru/d/old-token";
  const newUrl = "https://audiolad.ru/d/new-token";
  const oldMessage = renderClientMessageTemplate(null, {
    clientName: "Anna",
    publicUrl: oldUrl,
    hasAudio: true,
    hasPdf: false,
  });
  const newMessage = renderClientMessageTemplate(null, {
    clientName: "Anna",
    publicUrl: newUrl,
    hasAudio: true,
    hasPdf: false,
  });

  assert.match(oldMessage, /old-token/);
  assert.doesNotMatch(newMessage, /old-token/);
  assert.match(newMessage, /new-token/);
}

function testWorkspaceScopedSettingsApi() {
  const route = read("src/app/api/author/personal-materials/settings/route.ts");
  const migration = read("supabase/migrations/20260723120000_author_client_message_template.sql");
  const api = read("src/lib/personal-materials/client/api.ts");

  assert.match(route, /author_id/, "settings scoped by author id");
  assert.match(route, /requireAuthorMaterialListAccess/, "membership guard");
  assert.match(migration, /authors[\s\S]*client_message_template/, "template stored on authors");
  assert.match(api, /author_id=\$\{encodeURIComponent\(authorId\)\}/, "client passes author id");
}

function testTemplateValidation() {
  assert.equal(validateClientMessageTemplate("Без ссылки для {clientName}"), "Шаблон должен содержать переменную {publicUrl}.");
  assert.equal(validateClientMessageTemplate("Ссылка: {publicUrl}"), null);
}

function testSecurityNoTokenPersistence() {
  const editor = read(
    "src/components/author-dashboard/personal-materials/AuthorDiagnosticsEditorClient.tsx",
  );
  const messagePanel = read(
    "src/components/author-dashboard/personal-materials/AuthorDiagnosticsClientMessagePanel.tsx",
  );
  const settingsRepo = read("src/lib/personal-materials/server/client-message-settings.ts");

  assert.doesNotMatch(editor, /localStorage/, "editor no localStorage");
  assert.doesNotMatch(messagePanel, /console\.log/, "message panel no logging");
  assert.doesNotMatch(settingsRepo, /accessUrl|rawToken|access_token/, "settings do not store token");
}

function testUiStructure() {
  const messagePanel = read(
    "src/components/author-dashboard/personal-materials/AuthorDiagnosticsClientMessagePanel.tsx",
  );
  const templateEditor = read(
    "src/components/author-dashboard/personal-materials/AuthorDiagnosticsMessageTemplateEditor.tsx",
  );

  assert.match(messagePanel, /Сообщение клиенту/);
  assert.match(messagePanel, /Скопировать сообщение/);
  assert.match(messagePanel, /Сообщение скопировано/);
  assert.match(messagePanel, /min-w-0/);
  assert.match(templateEditor, /Настроить шаблон сообщения/);
  assert.match(templateEditor, /Шаблон сообщения клиенту/);
  assert.match(templateEditor, /Доступные переменные/);
  assert.match(templateEditor, /{contentAction}/);
  assert.match(templateEditor, /Вернуть стандартный шаблон/);
}

function testScrollHelper() {
  let scrolled = false;
  scrollElementIntoView({
    scrollIntoView() {
      scrolled = true;
    },
  });

  assert.equal(scrolled, true);
}

testLinkBlockPlacement();
testScrollAfterLinkCreation();
testTemplateSubstitution();
testContentActionVariants();
testCustomTemplateWithContentAction();
testLegacyTemplateWithoutContentAction();
testRestoreDefaultUsesNullFallback();
testCopyPreservesFormatting();
await testClipboardFallback();
testCustomTemplateApplied();
testFallbackTemplate();
testRotateUsesNewUrl();
testWorkspaceScopedSettingsApi();
testTemplateValidation();
testSecurityNoTokenPersistence();
testUiStructure();
testScrollHelper();

console.log("personal-materials-client-message-unit: PASS");
