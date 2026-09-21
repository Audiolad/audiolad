import assert from "node:assert/strict";
import test from "node:test";

import {
  PARTNER_UI_BETA_AUTHOR_ID,
  PARTNER_UI_BETA_AUTHOR_SLUG,
  canAccessAuthorPartnerYour20Ui,
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

test("beta tab visible for sergey-petrov UUID", () => {
  assert.equal(
    isAuthorPartnerUiBetaEnabled({ authorId: PARTNER_UI_BETA_AUTHOR_ID }),
    true,
  );
});

test("beta tab visible for exact sergey-petrov slug fallback", () => {
  assert.equal(
    isAuthorPartnerUiBetaEnabled({ authorSlug: PARTNER_UI_BETA_AUTHOR_SLUG }),
    true,
  );
});

test("beta tab not visible for other author", () => {
  assert.equal(
    isAuthorPartnerUiBetaEnabled({
      authorId: "59c7e5b8-eae4-4394-82fb-b815a10be6c2",
      authorSlug: "aurafon",
    }),
    false,
  );
});

test("access requires owner; editor and support-mode blocked", () => {
  assert.equal(
    canAccessAuthorPartnerYour20Ui({
      authorId: PARTNER_UI_BETA_AUTHOR_ID,
      authorSlug: PARTNER_UI_BETA_AUTHOR_SLUG,
      role: "owner",
      isSupportMode: false,
    }),
    true,
  );
  assert.equal(
    canAccessAuthorPartnerYour20Ui({
      authorId: PARTNER_UI_BETA_AUTHOR_ID,
      role: "editor",
      isSupportMode: false,
    }),
    false,
  );
  assert.equal(
    canAccessAuthorPartnerYour20Ui({
      authorId: PARTNER_UI_BETA_AUTHOR_ID,
      role: "owner",
      isSupportMode: true,
    }),
    false,
  );
  assert.equal(
    canAccessAuthorPartnerYour20Ui({
      authorId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      authorSlug: "other-author",
      role: "owner",
      isSupportMode: false,
    }),
    false,
  );
});

test("generated code builds invite URL correctly", () => {
  assert.equal(buildAuthorPartnerInvitePath("SERGEY"), "/invite/SERGEY");
  assert.equal(
    buildAuthorPartnerInviteUrl("SERGEY20", "https://audiolad.ru"),
    "https://audiolad.ru/invite/SERGEY20",
  );
});

test("copy invitation builder; no promo wording", () => {
  const msg = buildAuthorPartnerInviteMessage(
    "https://audiolad.ru/invite/SERGEY",
  );
  assert.match(msg, /дополнительное авторское пространство бесплатно/);
  assert.match(msg, /https:\/\/audiolad\.ru\/invite\/SERGEY/);
  assert.equal(/промокод/i.test(msg), false);
});

test("code_taken / reserved_code / invalid_code UX", () => {
  assert.equal(
    partnerCodeUserMessage("code_taken"),
    "Этот код уже занят. Попробуйте другой.",
  );
  assert.equal(
    partnerCodeUserMessage("reserved_code"),
    "Этот код нельзя использовать. Выберите другой.",
  );
  assert.equal(
    partnerCodeUserMessage("invalid_code"),
    "Используйте от 3 до 32 символов: латинские буквы, цифры, дефис или нижнее подчёркивание.",
  );
  assert.equal(
    partnerCodeUserMessage("partner_profile_disabled"),
    "Персональная ссылка временно недоступна.",
  );
  assert.equal(
    partnerCodeUserMessage("unknown"),
    "Не удалось сохранить код. Попробуйте ещё раз.",
  );
  assert.equal(
    parsePartnerRpcErrorCode({ message: "ERROR: code_taken" }),
    "code_taken",
  );
  assert.equal(
    parsePartnerRpcErrorCode({ message: "reserved_code" }),
    "reserved_code",
  );
  assert.equal(
    parsePartnerRpcErrorCode({ message: "invalid_code length" }),
    "invalid_code",
  );
});

test("no-profile payload parses exists=false", () => {
  const view = parseAuthorPartnerProfilePayload(
    { exists: false, author_id: PARTNER_UI_BETA_AUTHOR_ID },
    PARTNER_UI_BETA_AUTHOR_ID,
  );
  assert.equal(view.exists, false);
});

test("existing profile + alias list preserved in parse", () => {
  const view = parseAuthorPartnerProfilePayload(
    {
      exists: true,
      author_id: PARTNER_UI_BETA_AUTHOR_ID,
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
    PARTNER_UI_BETA_AUTHOR_ID,
  );
  assert.equal(view.exists, true);
  if (view.exists) {
    assert.equal(view.primaryCode, "SERGEY");
    assert.equal(view.aliases.length, 1);
    assert.equal(view.aliases[0]?.code, "OLDCODE");
  }
});

test("your-20 route keeps ?author=sergey-petrov", () => {
  const href = `/author-dashboard/your-20?author=${encodeURIComponent(
    PARTNER_UI_BETA_AUTHOR_SLUG,
  )}`;
  assert.equal(href, "/author-dashboard/your-20?author=sergey-petrov");
});
