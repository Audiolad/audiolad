"use strict";

/* eslint-disable @typescript-eslint/no-require-imports -- tsx loads this component test as CommonJS, so the action mock has to patch require. */

const Module = require("module");

const originalRequire = Module.prototype.require;
const KEY = "__audioladMailingEditorTest";

function state() {
  if (!global[KEY]) {
    global[KEY] = {
      sends: [],
      launches: [],
      saves: [],
      previews: [],
      searches: [],
    };
  }
  return global[KEY];
}

const navigation = {
  __esModule: true,
  useRouter() {
    return {
      push() {},
      replace() {},
      refresh() {},
      back() {},
      forward() {},
      prefetch() {},
    };
  },
  usePathname() {
    return "/admin/mailings/new";
  },
  useSearchParams() {
    return new URLSearchParams();
  },
};

const actions = {
  __esModule: true,
  async sendMailingTestAction(payload) {
    state().sends.push(payload);
    return { ok: true, email: payload.requestedEmail };
  },
  async launchMailingAction(campaignId) {
    state().launches.push(campaignId);
    return { ok: true, ready: 0 };
  },
  async saveMailingDraftAction(payload) {
    state().saves.push(payload);
    return { ok: true, id: "draft" };
  },
  async previewMailingAction(payload) {
    state().previews.push(payload);
    return { ok: true, html: "", subject: "", preheader: "", text: "", sender: "" };
  },
  async previewMailingRecipientsAction(payload) {
    state().previews.push(payload);
    return { ok: false, code: "not_called" };
  },
  async searchMailingAuthorsAction(query) {
    state().searches.push(query);
    return [];
  },
};

function matches(id, fragments) {
  const normalized = String(id).replaceAll("\\", "/");
  return fragments.some((fragment) => id === fragment || normalized.includes(fragment));
}

Module.prototype.require = function patchedRequire(id) {
  if (
    id === "next/navigation" ||
    matches(id, [
      "/next/navigation.js",
      "/next/src/client/components/navigation",
      "/next/dist/client/components/navigation",
    ])
  ) {
    return navigation;
  }

  if (
    matches(id, [
      "@/app/(platform)/admin/mailings/actions",
      "/app/(platform)/admin/mailings/actions",
      "/admin/mailings/actions",
    ])
  ) {
    return actions;
  }

  return originalRequire.apply(this, arguments);
};
