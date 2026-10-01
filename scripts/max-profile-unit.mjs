#!/usr/bin/env node
/**
 * MAX Profile tab replaces the placeholder and confirms logout inside the Mini App.
 */
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import MaxProfileModule, {
  MAX_PROFILE_AUTHOR_CABINET_LABEL,
  MAX_PROFILE_AUTHOR_HEADING,
  MAX_PROFILE_CANCEL_LABEL,
  MAX_PROFILE_CONFIRM_BODY,
  MAX_PROFILE_CONFIRM_LABEL,
  MAX_PROFILE_CONFIRM_TITLE,
  MAX_PROFILE_GUEST_STATUS,
  MAX_PROFILE_LINKED_STATUS,
  MAX_PROFILE_LOAD_ERROR,
  MAX_PROFILE_LOADING,
  MAX_PROFILE_LOGIN_LABEL,
  MAX_PROFILE_LOGOUT_HELP,
  MAX_PROFILE_LOGOUT_LABEL,
  MAX_PROFILE_PLAYLISTS_LABEL,
  MAX_PROFILE_RETRY_LABEL,
  MAX_PROFILE_SIGNUP_LABEL,
  MAX_PROFILE_TITLE,
  MaxGuestProfile,
  MaxProfileScreen,
} from "../src/components/max/MaxProfile.tsx";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const MaxProfile = MaxProfileModule.default ?? MaxProfileModule;

function read(relative) {
  return readFileSync(join(repoRoot, relative), "utf8");
}

const home = read("src/components/max/MaxAuthenticatedHome.tsx");
const profile = read("src/components/max/MaxProfile.tsx");
const bridge = read("src/components/max/MaxBridgeScript.tsx");
const placeholder = read("src/components/max/MaxTabPlaceholder.tsx");

assert.match(home, /import MaxProfile, \{ MaxGuestProfile \} from "@\/components\/max\/MaxProfile"/);
assert.match(
  home,
  /activeTab === "profile" && !guestMode && onUnlinkAccount \? \(\s*<MaxProfile/,
);
assert.match(
  home,
  /activeTab === "library" \? \(\s*<MaxTabPlaceholder title=\{activeTabLabel\} \/>/,
);
assert.match(home, /activeTab === "playlists" \? \(\s*<MaxPlaylists/);
assert.match(home, /<MaxBottomNav activeTab=\{activeTab\} onSelectTab=\{selectMaxTab\} \/>/);
assert.doesNotMatch(
  `${home}\n${profile}\n${bridge}`,
  /router\.push\(\s*["']\/profile|href=["']\/profile|window\.location\s*=\s*["']https:\/\/audiolad\.ru/,
);

const profilePane = home.slice(
  home.indexOf('activeTab === "profile" && !guestMode'),
  home.indexOf('activeTab === "catalog" && promoTarget'),
);
assert.match(profilePane, /<MaxProfile/);
assert.match(profilePane, /onOpenPlaylists=\{\(\) => selectMaxTab\("playlists"\)\}/);
assert.doesNotMatch(profilePane, /MaxTabPlaceholder/);
assert.doesNotMatch(profilePane, /fetch\(|supabase|\/api\/profile/);

assert.match(profile, /MAX_PROFILE_TITLE/);
assert.match(profile, /Выйти из аккаунта/);
assert.match(profile, /role="dialog"/);
assert.match(profile, /Выйти из аккаунта\?/);
assert.match(profile, /Связь между этим MAX и аккаунтом АудиоЛада будет удалена\./);
assert.match(profile, />\s*\{MAX_PROFILE_CANCEL_LABEL\}\s*</);
assert.match(profile, />\s*\{MAX_PROFILE_CONFIRM_LABEL\}\s*</);
assert.match(profile, /fetch\(MAX_PROFILE_PATH/);
assert.match(profile, /openMaxExternalLink/);
assert.match(profile, /JSON\.stringify\(\{ initData \}\)/);
assert.doesNotMatch(profile, /supabase|router\.push|window\.location|next\/link|next\/navigation/);
assert.doesNotMatch(profile, /initDataUnsafe|user_id|max_user_id/);
assert.doesNotMatch(profile, /Редактировать профиль|\/my-practices|selectMaxTab\("library"\)|Аудиотека/);
const guestSource = profile.slice(
  profile.indexOf("export function MaxGuestProfile"),
  profile.indexOf("type MaxProfileProps"),
);
assert.doesNotMatch(guestSource, /MAX_PROFILE_PATH|openMaxExternalLink|fetch\(/);
const loadEffect = profile.slice(
  profile.indexOf("useEffect(() => {"),
  profile.indexOf("return (\n    <MaxProfileScreen"),
);
assert.doesNotMatch(loadEffect, /onLogout|MaxGuestProfile|guestMode/);
assert.match(placeholder, /Раздел готовится\./);
assert.doesNotMatch(profile, /Раздел готовится/);

const handleUnlink = bridge.slice(
  bridge.indexOf("const handleUnlink"),
  bridge.indexOf("const view = viewMaxShell"),
);
assert.match(handleUnlink, /unlinkMaxSession/);
assert.match(handleUnlink, /type: "UNLINK_START"/);
assert.match(handleUnlink, /setStartTarget\(null\)/);
assert.doesNotMatch(handleUnlink, /signOutMaxSession|router\.push|window\.location|\/profile/);
assert.match(bridge, /onUnlinkAccount=\{handleUnlink\}/);
assert.match(
  bridge,
  /view\.phase === "linked_authenticated" \|\| view\.phase === "guest_unlinked"/,
);
assert.match(bridge, /guestMode=\{view\.phase === "guest_unlinked"\}/);
assert.match(home, /<MaxGuestProfile onLogin=\{onRequestLogin\} onSignup=\{onRequestSignup\} \/>/);

const markup = renderToStaticMarkup(
  createElement(MaxProfile, {
    onLogout: async () => false,
  }),
);
assert.match(markup, new RegExp(MAX_PROFILE_TITLE));
assert.match(markup, new RegExp(MAX_PROFILE_LOADING));
assert.match(markup, new RegExp(MAX_PROFILE_LINKED_STATUS));
assert.match(markup, new RegExp(MAX_PROFILE_LOGOUT_LABEL));
assert.match(markup, new RegExp(MAX_PROFILE_LOGOUT_HELP));
assert.doesNotMatch(markup, /role="dialog"/);
assert.doesNotMatch(markup, /@/);

const listenerProfile = {
  card: {
    displayName: "Анна",
    initial: "А",
    email: "anna@example.com",
    avatarUrl: null,
    rolePrimaryLabel: "Слушатель · Автор",
    authorWorkspaceCountLabel: "2 авторских пространства",
  },
  counters: [
    { key: "library", value: 4, label: "в аудиотеке" },
    { key: "playlists", value: 2, label: "плейлистов" },
    { key: "completed", value: null, label: "завершено" },
  ],
  authorSection: {
    kind: "member",
    workspaces: [
      { name: "Тишина", slug: "tishina", role: "owner" },
      { name: "Рассвет", slug: "rassvet", role: "editor" },
    ],
  },
};

const named = renderToStaticMarkup(
  createElement(MaxProfileScreen, {
    status: "ready",
    profile: listenerProfile,
    onRetry: () => {},
    onOpenPlaylists: () => {},
    onLogout: async () => false,
  }),
);
assert.match(named, /Анна/);
assert.match(named, /anna@example\.com/);
assert.match(named, /Слушатель · Автор/);
assert.match(named, /2 авторских пространства/);
assert.match(named, /data-max-profile-initial="А"/);
assert.match(named, /data-max-profile-counter="library"/);
assert.match(named, /data-max-profile-counter="playlists"/);
assert.match(named, /data-max-profile-counter="completed"/);
assert.match(named, />4</);
assert.match(named, />2</);
assert.match(named, /—/);
assert.match(named, /в аудиотеке/);
assert.match(named, /плейлистов/);
assert.match(named, /завершено/);
assert.match(named, new RegExp(MAX_PROFILE_PLAYLISTS_LABEL));
assert.match(named, new RegExp(MAX_PROFILE_AUTHOR_HEADING));
assert.match(named, /Тишина/);
assert.match(named, /Владелец/);
assert.match(named, /Рассвет/);
assert.match(named, /Редактор/);
assert.match(named, new RegExp(MAX_PROFILE_AUTHOR_CABINET_LABEL));
assert.match(named, new RegExp(MAX_PROFILE_LINKED_STATUS));
assert.match(named, new RegExp(MAX_PROFILE_LOGOUT_LABEL));
assert.doesNotMatch(named, /<img/);
assert.doesNotMatch(named, /Редактировать профиль/);
assert.doesNotMatch(named, /Аудиотека/);

const withAvatar = renderToStaticMarkup(
  createElement(MaxProfileScreen, {
    status: "ready",
    profile: {
      ...listenerProfile,
      card: {
        ...listenerProfile.card,
        avatarUrl: "https://cdn.example/avatars/anna.webp",
        rolePrimaryLabel: "Слушатель",
        authorWorkspaceCountLabel: null,
      },
      authorSection: { kind: "application", variant: "none" },
    },
    onRetry: () => {},
    onOpenPlaylists: () => {},
    onLogout: async () => false,
  }),
);
assert.match(withAvatar, /<img[^>]*src="https:\/\/cdn\.example\/avatars\/anna\.webp"/);
assert.doesNotMatch(withAvatar, /data-max-profile-initial/);
assert.match(withAvatar, /Слушатель/);
assert.match(withAvatar, new RegExp(MAX_PROFILE_PLAYLISTS_LABEL));

const failed = renderToStaticMarkup(
  createElement(MaxProfileScreen, {
    status: "error",
    profile: null,
    onRetry: () => {},
    onOpenPlaylists: () => {},
    onLogout: async () => false,
  }),
);
assert.match(failed, new RegExp(MAX_PROFILE_LOAD_ERROR));
assert.match(failed, new RegExp(MAX_PROFILE_RETRY_LABEL));
assert.match(failed, new RegExp(MAX_PROFILE_LOGOUT_LABEL));
assert.match(failed, new RegExp(MAX_PROFILE_LINKED_STATUS));
assert.doesNotMatch(failed, new RegExp(MAX_PROFILE_GUEST_STATUS));
assert.doesNotMatch(failed, new RegExp(MAX_PROFILE_LOGIN_LABEL));

const loading = renderToStaticMarkup(
  createElement(MaxProfileScreen, {
    status: "loading",
    profile: null,
    onRetry: () => {},
    onOpenPlaylists: () => {},
    onLogout: async () => false,
  }),
);
assert.match(loading, new RegExp(MAX_PROFILE_LOADING));
assert.match(loading, new RegExp(MAX_PROFILE_LOGOUT_LABEL));
assert.doesNotMatch(loading, new RegExp(MAX_PROFILE_GUEST_STATUS));

const guestMarkup = renderToStaticMarkup(
  createElement(MaxGuestProfile, {
    onLogin: () => {},
    onSignup: () => {},
  }),
);
assert.match(guestMarkup, new RegExp(MAX_PROFILE_TITLE));
assert.match(guestMarkup, new RegExp(MAX_PROFILE_GUEST_STATUS));
assert.match(guestMarkup, new RegExp(MAX_PROFILE_LOGIN_LABEL));
assert.match(guestMarkup, new RegExp(MAX_PROFILE_SIGNUP_LABEL));
assert.doesNotMatch(guestMarkup, new RegExp(MAX_PROFILE_LINKED_STATUS));
assert.doesNotMatch(guestMarkup, new RegExp(MAX_PROFILE_LOGOUT_LABEL));
assert.equal(MAX_PROFILE_GUEST_STATUS, "Вы используете АудиоЛад без входа");
assert.equal(MAX_PROFILE_LOGIN_LABEL, "Войти в АудиоЛад");
assert.equal(MAX_PROFILE_SIGNUP_LABEL, "Создать аккаунт");

const confirmationSource = `${MAX_PROFILE_CONFIRM_TITLE}\n${MAX_PROFILE_CONFIRM_BODY}\n${MAX_PROFILE_CANCEL_LABEL}\n${MAX_PROFILE_CONFIRM_LABEL}`;
assert.match(profile, /Выйти из аккаунта\?/);
assert.match(confirmationSource, /Отмена/);
assert.match(confirmationSource, /Выйти/);

console.log("max-profile-unit: ok");
