#!/usr/bin/env node
/**
 * Author contacts — validation, public mapping, cabinet/public wiring.
 * Safe without database access.
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  MAX_AUTHOR_CONTACTS,
  MAX_AUTHOR_CONTACT_DESCRIPTION_LENGTH,
  AUTHOR_CONTACT_PLATFORMS,
  AUTHOR_CONTACT_STANDARD_ICON_SRC,
  AUTHOR_CONTACT_CUSTOM_ICON_SRC,
} from "../src/lib/authors/constants.ts";
import {
  areAuthorContactDraftsEqual,
  collectAuthorContactSameAs,
  contactsFromProfile,
  draftsToContactPayload,
  resolveAuthorContactIconUrl,
  selectVisibleAuthorContacts,
  toSafeAuthorContactHref,
} from "../src/lib/authors/contacts.ts";
import {
  getAuthorContactDescriptionError,
  normalizeAuthorContactUrl,
  normalizeAuthorContacts,
} from "../src/lib/authors/contacts-validation.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function read(relativePath) {
  return readFileSync(path.join(root, relativePath), "utf8");
}

const TELEGRAM_ID = "11111111-1111-4111-8111-111111111111";
const MAX_ID = "22222222-2222-4222-8222-222222222222";
const CUSTOM_ID = "33333333-3333-4333-8333-333333333333";
const HIDDEN_ID = "44444444-4444-4444-8444-444444444444";

function contactInput(overrides = {}) {
  return {
    id: TELEGRAM_ID,
    platform: "telegram",
    title: "Telegram-канал",
    description: "",
    url: "https://t.me/sergey",
    isVisible: true,
    ...overrides,
  };
}

function testPlatformCatalogIsExtensible() {
  assert(AUTHOR_CONTACT_PLATFORMS.includes("telegram"), "telegram platform");
  assert(AUTHOR_CONTACT_PLATFORMS.includes("max"), "max platform");
  assert(AUTHOR_CONTACT_PLATFORMS.includes("custom"), "custom platform");
  assert(MAX_AUTHOR_CONTACTS === 6, "max 6 contacts");
}

function testUrlValidation() {
  assert(
    normalizeAuthorContactUrl("https://t.me/sergey") === "https://t.me/sergey",
    "https telegram accepted",
  );
  assert(
    normalizeAuthorContactUrl("https://max.ru/sergey")?.startsWith("https://"),
    "https max accepted",
  );
  assert(
    normalizeAuthorContactUrl("mailto:sergey@example.com") ===
      "mailto:sergey@example.com",
    "mailto accepted",
  );
  assert(normalizeAuthorContactUrl("not-a-url") === null, "plain text rejected");
  assert(normalizeAuthorContactUrl("javascript:alert(1)") === null, "javascript rejected");
  assert(normalizeAuthorContactUrl("http://t.me/sergey") === null, "http rejected");
  assert(normalizeAuthorContactUrl("data:text/html,hi") === null, "data rejected");
  assert(normalizeAuthorContactUrl("vbscript:msgbox(1)") === null, "vbscript rejected");
  assert(normalizeAuthorContactUrl("https://user:pass@evil.test") === null, "userinfo rejected");
  assert(normalizeAuthorContactUrl("") === null, "empty rejected");
  assert(toSafeAuthorContactHref("javascript:alert(1)") === null, "public href rejects javascript");
  assert(toSafeAuthorContactHref("data:text/html,hi") === null, "public href rejects data");
  assert(
    toSafeAuthorContactHref("https://t.me/sergey") === "https://t.me/sergey",
    "public href keeps https",
  );
}

function testDescriptionLimit() {
  const exact = "а".repeat(MAX_AUTHOR_CONTACT_DESCRIPTION_LENGTH);
  const tooLong = "а".repeat(MAX_AUTHOR_CONTACT_DESCRIPTION_LENGTH + 1);

  const accepted = normalizeAuthorContacts([
    contactInput({ description: exact }),
  ]);
  assert(accepted?.[0]?.description === exact, "120-char description accepted");
  assert(getAuthorContactDescriptionError(exact) === null, "120 no client error");

  assert(
    normalizeAuthorContacts([contactInput({ description: tooLong })]) === null,
    "121-char description rejected",
  );
  assert(
    getAuthorContactDescriptionError(tooLong)?.includes("120"),
    "121 client error mentions 120",
  );
}

function testNormalizeContactsScenarios() {
  assert(normalizeAuthorContacts([])?.length === 0, "empty list allowed");

  const telegramNoDescription = normalizeAuthorContacts([
    contactInput({ description: "   " }),
  ]);
  assert(telegramNoDescription?.[0]?.description === null, "blank description stored as null");
  assert(telegramNoDescription?.[0]?.platform === "telegram", "telegram kept");

  const telegramWithDescription = normalizeAuthorContacts([
    contactInput({ description: "Новые практики и эфиры" }),
  ]);
  assert(
    telegramWithDescription?.[0]?.description === "Новые практики и эфиры",
    "telegram description kept",
  );

  const maxContact = normalizeAuthorContacts([
    contactInput({
      id: MAX_ID,
      platform: "max",
      title: "MAX-канал",
      url: "https://max.ru/sergey",
    }),
  ]);
  assert(maxContact?.[0]?.platform === "max", "max contact accepted");

  const customContact = normalizeAuthorContacts([
    contactInput({
      id: CUSTOM_ID,
      platform: "custom",
      title: "Мой RuTube",
      url: "https://rutube.ru/channel/1",
      iconUrl: "https://cdn.example/icon.webp",
    }),
  ]);
  assert(customContact?.[0]?.platform === "custom", "custom contact accepted");
  assert(customContact?.[0]?.iconUrl?.includes("icon.webp"), "custom icon url kept");

  const ordered = normalizeAuthorContacts([
    contactInput({ title: "First" }),
    contactInput({
      id: MAX_ID,
      platform: "max",
      title: "Second",
      url: "https://max.ru/a",
    }),
  ]);
  assert(ordered?.[0]?.title === "First", "order preserved 1");
  assert(ordered?.[1]?.title === "Second", "order preserved 2");

  const hidden = normalizeAuthorContacts([
    contactInput({ id: HIDDEN_ID, isVisible: false, title: "Hidden" }),
  ]);
  assert(hidden?.[0]?.isVisible === false, "hidden flag persisted");

  const tooMany = Array.from({ length: 7 }, (_, index) =>
    contactInput({
      id: `55555555-5555-4555-8555-55555555555${index}`,
      title: `Contact ${index}`,
    }),
  );
  assert(normalizeAuthorContacts(tooMany) === null, "7 contacts rejected");
}

function testPublicVisibilityAndEmptyState() {
  const none = selectVisibleAuthorContacts([]);
  assert(none.length === 0, "no contacts → empty public list");

  const mixed = selectVisibleAuthorContacts([
    {
      id: TELEGRAM_ID,
      platform: "telegram",
      title: "Telegram-канал",
      description: "Новые практики",
      url: "https://t.me/sergey",
      iconUrl: null,
      iconPath: null,
      sortOrder: 0,
      isVisible: true,
    },
    {
      id: HIDDEN_ID,
      platform: "max",
      title: "Скрытый MAX",
      description: null,
      url: "https://max.ru/hidden",
      iconUrl: null,
      iconPath: null,
      sortOrder: 1,
      isVisible: false,
    },
  ]);

  assert(mixed.length === 1, "hidden contact omitted from public list");
  assert(mixed[0].title === "Telegram-канал", "visible telegram kept");
  assert(mixed[0].description === "Новые практики", "description kept when present");
  assert(!mixed[0].url.includes("hidden"), "hidden url not leaked");

  const withoutDescription = selectVisibleAuthorContacts([
    {
      id: TELEGRAM_ID,
      platform: "telegram",
      title: "Написать мне в Telegram",
      description: null,
      url: "https://t.me/sergey",
      iconUrl: null,
      iconPath: null,
      sortOrder: 0,
      isVisible: true,
    },
  ]);
  assert(withoutDescription[0].description === null, "empty description stays null");

  const dangerousDropped = selectVisibleAuthorContacts([
    {
      id: CUSTOM_ID,
      platform: "custom",
      title: "Evil",
      description: null,
      url: "javascript:alert(1)",
      iconUrl: null,
      iconPath: null,
      sortOrder: 0,
      isVisible: true,
    },
  ]);
  assert(dangerousDropped.length === 0, "unsafe href never reaches public cards");

  const longTitle = selectVisibleAuthorContacts([
    {
      id: TELEGRAM_ID,
      platform: "telegram",
      title: "Очень длинное название контакта которое должно переноситься на узком экране",
      description: "а".repeat(120),
      url: "https://t.me/sergey",
      iconUrl: null,
      iconPath: null,
      sortOrder: 0,
      isVisible: true,
    },
  ]);
  assert(longTitle[0].description?.length === 120, "exact 120 description kept");
}

function testCabinetPersistRoundtrip() {
  const firstSave = normalizeAuthorContacts([
    contactInput({
      title: "Telegram-канал",
      description: "Новые практики",
      url: "https://t.me/sergey",
      isVisible: true,
    }),
    contactInput({
      id: MAX_ID,
      platform: "max",
      title: "MAX",
      url: "https://max.ru/sergey",
      isVisible: false,
    }),
    contactInput({
      id: CUSTOM_ID,
      platform: "custom",
      title: "RuTube",
      url: "https://rutube.ru/channel/1",
      iconUrl: "https://cdn.example/icon.webp",
      iconPath: "authors/a/contacts/c/lg.webp",
      isVisible: true,
    }),
  ]);

  const drafts = contactsFromProfile(
    firstSave.map((contact, index) => ({
      ...contact,
      sortOrder: index,
    })),
  );
  const reloaded = normalizeAuthorContacts(draftsToContactPayload(drafts));

  assert(reloaded?.length === 3, "reload keeps all contacts");
  assert(reloaded[0].title === "Telegram-канал", "title persists");
  assert(reloaded[0].description === "Новые практики", "description persists");
  assert(reloaded[1].isVisible === false, "hidden flag persists");
  assert(reloaded[2].iconUrl?.includes("icon.webp"), "custom icon persists");
  assert(reloaded[0].url === "https://t.me/sergey", "url persists");
  assert(reloaded.map((item) => item.id).join(",") === firstSave.map((item) => item.id).join(","), "order persists");
}

function testIconsAndSameAs() {
  assert(
    resolveAuthorContactIconUrl("telegram", null) ===
      AUTHOR_CONTACT_STANDARD_ICON_SRC.telegram,
    "telegram standard icon",
  );
  assert(
    resolveAuthorContactIconUrl("max", null) === AUTHOR_CONTACT_STANDARD_ICON_SRC.max,
    "max standard icon",
  );
  assert(
    resolveAuthorContactIconUrl("custom", null) === AUTHOR_CONTACT_CUSTOM_ICON_SRC,
    "custom fallback icon",
  );
  assert(
    resolveAuthorContactIconUrl("telegram", "https://cdn.example/own.webp") ===
      "https://cdn.example/own.webp",
    "uploaded icon overrides standard",
  );

  const sameAs = collectAuthorContactSameAs([
    {
      platform: "telegram",
      platformLabel: "Telegram",
      title: "TG",
      description: null,
      url: "https://t.me/sergey",
      iconUrl: AUTHOR_CONTACT_STANDARD_ICON_SRC.telegram,
      openInNewTab: true,
    },
    {
      platform: "custom",
      platformLabel: "Ссылка",
      title: "Почта",
      description: null,
      url: "mailto:sergey@example.com",
      iconUrl: AUTHOR_CONTACT_CUSTOM_ICON_SRC,
      openInNewTab: false,
    },
  ]);
  assert(sameAs.length === 1, "mailto excluded from sameAs");
  assert(sameAs[0] === "https://t.me/sergey", "https included in sameAs");
}

function testLocalStandardIconsExist() {
  const constants = read("src/lib/authors/constants.ts");

  assert(
    AUTHOR_CONTACT_STANDARD_ICON_SRC.telegram ===
      "/school/messengers/telegram.png",
    "telegram default uses existing school png",
  );
  assert(
    AUTHOR_CONTACT_STANDARD_ICON_SRC.max === "/school/messengers/max.png",
    "max default uses existing school png",
  );
  assert(
    AUTHOR_CONTACT_CUSTOM_ICON_SRC === "/authors/contacts/custom.svg",
    "custom fallback stays local",
  );
  assert(!constants.includes("max-source.png"), "max-source.png is not used");
  assert(
    !constants.includes("/authors/contacts/telegram.svg"),
    "temporary telegram svg is not the default",
  );
  assert(
    !constants.includes("/authors/contacts/max.svg"),
    "temporary max svg is not the default",
  );

  for (const relative of [
    "public/school/messengers/telegram.png",
    "public/school/messengers/max.png",
  ]) {
    assert(existsSync(path.join(root, relative)), `${relative} exists`);
  }

  assert(
    !existsSync(path.join(root, "public/authors/contacts/telegram.svg")),
    "unused telegram svg removed",
  );
  assert(
    !existsSync(path.join(root, "public/authors/contacts/max.svg")),
    "unused max svg removed",
  );

  const customSvg = "public/authors/contacts/custom.svg";
  assert(existsSync(path.join(root, customSvg)), `${customSvg} exists`);
  const svg = read(customSvg);
  assert(svg.includes("<svg"), `${customSvg} is svg`);
  assert(!/https?:\/\/(?!www\.w3\.org)/.test(svg), `${customSvg} has no remote icons`);
  assert(!svg.includes("cdn."), `${customSvg} is local`);
}

function testMigrationAndRls() {
  const migration = read("supabase/migrations/20260829130000_author_contacts.sql");

  assert(migration.includes("CREATE TABLE IF NOT EXISTS public.author_contacts"), "table");
  assert(migration.includes("platform"), "platform column");
  assert(migration.includes("'telegram', 'max', 'custom'"), "extensible platform check");
  assert(migration.includes("sort_order"), "sort_order column");
  assert(migration.includes("is_visible"), "is_visible column");
  assert(migration.includes("icon_url"), "icon_url column");
  assert(migration.includes("sort_order < 6"), "max 6 via sort_order");
  assert(
    migration.includes("Public can read visible author contacts"),
    "public reads only visible",
  );
  assert(migration.includes("is_visible = true"), "public policy filters hidden");
  assert(
    migration.includes("Author members can manage author contacts"),
    "members manage own contacts",
  );
  assert(migration.includes("author_members"), "membership guard");
  assert(migration.includes("am.user_id = auth.uid()"), "uid membership check");
}

function testServerOwnershipAndPersistence() {
  const profile = read("src/lib/authors/profile.ts");
  const route = read("src/app/api/author/profile/route.ts");
  const iconRoute = read("src/app/api/author/profile/contact-icon/route.ts");
  const client = read("src/components/author-dashboard/AuthorProfileClient.tsx");

  assert(profile.includes("replaceAuthorContacts"), "replace helper");
  assert(profile.includes(".eq(\"author_id\", authorId)"), "scoped to author workspace");
  assert(route.includes("requireAuthorMutationMembership"), "writes require membership");
  assert(route.includes("normalizeAuthorContacts"), "server validates contacts");
  assert(route.includes('error: "invalid_contacts"'), "invalid contacts rejected");
  assert(iconRoute.includes("requireAuthorMutationMembership"), "icon writes require membership");
  assert(iconRoute.includes("uploadOptimizedImageSet"), "uses existing image pipeline");
  assert(iconRoute.includes("author-contact-icon"), "contact icon profile");
  assert(iconRoute.includes("AUTHOR_ASSETS_BUCKET"), "reuses author-assets bucket");
  assert(client.includes("contactsFromProfile(profile.contacts"), "load hydrates contacts");
  assert(client.includes("setContacts(nextContacts)"), "save rehydrates");
  assert(client.includes("contactsFromProfile(payload.profile.contacts"), "save maps server contacts");
}

function testCabinetUi() {
  const client = read("src/components/author-dashboard/AuthorProfileClient.tsx");
  const editor = read("src/components/author-dashboard/AuthorContactsEditor.tsx");

  assert(client.includes("AuthorContactsEditor"), "contacts section on existing profile page");
  assert(editor.includes("Контакты"), "contacts heading");
  assert(editor.includes("+ Добавить контакт"), "add button");
  assert(editor.includes("AUTHOR_CONTACT_PLATFORM_LABELS"), "type labels from catalog");
  const constants = read("src/lib/authors/constants.ts");
  assert(constants.includes('telegram: "Telegram"'), "telegram type");
  assert(constants.includes('max: "MAX"'), "max type");
  assert(constants.includes('custom: "Другое"'), "custom type");
  assert(editor.includes("Название"), "title label");
  assert(editor.includes("Ссылка"), "url label");
  assert(editor.includes("Короткий текст"), "description label");
  assert(editor.includes("Показывать на странице автора"), "visibility without tech name");
  assert(editor.includes(">Тип<") || editor.includes("Тип"), "type label instead of platform");
  assert(!editor.includes("sort_order"), "no sort_order in UI");
  assert(!editor.includes("is_visible"), "no is_visible field name in UI");
  assert(!editor.includes("sort order"), "no sort order label");
  assert(editor.includes("aria-label=\"Поднять выше\""), "up control");
  assert(editor.includes("aria-label=\"Опустить ниже\""), "down control");
  assert(editor.includes("Загрузить иконку"), "custom icon upload");
  assert(editor.includes("resolveAuthorContactIconUrl"), "cabinet preview uses shared icon resolver");
}

function testExplicitContactSaveReusesProfilePatch() {
  const client = read("src/components/author-dashboard/AuthorProfileClient.tsx");
  const editor = read("src/components/author-dashboard/AuthorContactsEditor.tsx");
  const route = read("src/app/api/author/profile/route.ts");

  assert(editor.includes("Сохранить изменения"), "explicit contacts save button");
  assert(editor.includes("Сохраняем…"), "in-flight save label");
  assert(editor.includes("Сохранено"), "saved confirmation");
  assert(editor.includes("+ Добавить контакт"), "add stays a separate action");
  assert(
    editor.includes('disabled={disabled || saving || !dirty}'),
    "save disabled until contacts are dirty",
  );
  assert(editor.includes("onSave"), "contacts save calls parent persist");
  assert(
    editor.indexOf("+ Добавить контакт") < editor.indexOf("Сохранить изменения"),
    "add button stays above save",
  );
  assert(editor.includes("w-full"), "save button can use full mobile width");
  assert(editor.includes("min-w-0"), "contacts save row cannot overflow");
  assert(editor.includes("max-w-full"), "contacts save row stays within card");
  assert(
    editor.includes("sm:w-auto"),
    "save button does not force a wide desktop row",
  );

  assert(client.includes("areAuthorContactDraftsEqual"), "dirty uses shared contact compare");
  assert(client.includes("persistProfile"), "shared persist helper");
  assert(client.includes("onSave={() =>"), "contacts button wired to persist");
  assert(client.includes('fetch("/api/author/profile"'), "still uses profile PATCH");
  assert(client.includes("draftsToContactPayload(contacts)"), "contacts ride the same payload");
  assert(client.includes("setSavedContacts(nextContacts)"), "success clears dirty from server snapshot");
  assert(client.includes("setContacts(nextContacts)"), "success rehydrates without wiping drafts");
  assert(client.includes("saved={Boolean(success) && !contactsDirty}"), "saved only after clean snapshot");
  assert(!client.includes("/api/author/contacts"), "no parallel contacts backend");
  assert(route.includes('if ("contacts" in body)'), "same PATCH persists contacts");
  assert(route.includes("replaceAuthorContacts"), "same replace helper");
}

function testContactDirtyAndPersistRefresh() {
  const telegramDraft = {
    id: TELEGRAM_ID,
    platform: "telegram",
    title: "Telegram-канал",
    description: "Новые практики",
    url: "https://t.me/sergey",
    iconUrl: null,
    iconPath: null,
    iconImage: null,
    isVisible: true,
  };
  const maxDraft = {
    id: MAX_ID,
    platform: "max",
    title: "MAX-канал",
    description: "",
    url: "https://max.ru/sergey",
    iconUrl: null,
    iconPath: null,
    iconImage: null,
    isVisible: true,
  };

  assert(areAuthorContactDraftsEqual([], []), "empty equals empty");
  assert(
    !areAuthorContactDraftsEqual([], [telegramDraft]),
    "add contact is dirty",
  );
  assert(
    !areAuthorContactDraftsEqual([telegramDraft], [{ ...telegramDraft, title: "Другое" }]),
    "title change is dirty",
  );
  assert(
    !areAuthorContactDraftsEqual([telegramDraft], [{ ...telegramDraft, url: "https://t.me/other" }]),
    "url change is dirty",
  );
  assert(
    !areAuthorContactDraftsEqual(
      [telegramDraft],
      [{ ...telegramDraft, description: "Короткий текст" }],
    ),
    "short text change is dirty",
  );
  assert(
    !areAuthorContactDraftsEqual(
      [telegramDraft],
      [{ ...telegramDraft, isVisible: false }],
    ),
    "visibility change is dirty",
  );
  assert(
    !areAuthorContactDraftsEqual(
      [telegramDraft],
      [{ ...telegramDraft, platform: "max" }],
    ),
    "type change is dirty",
  );
  assert(
    !areAuthorContactDraftsEqual([telegramDraft, maxDraft], [maxDraft, telegramDraft]),
    "reorder is dirty",
  );
  assert(
    !areAuthorContactDraftsEqual(
      [telegramDraft],
      [{ ...telegramDraft, iconUrl: "https://cdn.example/own.webp" }],
    ),
    "icon upload is dirty",
  );
  assert(
    areAuthorContactDraftsEqual([telegramDraft, maxDraft], [telegramDraft, maxDraft]),
    "identical snapshot is clean",
  );

  const savedMax = normalizeAuthorContacts([
    contactInput({
      id: MAX_ID,
      platform: "max",
      title: "MAX-канал",
      url: "https://max.ru/sergey",
    }),
  ]);
  const maxAfterRefresh = contactsFromProfile(
    savedMax.map((contact, index) => ({ ...contact, sortOrder: index })),
  );
  const maxReloaded = normalizeAuthorContacts(draftsToContactPayload(maxAfterRefresh));
  const maxPublic = selectVisibleAuthorContacts(
    maxReloaded.map((contact, index) => ({ ...contact, sortOrder: index })),
  );
  assert(maxReloaded?.[0]?.title === "MAX-канал", "max title persists after refresh");
  assert(maxReloaded?.[0]?.url === "https://max.ru/sergey", "max url persists after refresh");
  assert(
    maxPublic[0].iconUrl === "/school/messengers/max.png",
    "public max uses existing max.png",
  );

  const savedTelegram = normalizeAuthorContacts([
    contactInput({
      title: "Telegram-канал",
      url: "https://t.me/sergey",
    }),
  ]);
  const telegramAfterRefresh = contactsFromProfile(
    savedTelegram.map((contact, index) => ({ ...contact, sortOrder: index })),
  );
  const telegramReloaded = normalizeAuthorContacts(
    draftsToContactPayload(telegramAfterRefresh),
  );
  const telegramPublic = selectVisibleAuthorContacts(
    telegramReloaded.map((contact, index) => ({ ...contact, sortOrder: index })),
  );
  assert(telegramReloaded?.[0]?.title === "Telegram-канал", "telegram title persists");
  assert(telegramReloaded?.[0]?.url === "https://t.me/sergey", "telegram url persists");
  assert(
    telegramPublic[0].iconUrl === "/school/messengers/telegram.png",
    "public telegram uses existing telegram.png",
  );

  const savedCustomIcon = normalizeAuthorContacts([
    contactInput({
      id: MAX_ID,
      platform: "max",
      title: "MAX со своей иконкой",
      url: "https://max.ru/sergey",
      iconUrl: "https://cdn.example/own.webp",
    }),
  ]);
  const customPublic = selectVisibleAuthorContacts(
    savedCustomIcon.map((contact, index) => ({ ...contact, sortOrder: index })),
  );
  assert(
    customPublic[0].iconUrl === "https://cdn.example/own.webp",
    "uploaded icon still overrides default",
  );
}

function testPublicPageUi() {
  const page = read("src/app/(platform)/(listener)/authors/[slug]/page.tsx");
  const section = read("src/components/authors/AuthorContactsSection.tsx");
  const loader = read("src/lib/authors/public-page.ts");

  assert(page.includes("AuthorContactsSection"), "contacts section wired");
  assert(page.includes("collectAuthorContactSameAs"), "sameAs from contacts");
  assert(page.includes("AuthorAboutSection"), "about section still wired");
  assert(page.includes("generateMetadata"), "seo metadata kept");
  assert(loader.includes("selectVisibleAuthorContacts"), "public loader filters visible");
  assert(section.includes("Контакты автора"), "public heading");
  assert(section.includes("contacts.length === 0"), "empty state returns null");
  assert(section.includes("target: \"_blank\""), "https opens new tab");
  assert(section.includes("noopener noreferrer"), "safe rel");
  assert(section.includes("contact.description ?"), "empty description adds no block");
  assert(section.includes("href={contact.url}"), "url is the card href");
  assert(
    !/\{contact\.url\}<\/|\n\s*\{contact\.url\}/.test(section),
    "raw url is not printed as text",
  );
  assert(section.includes("min-w-0"), "mobile overflow guard");
  assert(section.includes("max-w-full"), "card cannot overflow horizontally");
  assert(section.includes("break-words"), "long title wraps");
  assert(section.includes("flex-1"), "text sits to the right of icon");
  assert(!section.includes("max-w-["), "no fixed max width that clips");
  assert(!section.includes("w-[320px]"), "no fixed card width");
  assert(section.includes("focus-visible:outline"), "keyboard focus ring");
  assert(section.includes("<a"), "whole card is the link");
  assert(!section.includes("overflow-x-scroll"), "no horizontal scroll container");
}

function testImagePipelineExtension() {
  const types = read("src/lib/images/image-types.ts");
  const profiles = read("src/lib/images/image-profiles.ts");
  const paths = read("src/lib/images/image-paths.ts");

  assert(types.includes("author-contact-icon"), "image profile added");
  assert(profiles.includes("author-contact-icon"), "profile config added");
  assert(paths.includes("authors/${authorId}/contacts/${contactId}"), "storage path under author-assets");
  const iconRoute = read("src/app/api/author/profile/contact-icon/route.ts");
  assert(iconRoute.includes("requireAuthorMutationMembership"), "icon upload membership-gated");
  assert(iconRoute.includes("cleanupImageManifest"), "replacing icon cleans previous variants");
  assert(iconRoute.includes("authorId, contactId"), "icon path scoped to author + contact");
}

function testContactIconPathIsServerGenerated() {
  const iconRoute = read("src/app/api/author/profile/contact-icon/route.ts");
  const editor = read("src/components/author-dashboard/AuthorContactsEditor.tsx");
  const paths = read("src/lib/images/image-paths.ts");
  const assetsPolicy = read(
    "supabase/migrations/20260717160000_author_public_profile.sql",
  );

  assert(iconRoute.includes('formData.get("author_id")'), "POST reads author_id");
  assert(iconRoute.includes('formData.get("contact_id")'), "POST reads contact_id");
  assert(iconRoute.includes('formData.get("file")'), "POST reads file");
  assert(!iconRoute.includes('formData.get("path")'), "POST does not read path");
  assert(!iconRoute.includes('formData.get("icon_path")'), "POST does not read icon_path");
  assert(
    !iconRoute.includes('formData.get("storage_path")'),
    "POST does not read storage_path",
  );
  assert(
    iconRoute.includes("context: { authorId, contactId }"),
    "upload context is server-built",
  );
  assert(
    paths.includes(
      "return `authors/${authorId}/contacts/${contactId}/variants/${versionId}`",
    ),
    "path builder is authors/{authorId}/contacts/{contactId}/variants/{versionId}",
  );
  assert(editor.includes('formData.set("author_id", authorId)'), "client sends author_id");
  assert(editor.includes('formData.set("contact_id", contact.id)'), "client sends contact_id");
  assert(editor.includes('formData.set("file", file)'), "client sends file");
  assert(!editor.includes('formData.set("path"'), "client does not send path");
  assert(!editor.includes('formData.set("icon_path"'), "client does not send icon_path");
  assert(
    assetsPolicy.includes("split_part(name, '/', 2)::uuid"),
    "existing author-assets RLS keys off authors/{authorId}/...",
  );
}

const tests = [
  ["platform catalog", testPlatformCatalogIsExtensible],
  ["url validation", testUrlValidation],
  ["description 120 limit", testDescriptionLimit],
  ["normalize scenarios", testNormalizeContactsScenarios],
  ["public visibility", testPublicVisibilityAndEmptyState],
  ["cabinet persist roundtrip", testCabinetPersistRoundtrip],
  ["icons and sameAs", testIconsAndSameAs],
  ["local standard icons", testLocalStandardIconsExist],
  ["migration and RLS", testMigrationAndRls],
  ["ownership and persistence", testServerOwnershipAndPersistence],
  ["cabinet UI", testCabinetUi],
  ["explicit contact save", testExplicitContactSaveReusesProfilePatch],
  ["dirty and persist refresh", testContactDirtyAndPersistRefresh],
  ["public page UI", testPublicPageUi],
  ["image pipeline", testImagePipelineExtension],
  ["server-generated icon path", testContactIconPathIsServerGenerated],
];

for (const [name, fn] of tests) {
  fn();
  console.log(`ok - ${name}`);
}

console.log(`\n${tests.length} author contacts checks passed.`);
