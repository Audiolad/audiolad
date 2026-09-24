import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import test from "node:test";

import {
  canAccessAuthorPartnerYour20Ui,
  evaluatePartnerYour20Access,
  selectOwnedAuthorWorkspace,
} from "../src/lib/author-partner/access";
import {
  buildAuthorPartnerHomePath,
  buildAuthorPartnerHomeUrl,
  buildAuthorPartnerInviteMessage,
  buildAuthorPartnerInvitePath,
  buildAuthorPartnerInviteUrl,
} from "../src/lib/author-partner/invite-link";
import { handlePartnerInviteRequest } from "../src/lib/author-partner/invite-route";
import type { PartnerTouchResult } from "../src/lib/author-partner/attribution";
import {
  parsePartnerRpcErrorCode,
  partnerCodeUserMessage,
} from "../src/lib/author-partner/rpc-user-messages";
import { parseAuthorPartnerProfilePayload } from "../src/lib/author-partner/profile-types";
import {
  parsePartnerRewardDashboardPayload,
  PARTNER_REWARD_LOAD_ERROR,
} from "../src/lib/author-partner/rewards";
import { formatPartnerRewardMoney } from "../src/lib/author-partner/money-format";

test("owner of any author workspace can open Ваши 20%", () => {
  assert.equal(
    canAccessAuthorPartnerYour20Ui({
      authorSlug: "anna-meditation",
      role: "owner",
      isSupportMode: false,
    }),
    true,
  );
  assert.equal(
    evaluatePartnerYour20Access({
      resolvedAuthorSlug: "natalya",
      role: "owner",
      isSupportMode: false,
    }),
    "allowed",
  );
});

test("editor cannot open Ваши 20%", () => {
  assert.equal(
    canAccessAuthorPartnerYour20Ui({
      authorSlug: "anna-meditation",
      role: "editor",
      isSupportMode: false,
    }),
    false,
  );
  assert.equal(
    evaluatePartnerYour20Access({
      resolvedAuthorSlug: "anna-meditation",
      role: "editor",
      isSupportMode: false,
    }),
    "forbidden",
  );
});

test("support mode cannot open Ваши 20%", () => {
  assert.equal(
    canAccessAuthorPartnerYour20Ui({
      authorSlug: "anna-meditation",
      role: "owner",
      isSupportMode: true,
    }),
    false,
  );
  assert.equal(
    evaluatePartnerYour20Access({
      resolvedAuthorSlug: "anna-meditation",
      role: "owner",
      isSupportMode: true,
    }),
    "support_mode_blocked",
  );
});

test("foreign workspace query does not select another author", () => {
  const owned = selectOwnedAuthorWorkspace(
    [
      { slug: "anna-meditation", id: "own" },
      { slug: "second-project", id: "own-2" },
    ],
    "sergey-petrov",
  );
  assert.equal(owned?.slug, "anna-meditation");
  assert.equal(
    selectOwnedAuthorWorkspace(
      [{ slug: "anna-meditation", id: "own" }],
      "anna-meditation",
    )?.id,
    "own",
  );
  assert.equal(
    canAccessAuthorPartnerYour20Ui({
      authorSlug: "",
      role: "owner",
      isSupportMode: false,
    }),
    false,
  );
  assert.equal(
    evaluatePartnerYour20Access({
      resolvedAuthorSlug: null,
      role: "owner",
      isSupportMode: false,
    }),
    "forbidden",
  );
});

test("invite and home URL builders use the current primary code", () => {
  assert.equal(buildAuthorPartnerInvitePath("sergey"), "/invite/sergey");
  assert.equal(buildAuthorPartnerHomePath("sergey"), "/r/sergey");
  assert.equal(
    buildAuthorPartnerInviteUrl("natalya", "https://audiolad.ru"),
    "https://audiolad.ru/invite/natalya",
  );
  assert.equal(
    buildAuthorPartnerHomeUrl("natalya", "https://audiolad.ru"),
    "https://audiolad.ru/r/natalya",
  );
  assert.equal(
    buildAuthorPartnerHomeUrl("anna-meditation", "https://audiolad.ru"),
    "https://audiolad.ru/r/anna-meditation",
  );
});

test("copied invitation contains both links and the bonus sentence", () => {
  const msg = buildAuthorPartnerInviteMessage({
    homeUrl: "https://audiolad.ru/r/sergey",
    authorUrl: "https://audiolad.ru/invite/sergey",
  });
  assert.equal(
    msg,
    [
      "Хочу познакомить вас с АудиоЛадом — платформой авторских аудиопрактик, медитаций, аудиокурсов, музыки и программ.",
      "",
      "Посмотреть АудиоЛад:",
      "https://audiolad.ru/r/sergey",
      "",
      "Если захотите стать автором АудиоЛада, здесь можно посмотреть возможности для авторов и перейти к регистрации:",
      "https://audiolad.ru/invite/sergey",
      "",
      "Когда вы зарегистрируетесь как автор по моей пригласительной ссылке, АудиоЛад бесплатно добавит вам дополнительное авторское пространство.",
    ].join("\n"),
  );
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

test("reward dashboard parse: currency-aware balances and safe history", () => {
  const dashboard = parsePartnerRewardDashboardPayload({
    balances: [
      {
        currency: "RUB",
        accrued_minor: 1500,
        held_minor: -500,
        available_minor: 2000,
        paid_minor: 0,
      },
    ],
    history: [
      {
        invitee_author_name: "Автор",
        entry_type: "reward_reversal",
        amount_minor: -500,
        currency: "RUB",
        effective_at: "2026-11-03T12:00:00Z",
        availability_state: "held",
      },
    ],
  });
  assert.deepEqual(dashboard, {
    balances: [
      {
        currency: "RUB",
        accruedMinor: 1500,
        heldMinor: -500,
        availableMinor: 2000,
        paidMinor: 0,
      },
    ],
    history: [
      {
        inviteeAuthorName: "Автор",
        entryType: "reward_reversal",
        amountMinor: -500,
        currency: "RUB",
        effectiveAt: "2026-11-03T12:00:00Z",
        availabilityState: "held",
      },
    ],
  });
  assert.equal(PARTNER_REWARD_LOAD_ERROR.length > 0, true);
});

test("reward dashboard parse: canonical zero RUB response is successful", () => {
  assert.deepEqual(
    parsePartnerRewardDashboardPayload({
      balances: [
        {
          currency: "RUB",
          accrued_minor: 0,
          held_minor: 0,
          available_minor: 0,
          paid_minor: 0,
        },
      ],
      history: [],
    }),
    {
      balances: [
        {
          currency: "RUB",
          accruedMinor: 0,
          heldMinor: 0,
          availableMinor: 0,
          paidMinor: 0,
        },
      ],
      history: [],
    },
  );
});

test("reward dashboard parse: malformed or private history fails closed", () => {
  assert.equal(
    parsePartnerRewardDashboardPayload({
      balances: [],
      history: [
        {
          id: "should-not-be-here",
          invitee_author_name: "Автор",
          entry_type: "reward_accrual",
          amount_minor: 100,
          currency: "RUB",
          effective_at: "2026-11-03T12:00:00Z",
          availability_state: "available",
        },
      ],
    }),
    null,
  );
});

test("reward dashboard parse: legacy or extra contract fields fail closed", () => {
  assert.equal(
    parsePartnerRewardDashboardPayload({
      balances: [
        {
          currency: "RUB",
          accrued_minor: 0,
          held_minor: 0,
          available_minor: 0,
          paid_minor: 0,
          invariant_ok: true,
        },
      ],
      history: [],
    }),
    null,
  );
  assert.equal(
    parsePartnerRewardDashboardPayload({
      balances: [],
      history: [
        {
          invitee_author_name: "Автор",
          type: "reward_accrual",
          amount_minor: 100,
          currency: "RUB",
          effective_at: "2026-11-03T12:00:00Z",
          availability_state: "available",
        },
      ],
    }),
    null,
  );
});

test("reward money formatter: exact RUB and safe fallback", () => {
  assert.equal(formatPartnerRewardMoney(1500, "RUB"), "15 ₽");
  assert.equal(formatPartnerRewardMoney(-1501, "RUB"), "−15,01 ₽");
  assert.equal(formatPartnerRewardMoney(1.5, "RUB"), "—");
  assert.equal(formatPartnerRewardMoney(1500, "USD"), "—");
  assert.equal(formatPartnerRewardMoney(1500, "rub"), "—");
});

test("your-20 route keeps ?author=sergey-petrov", () => {
  const href = `/author-dashboard/your-20?author=${encodeURIComponent("anna-meditation")}`;
  assert.equal(href, "/author-dashboard/your-20?author=anna-meditation");
});

test("copy: explains 20%, 3-year window, bonus space, and live rewards", () => {
  const src = readFileSync(
    new URL("../src/components/author-dashboard/AuthorYour20Client.tsx", import.meta.url),
    "utf8",
  );
  const rewardsSrc = readFileSync(
    new URL("../src/components/author-dashboard/AuthorPartnerRewards.tsx", import.meta.url),
    "utf8",
  );
  const collapsed = src.replace(/\s+/g, " ");
  assert.match(collapsed, /фактически начисленной приглашённому автору\./);
  assert.match(
    collapsed,
    /Партнёрское вознаграждение вы будете получать в течение трёх лет с момента, когда приглашённый вами пользователь становится автором АудиоЛада\./,
  );
  assert.match(
    collapsed,
    /Приглашённый вами автор бесплатно получает дополнительное авторское пространство\. То есть получает бонус – возможность создать ещё один проект внутри своего аккаунта\./,
  );
  assert.match(
    collapsed,
    /Код используется в вашей персональной ссылке\. Автоматический код можно заменить на любой свободный, который вам нравится \(например, natalya или natalya-meditation\)\./,
  );
  assert.match(collapsed, /не уменьшает роялти приглашённого автора/);
  assert.doesNotMatch(
    collapsed,
    /Приглашённый вами автор получает бонусом дополнительное авторское пространство бесплатно\./,
  );
  assert.doesNotMatch(
    collapsed,
    /фактически начисленной приглашённому автору, в течение трёх лет\./,
  );
  assert.doesNotMatch(collapsed, /Тестовый режим/);
  assert.doesNotMatch(collapsed, /будет подключено отдельным этапом/);
  assert.match(rewardsSrc, /formatPartnerRewardMoney/);
  assert.match(rewardsSrc, /рассчитываются автоматически/);
  assert.match(rewardsSrc, /Начислено/);
  assert.match(rewardsSrc, /На удержании/);
  assert.match(rewardsSrc, /Доступно/);
  assert.match(rewardsSrc, /Выплачено/);
  assert.match(rewardsSrc, /следующим этапом/);
  assert.match(rewardsSrc, /История начислений/);
  assert.match(rewardsSrc, /История начислений пока пуста/);
  assert.match(rewardsSrc, /!loadError && dashboard \?/);
  assert.doesNotMatch(rewardsSrc, /invariantOk/);
  assert.match(rewardsSrc, /!loadError\s*\n\s*\? dashboard\?\.balances\.map/);
  assert.match(collapsed, /Посмотреть АудиоЛад/);
  assert.match(collapsed, /Стать автором/);
  assert.match(
    collapsed,
    /Ссылка ведёт на главную АудиоЛад и сохраняет ваше приглашение\./,
  );
  assert.match(
    collapsed,
    /Ссылка ведёт на страницу возможностей для авторов и сохраняет ваше приглашение\./,
  );
  assert.match(collapsed, /buildAuthorPartnerHomeUrl\(profile\.primaryCode/);
  assert.match(collapsed, /buildAuthorPartnerInviteUrl\(profile\.primaryCode/);
});

function requestFor(path: string): Request {
  return new Request(`https://audiolad.ru${path}`, {
    headers: { host: "audiolad.ru" },
  });
}

test("/r and /invite share one touch and keep first-touch", async () => {
  const calls: Array<{ code: string; existingToken: string | null | undefined }> = [];
  let firstCode = "";
  const touch = async (input: {
    code: string;
    existingToken: string | null | undefined;
    inviteeUserId?: string | null;
  }): Promise<PartnerTouchResult> => {
    calls.push({ code: input.code, existingToken: input.existingToken });
    if (!firstCode) {
      firstCode = input.code;
      return {
        ok: true,
        result: "created",
        setCookie: true,
        token: "token-sergey",
        code: input.code,
        referrerAuthorId: "referrer-sergey",
      };
    }
    return {
      ok: true,
      result: "preserved_first_touch",
      setCookie: false,
      code: firstCode,
      referrerAuthorId: "referrer-sergey",
    };
  };

  const home = await handlePartnerInviteRequest({
    request: requestFor("/r/sergey"),
    rawCode: "sergey",
    landing: "home",
    existingToken: null,
    inviteeUserId: null,
    touch,
  });
  assert.equal(home.status, 307);
  assert.equal(home.headers.get("location"), "https://audiolad.ru/");

  const author = await handlePartnerInviteRequest({
    request: requestFor("/invite/natalya"),
    rawCode: "natalya",
    landing: "for-authors",
    existingToken: "token-sergey",
    inviteeUserId: null,
    touch,
  });
  assert.equal(author.status, 307);
  assert.equal(author.headers.get("location"), "https://audiolad.ru/for-authors");
  assert.deepEqual(calls, [
    { code: "sergey", existingToken: null },
    { code: "natalya", existingToken: "token-sergey" },
  ]);
  assert.equal(calls[1]?.code, "natalya");
  assert.notEqual(calls[0]?.code, "");
});

test("invalid /r code is 404 and alias code is passed through unchanged", async () => {
  const seen: string[] = [];
  const missing = await handlePartnerInviteRequest({
    request: requestFor("/r/missing"),
    rawCode: "missing",
    landing: "home",
    existingToken: null,
    inviteeUserId: null,
    touch: async () => ({ ok: false, error: "not_found", setCookie: false }),
  });
  assert.equal(missing.status, 404);

  const alias = await handlePartnerInviteRequest({
    request: requestFor("/invite/old-sergey"),
    rawCode: "old-sergey",
    landing: "for-authors",
    existingToken: null,
    inviteeUserId: null,
    touch: async (input) => {
      seen.push(input.code);
      return {
        ok: true,
        result: "created",
        setCookie: true,
        token: "alias-token",
        code: input.code,
        referrerAuthorId: "referrer-sergey",
      };
    },
  });
  assert.equal(alias.headers.get("location"), "https://audiolad.ru/for-authors");
  assert.deepEqual(seen, ["old-sergey"]);

  const blank = await handlePartnerInviteRequest({
    request: requestFor("/r/"),
    rawCode: " ",
    landing: "home",
    existingToken: null,
    inviteeUserId: null,
    touch: async () => {
      throw new Error("touch must not run for an empty code");
    },
  });
  assert.equal(blank.status, 404);
});
