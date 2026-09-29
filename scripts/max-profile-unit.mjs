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
  MAX_PROFILE_CANCEL_LABEL,
  MAX_PROFILE_CONFIRM_BODY,
  MAX_PROFILE_CONFIRM_LABEL,
  MAX_PROFILE_CONFIRM_TITLE,
  MAX_PROFILE_GUEST_STATUS,
  MAX_PROFILE_LINKED_STATUS,
  MAX_PROFILE_LOGIN_LABEL,
  MAX_PROFILE_LOGOUT_HELP,
  MAX_PROFILE_LOGOUT_LABEL,
  MAX_PROFILE_SIGNUP_LABEL,
  MAX_PROFILE_TITLE,
  MaxGuestProfile,
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
  /activeTab === "catalog" \|\| activeTab === "profile" \? null : \(\s*<MaxTabPlaceholder title=\{activeTabLabel\} \/>/,
);
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
assert.doesNotMatch(profilePane, /MaxTabPlaceholder/);
assert.doesNotMatch(profilePane, /fetch\(|supabase|\/api\/profile/);

assert.match(profile, /MAX_PROFILE_TITLE/);
assert.match(profile, /Выйти из аккаунта/);
assert.match(profile, /role="dialog"/);
assert.match(profile, /Выйти из аккаунта\?/);
assert.match(profile, /Связь между этим MAX и аккаунтом АудиоЛада будет удалена\./);
assert.match(profile, />\s*\{MAX_PROFILE_CANCEL_LABEL\}\s*</);
assert.match(profile, />\s*\{MAX_PROFILE_CONFIRM_LABEL\}\s*</);
assert.doesNotMatch(profile, /fetch\(|supabase|router\.push|window\.location|next\/link|next\/navigation/);
assert.doesNotMatch(profile, /initDataUnsafe|user_id|max_user_id/);
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
assert.match(markup, new RegExp(MAX_PROFILE_LINKED_STATUS));
assert.match(markup, new RegExp(MAX_PROFILE_LOGOUT_LABEL));
assert.match(markup, new RegExp(MAX_PROFILE_LOGOUT_HELP));
assert.doesNotMatch(markup, /role="dialog"/);
assert.doesNotMatch(markup, /@/);

const named = renderToStaticMarkup(
  createElement(MaxProfile, {
    displayName: "Анна",
    email: "anna@example.com",
    onLogout: async () => false,
  }),
);
assert.match(named, /Анна/);
assert.match(named, /anna@example\.com/);
assert.match(named, new RegExp(MAX_PROFILE_LINKED_STATUS));

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
