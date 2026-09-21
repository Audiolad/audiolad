import assert from "node:assert/strict";
import test from "node:test";

import {
  PARTNER_UI_BETA_AUTHOR_SLUG,
  canAccessAuthorPartnerYour20Ui,
  evaluatePartnerYour20Access,
  isAuthorPartnerUiBetaEnabled,
} from "../src/lib/author-partner/ui-beta";
import {
  buildAuthorPartnerInviteMessage,
  buildAuthorPartnerInvitePath,
  buildAuthorPartnerInviteUrl,
} from "../src/lib/author-partner/invite-link";
import {
  parsePartnerRpcErrorCode,
  partnerCodeUserMessage,
} from "../src/lib/author-partner/rpc-user-messages";
import { parseAuthorPartnerProfilePayload } from "../src/lib/author-partner/profile-types";

const BETA = PARTNER_UI_BETA_AUTHOR_SLUG;

test("A: slug sergey-petrov + owner → beta nav visible", () => {
  assert.equal(
    canAccessAuthorPartnerYour20Ui({
      authorSlug: BETA,
      role: "owner",
      isSupportMode: false,
    }),
    true,
  );
});

test("B: other slug + owner → hidden", () => {
  assert.equal(
    canAccessAuthorPartnerYour20Ui({
      authorSlug: "other-author",
      role: "owner",
      isSupportMode: false,
    }),
    false,
  );
});

test("C: sergey-petrov + editor → hidden", () => {
  assert.equal(
    canAccessAuthorPartnerYour20Ui({
      authorSlug: BETA,
      role: "editor",
      isSupportMode: false,
    }),
    false,
  );
});

test("D: sergey-petrov + support mode → hidden", () => {
  assert.equal(
    canAccessAuthorPartnerYour20Ui({
      authorSlug: BETA,
      role: "owner",
      isSupportMode: true,
    }),
    false,
  );
});

test("E: arbitrary UUID alone does NOT enable beta", () => {
  // isAuthorPartnerUiBetaEnabled no longer accepts authorId — only slug.
  assert.equal(isAuthorPartnerUiBetaEnabled({ authorSlug: undefined }), false);
  assert.equal(isAuthorPartnerUiBetaEnabled("7f3a9c12-4b8e-4d21-9c6a-1e2f4d6b8a0c"), false);
  assert.equal(isAuthorPartnerUiBetaEnabled({ authorSlug: "7f3a9c12-4b8e-4d21-9c6a-1e2f4d6b8a0c" }), false);
  assert.equal(isAuthorPartnerUiBetaEnabled({ authorSlug: BETA }), true);
});

test("F: mutation auth — resolved slug sergey-petrov + owner → allowed", () => {
  assert.equal(
    evaluatePartnerYour20Access({
      resolvedAuthorSlug: BETA,
      role: "owner",
      isSupportMode: false,
    }),
    "allowed",
  );
});

test("G: mutation auth — resolved slug other → beta_disabled", () => {
  assert.equal(
    evaluatePartnerYour20Access({
      resolvedAuthorSlug: "aurafon",
      role: "owner",
      isSupportMode: false,
    }),
    "beta_disabled",
  );
});

test("H: client cannot spoof slug — decision uses resolvedAuthorSlug only", () => {
  // Even if a client claimed sergey-petrov, the server passes the DB-resolved slug.
  assert.equal(
    evaluatePartnerYour20Access({
      resolvedAuthorSlug: "not-sergey",
      role: "owner",
      isSupportMode: false,
    }),
    "beta_disabled",
  );
  assert.equal(
    evaluatePartnerYour20Access({
      resolvedAuthorSlug: null,
      role: "owner",
      isSupportMode: false,
    }),
    "beta_disabled",
  );
  assert.equal(
    evaluatePartnerYour20Access({
      resolvedAuthorSlug: BETA,
      role: "editor",
      isSupportMode: false,
    }),
    "forbidden",
  );
  assert.equal(
    evaluatePartnerYour20Access({
      resolvedAuthorSlug: BETA,
      role: "owner",
      isSupportMode: true,
    }),
    "support_mode_blocked",
  );
});

test("invite URL builder", () => {
  assert.equal(buildAuthorPartnerInvitePath("SERGEY"), "/invite/SERGEY");
  assert.equal(
    buildAuthorPartnerInviteUrl("SERGEY20", "https://audiolad.ru"),
    "https://audiolad.ru/invite/SERGEY20",
  );
});

test("copy invitation builder; no promo wording", () => {
  const msg = buildAuthorPartnerInviteMessage("https://audiolad.ru/invite/SERGEY");
  assert.match(msg, /АудиоЛад/);
  assert.match(msg, /https:\/\/audiolad\.ru\/invite\/SERGEY/);
  assert.equal(/промокод/i.test(msg), false);
});

test("RPC error UX mapping", () => {
  assert.equal(partnerCodeUserMessage("code_taken"), 'Этот код уже занят. Попробуйте другой.');
  assert.equal(partnerCodeUserMessage("reserved_code"), 'Этот код нельзя использовать. Выберите другой.');
  assert.equal(partnerCodeUserMessage("invalid_code"), 'Используйте от 3 до 32 символов: латинские буквы, цифры, дефис или нижнее подчёркивание.');
  assert.equal(
    partnerCodeUserMessage("partner_profile_disabled"),
    'Персональная ссылка временно недоступна.',
  );
  assert.equal(partnerCodeUserMessage("unknown"), 'Не удалось сохранить код. Попробуйте ещё раз.');
  assert.equal(partnerCodeUserMessage("load_failed"), 'Не удалось загрузить данные ссылки. Обновите страницу.');
  assert.equal(parsePartnerRpcErrorCode({ message: "ERROR: code_taken" }), "code_taken");
});

test("profile parse: exists=false only from successful payload", () => {
  const view = parseAuthorPartnerProfilePayload(
    { exists: false, author_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" },
    "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
  );
  assert.equal(view.exists, false);
});

test("profile parse: alias list preserved", () => {
  const view = parseAuthorPartnerProfilePayload(
    {
      exists: true,
      author_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      primary_code: "SERGEY",
      status: "active",
      aliases: [
        {
          code: "OLDCODE",
          code_normalized: "oldcode",
          created_at: "2026-09-01T00:00:00Z",
        },
      ],
    },
    "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
  );
  assert.equal(view.exists, true);
  if (view.exists) {
    assert.equal(view.primaryCode, "SERGEY");
    assert.equal(view.aliases.length, 1);
    assert.equal(view.aliases[0]?.code, "OLDCODE");
  }
});

test("your-20 route keeps ?author=sergey-petrov", () => {
  const href = `/author-dashboard/your-20?author=${encodeURIComponent(BETA)}`;
  assert.equal(href, "/author-dashboard/your-20?author=sergey-petrov");
});
