#!/usr/bin/env node
/**
 * MAX Mini App Stage 3B: client state machine + mocked supabase/fetch.
 */
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { SIGN_IN_GENERIC_ERROR } from "../src/lib/auth/sign-in-messages.ts";
import {
  MAX_SESSION_LINK_PATH,
  MAX_SESSION_VERIFY_PATH,
} from "../src/lib/max/host.ts";
import {
  INITIAL_MAX_SHELL_STATE,
  MAX_APEX_FORGOT_PASSWORD_HREF,
  MAX_SHELL_EXPIRED,
  MAX_SHELL_IDENTITY_ALREADY_LINKED,
  MAX_SHELL_LINKED_NO_SESSION,
  MAX_SHELL_LINKED_STATUS,
  MAX_SHELL_LOGIN_CTA,
  MAX_SHELL_SERVER_ERROR,
  MAX_SHELL_SIGNUP_HINT,
  MAX_SHELL_STATUS_CONNECTING,
  MAX_SHELL_STATUS_NEUTRAL,
  MAX_SHELL_STATUS_VERIFIED,
  MAX_SHELL_USER_ALREADY_HAS_MAX_IDENTITY,
  canStartMaxLoginFlow,
  reduceMaxShell,
  viewMaxShell,
} from "../src/lib/max/session-shell.ts";
import {
  loginAndLinkMaxSession,
  mapLinkResponseToEvent,
  verifyMaxSession,
} from "../src/lib/max/session-shell-client.ts";
import MaxLoginFormModule from "../src/components/max/MaxLoginForm.tsx";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const MaxLoginForm = MaxLoginFormModule.default ?? MaxLoginFormModule;

function reduceAll(events, start = INITIAL_MAX_SHELL_STATE) {
  return events.reduce((state, event) => reduceMaxShell(state, event), start);
}

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function createDeps({
  initData = "user=%7B%22id%22%3A1%7D",
  signInError = null,
  user = null,
  fetchImpl,
} = {}) {
  const calls = [];
  const deps = {
    readInitData: () => initData,
    getAuthClient: () => ({
      auth: {
        signInWithPassword: async (credentials) => {
          calls.push({ type: "signin", credentials });
          return { error: signInError };
        },
        getUser: async () => {
          calls.push({ type: "getUser" });
          return { data: { user } };
        },
        signOut: async () => {
          calls.push({ type: "signOut" });
        },
      },
    }),
    fetch: async (url, init) => {
      calls.push({
        type: "fetch",
        url,
        init,
        body: init?.body ? JSON.parse(String(init.body)) : null,
      });
      return fetchImpl(url, init, calls);
    },
  };
  return { deps, calls };
}

function testStateMachineCopy() {
  const verifying = reduceMaxShell(INITIAL_MAX_SHELL_STATE, {
    type: "VERIFY_START",
  });
  assert.equal(viewMaxShell(verifying).statusLine, MAX_SHELL_STATUS_CONNECTING);

  const guestUnlinked = reduceMaxShell(verifying, {
    type: "VERIFY_SUCCESS",
    linked: false,
    hasSession: true,
  });
  const guestView = viewMaxShell(guestUnlinked);
  assert.equal(guestUnlinked.phase, "guest_unlinked");
  assert.equal(guestView.statusLine, MAX_SHELL_STATUS_VERIFIED);
  assert.equal(guestView.showLoginCta, true);
  assert.equal(guestView.showLoginForm, false);
  assert.match(MAX_SHELL_LOGIN_CTA, /Войти в АудиоЛад/);

  const leftoverSessionDoesNotSkipCta = reduceMaxShell(verifying, {
    type: "VERIFY_SUCCESS",
    linked: false,
    hasSession: true,
  });
  assert.equal(leftoverSessionDoesNotSkipCta.phase, "guest_unlinked");

  const loggingIn = reduceMaxShell(guestUnlinked, { type: "OPEN_LOGIN" });
  const loginView = viewMaxShell(loggingIn);
  assert.equal(loggingIn.phase, "logging_in");
  assert.equal(loginView.showLoginForm, true);
  assert.equal(loginView.signupHint, MAX_SHELL_SIGNUP_HINT);
  assert.equal(loginView.reloginNotice, null);

  const linkedNoSession = reduceMaxShell(verifying, {
    type: "VERIFY_SUCCESS",
    linked: true,
    hasSession: false,
  });
  const reloginView = viewMaxShell(linkedNoSession);
  assert.equal(linkedNoSession.phase, "linked_no_session");
  assert.equal(reloginView.showLoginForm, true);
  assert.equal(reloginView.reloginNotice, MAX_SHELL_LINKED_NO_SESSION);
  assert.equal(reloginView.signupHint, null);
  assert.doesNotMatch(reloginView.reloginNotice, /новым|новой связ|нового аккаунт/i);

  const linkedAuth = reduceMaxShell(verifying, {
    type: "VERIFY_SUCCESS",
    linked: true,
    hasSession: true,
  });
  const linkedView = viewMaxShell(linkedAuth);
  assert.equal(linkedAuth.phase, "linked_authenticated");
  assert.equal(linkedView.statusLine, MAX_SHELL_LINKED_STATUS);
  assert.equal(linkedView.showLoginForm, false);
  assert.equal(linkedView.showLoginCta, false);

  const afterLoginLink = reduceAll(
    [
      { type: "VERIFY_START" },
      { type: "VERIFY_SUCCESS", linked: false, hasSession: false },
      { type: "OPEN_LOGIN" },
      { type: "LOGIN_START" },
      { type: "LINK_START" },
      { type: "LINK_SUCCESS" },
    ],
  );
  assert.equal(afterLoginLink.phase, "linked_authenticated");
  assert.equal(viewMaxShell(afterLoginLink).showLoginForm, false);

  const expired = reduceMaxShell(loggingIn, { type: "LINK_EXPIRED" });
  assert.equal(viewMaxShell(expired).expiredMessage, MAX_SHELL_EXPIRED);

  const identity = reduceMaxShell(loggingIn, { type: "LINK_IDENTITY_CONFLICT" });
  assert.equal(
    viewMaxShell(identity).conflictMessage,
    MAX_SHELL_IDENTITY_ALREADY_LINKED,
  );

  const userConflict = reduceMaxShell(loggingIn, { type: "LINK_USER_CONFLICT" });
  assert.equal(
    viewMaxShell(userConflict).conflictMessage,
    MAX_SHELL_USER_ALREADY_HAS_MAX_IDENTITY,
  );

  const serverError = reduceMaxShell(
    { ...loggingIn, formMode: "first_link" },
    { type: "LINK_SERVER_ERROR" },
  );
  const serverView = viewMaxShell(serverError);
  assert.equal(serverError.phase, "server_error");
  assert.equal(serverView.errorMessage, MAX_SHELL_SERVER_ERROR);
  assert.equal(serverView.showLoginForm, true);

  const failedPassword = reduceMaxShell(loggingIn, { type: "LOGIN_FAILURE" });
  assert.equal(failedPassword.loginError, SIGN_IN_GENERIC_ERROR);

  const noInit = reduceMaxShell(verifying, { type: "INIT_DATA_MISSING" });
  assert.equal(noInit.phase, "guest");
  assert.equal(viewMaxShell(noInit).statusLine, MAX_SHELL_STATUS_NEUTRAL);
  assert.equal(viewMaxShell(noInit).showLoginForm, false);
  assert.equal(canStartMaxLoginFlow(null), false);
  assert.equal(canStartMaxLoginFlow(""), false);
  assert.equal(canStartMaxLoginFlow("user=1"), true);
}

async function testNoInitDataSkipsFlow() {
  const { deps, calls } = createDeps({
    initData: null,
    fetchImpl: async () => {
      throw new Error("fetch must not run without initData");
    },
  });

  assert.deepEqual(await verifyMaxSession(deps), { type: "INIT_DATA_MISSING" });
  assert.deepEqual(
    await loginAndLinkMaxSession({ email: "a@b.c", password: "x" }, deps),
    { type: "INIT_DATA_MISSING" },
  );
  assert.equal(calls.length, 0);
}

async function testVerifyLinkedFalseShowsCtaNotLink() {
  const { deps, calls } = createDeps({
    user: { id: "old-session-user" },
    fetchImpl: async () => jsonResponse(200, { ok: true, linked: false }),
  });

  const event = await verifyMaxSession(deps);
  assert.deepEqual(event, {
    type: "VERIFY_SUCCESS",
    linked: false,
    hasSession: false,
  });
  const state = reduceMaxShell(
    reduceMaxShell(INITIAL_MAX_SHELL_STATE, { type: "VERIFY_START" }),
    event,
  );
  assert.equal(state.phase, "guest_unlinked");
  assert.equal(viewMaxShell(state).showLoginCta, true);
  assert.equal(
    calls.some((call) => call.url === MAX_SESSION_LINK_PATH),
    false,
  );
  assert.equal(calls[0].url, MAX_SESSION_VERIFY_PATH);
  assert.equal(
    calls.some((call) => call.type === "getUser"),
    false,
    "leftover session must not be read or auto-linked when verify linked=false",
  );
}

async function testLinkedTrueWithSessionHidesForm() {
  const { deps } = createDeps({
    user: { id: "user-1" },
    fetchImpl: async () => jsonResponse(200, { ok: true, linked: true }),
  });
  const event = await verifyMaxSession(deps);
  assert.deepEqual(event, {
    type: "VERIFY_SUCCESS",
    linked: true,
    hasSession: true,
  });
  const view = viewMaxShell(
    reduceMaxShell(INITIAL_MAX_SHELL_STATE, event),
  );
  assert.equal(view.phase, "linked_authenticated");
  assert.equal(view.showLoginForm, false);
  assert.equal(view.showLoginCta, false);
}

async function testLinkedTrueWithoutSessionShowsRelogin() {
  const { deps } = createDeps({
    user: null,
    fetchImpl: async () => jsonResponse(200, { ok: true, linked: true }),
  });
  const event = await verifyMaxSession(deps);
  const view = viewMaxShell(reduceMaxShell(INITIAL_MAX_SHELL_STATE, event));
  assert.equal(view.phase, "linked_no_session");
  assert.equal(view.reloginNotice, MAX_SHELL_LINKED_NO_SESSION);
  assert.equal(view.signupHint, null);
  assert.equal(view.showLoginForm, true);
}

async function testValidPasswordCallsLinkWithInitDataOnly() {
  const initData = "raw-window-webapp-init-data";
  const { deps, calls } = createDeps({
    initData,
    fetchImpl: async () => jsonResponse(200, { ok: true, linked: true }),
  });

  const event = await loginAndLinkMaxSession(
    { email: "user@yandex.ru", password: "secret" },
    deps,
  );
  assert.deepEqual(event, { type: "LINK_SUCCESS" });
  assert.equal(calls[0].type, "signin");
  assert.deepEqual(calls[0].credentials, {
    email: "user@yandex.ru",
    password: "secret",
  });
  assert.equal(calls[1].type, "fetch");
  assert.equal(calls[1].url, MAX_SESSION_LINK_PATH);
  assert.equal(calls[1].init.credentials, "same-origin");
  assert.deepEqual(calls[1].body, { initData });
  assert.equal("user_id" in calls[1].body, false);
  assert.equal("max_user_id" in calls[1].body, false);
  assert.equal("user" in calls[1].body, false);
}

async function testBadPasswordDoesNotCallLink() {
  const { deps, calls } = createDeps({
    signInError: { message: "Invalid login credentials" },
    fetchImpl: async () => {
      throw new Error("link must not be called");
    },
  });

  const event = await loginAndLinkMaxSession(
    { email: "user@yandex.ru", password: "wrong" },
    deps,
  );
  assert.deepEqual(event, { type: "LOGIN_FAILURE" });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].type, "signin");
  const failed = reduceMaxShell(
    { ...INITIAL_MAX_SHELL_STATE, phase: "logging_in", formMode: "first_link" },
    event,
  );
  assert.equal(failed.loginError, SIGN_IN_GENERIC_ERROR);
}

async function testExpiredLinkUx() {
  const { deps } = createDeps({
    fetchImpl: async () => jsonResponse(401, { ok: false, reason: "expired" }),
  });
  const event = await loginAndLinkMaxSession(
    { email: "user@yandex.ru", password: "secret" },
    deps,
  );
  assert.deepEqual(event, { type: "LINK_EXPIRED" });
  assert.equal(
    viewMaxShell(reduceMaxShell(INITIAL_MAX_SHELL_STATE, event)).expiredMessage,
    MAX_SHELL_EXPIRED,
  );
}

async function testConflictAndServerUx() {
  assert.deepEqual(
    mapLinkResponseToEvent(409, {
      ok: false,
      reason: "identity_already_linked",
    }),
    { type: "LINK_IDENTITY_CONFLICT" },
  );
  assert.deepEqual(
    mapLinkResponseToEvent(409, {
      ok: false,
      reason: "user_already_has_max_identity",
    }),
    { type: "LINK_USER_CONFLICT" },
  );
  assert.deepEqual(
    mapLinkResponseToEvent(503, {
      ok: false,
      reason: "storage_unavailable",
    }),
    { type: "LINK_SERVER_ERROR" },
  );
  assert.deepEqual(mapLinkResponseToEvent(500, { ok: false }), {
    type: "LINK_SERVER_ERROR",
  });

  const { deps: identityDeps } = createDeps({
    fetchImpl: async () =>
      jsonResponse(409, { ok: false, reason: "identity_already_linked" }),
  });
  const identityEvent = await loginAndLinkMaxSession(
    { email: "a@b.c", password: "x" },
    identityDeps,
  );
  assert.equal(
    viewMaxShell(reduceMaxShell(INITIAL_MAX_SHELL_STATE, identityEvent))
      .conflictMessage,
    MAX_SHELL_IDENTITY_ALREADY_LINKED,
  );

  const { deps: userDeps } = createDeps({
    fetchImpl: async () =>
      jsonResponse(409, { ok: false, reason: "user_already_has_max_identity" }),
  });
  const userEvent = await loginAndLinkMaxSession(
    { email: "a@b.c", password: "x" },
    userDeps,
  );
  assert.equal(
    viewMaxShell(reduceMaxShell(INITIAL_MAX_SHELL_STATE, userEvent))
      .conflictMessage,
    MAX_SHELL_USER_ALREADY_HAS_MAX_IDENTITY,
  );

  const { deps: serverDeps } = createDeps({
    fetchImpl: async () =>
      jsonResponse(503, { ok: false, reason: "storage_unavailable" }),
  });
  const serverEvent = await loginAndLinkMaxSession(
    { email: "a@b.c", password: "x" },
    serverDeps,
  );
  const serverState = reduceMaxShell(
    { ...INITIAL_MAX_SHELL_STATE, phase: "linking", formMode: "first_link" },
    serverEvent,
  );
  assert.equal(viewMaxShell(serverState).errorMessage, MAX_SHELL_SERVER_ERROR);
}

function testLoginFormMarkup() {
  const markup = renderToStaticMarkup(
    createElement(MaxLoginForm, {
      email: "user@yandex.ru",
      password: "secret",
      submitting: false,
      onEmailChange: () => {},
      onPasswordChange: () => {},
      onSubmit: () => {},
    }),
  );
  assert.match(markup, /Электронная почта/);
  assert.match(markup, /Войти/);
  assert.match(markup, /Забыли пароль\?/);
  assert.match(markup, /https:\/\/audiolad\.ru\/auth\/forgot-password/);
  assert.doesNotMatch(markup, /BottomNav|sign-up|Зарегистрироваться/);
  assert.equal(
    MAX_APEX_FORGOT_PASSWORD_HREF,
    "https://audiolad.ru/auth/forgot-password",
  );
}

function testSourceGuards() {
  const files = [
    "src/lib/max/session-shell.ts",
    "src/lib/max/session-shell-client.ts",
    "src/components/max/MaxBridgeScript.tsx",
    "src/components/max/MaxLoginForm.tsx",
    "src/components/max/MaxMiniAppScreen.tsx",
    "src/lib/supabase/client.ts",
    "src/lib/supabase/proxy.ts",
  ];
  const hay = files
    .map((relative) => readFileSync(join(repoRoot, relative), "utf8"))
    .join("\n");
  assert.doesNotMatch(hay, /NEXT_PUBLIC_MAX_BOT|NEXT_PUBLIC_MAX/);
  assert.doesNotMatch(hay, /Domain=\.audiolad\.ru|domain:\s*["']\.audiolad\.ru/);
  assert.doesNotMatch(
    hay,
    /href=["']\/auth\/sign-up|buildAuthRouteHref\(\s*["']\/auth\/sign-up/,
  );
}

testStateMachineCopy();
await testNoInitDataSkipsFlow();
await testVerifyLinkedFalseShowsCtaNotLink();
await testLinkedTrueWithSessionHidesForm();
await testLinkedTrueWithoutSessionShowsRelogin();
await testValidPasswordCallsLinkWithInitDataOnly();
await testBadPasswordDoesNotCallLink();
await testExpiredLinkUx();
await testConflictAndServerUx();
testLoginFormMarkup();
testSourceGuards();

console.log("max-session-shell-unit: ok");
