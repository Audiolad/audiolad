import assert from "node:assert/strict";

import {
  describePartnerInvitee,
  parseAuthorPartnerInviteesPayload,
  PARTNER_INVITEES_EMPTY,
  PARTNER_PENDING_STATUS,
  partnerRewardUntilCopy,
  sortPartnerInvitees,
} from "@/lib/author-partner/invitees";

const pending = {
  state: "pending",
  registered_at: "2026-09-01T09:00:00.000Z",
};

const olderActivated = {
  state: "activated",
  display_name: "Мария Соколова",
  activated_at: "2026-08-01T09:00:00.000Z",
  expires_at: "2029-08-01T09:00:00.000Z",
};

const newerActivated = {
  state: "activated",
  display_name: "Илья Орлов",
  activated_at: "2026-09-20T09:00:00.000Z",
  expires_at: "2029-09-20T09:00:00.000Z",
};

const parsed = parseAuthorPartnerInviteesPayload({
  ok: true,
  invitees: [olderActivated, pending, newerActivated],
});

assert.deepEqual(
  parsed.map((item) => item.state),
  ["activated", "pending", "activated"],
  "newest event first",
);
assert.equal(
  parsed[0] && parsed[0].state === "activated" ? parsed[0].displayName : "",
  "Илья Орлов",
);

const pendingView = parsed.find((item) => item.state === "pending");
assert.ok(pendingView && pendingView.state === "pending");
assert.equal(pendingView.registeredAt, pending.registered_at);
assert.equal("expiresAt" in pendingView, false, "pending has no expires_at");
const pendingCard = describePartnerInvitee(pendingView);
assert.equal(pendingCard.badge, PARTNER_PENDING_STATUS);
assert.match(pendingCard.title, /Приглашение зафиксировано/);
assert.match(pendingCard.lines[0] ?? "", /Приглашение зафиксировано:/);
assert.equal(
  pendingCard.lines.some((line) => /Дата регистрации|зарегистрировался/.test(line)),
  false,
  "pending copy does not call attributed_at a signup date",
);
assert.equal(
  pendingCard.lines.some((line) => /20%/.test(line)),
  false,
  "pending does not say 20% is accruing",
);
assert.equal(
  pendingCard.lines.some((line) => /@/.test(line)),
  false,
);

const active = parsed.find(
  (item) => item.state === "activated" && item.displayName === "Мария Соколова",
);
assert.ok(active && active.state === "activated");
assert.equal(active.activatedAt, olderActivated.activated_at);
assert.equal(active.expiresAt, olderActivated.expires_at, "canonical expires_at, not recomputed");
const activeCard = describePartnerInvitee(active);
assert.match(activeCard.lines[1] ?? "", /20%/);
assert.equal(activeCard.lines[1], partnerRewardUntilCopy(active.expiresAt));
assert.match(activeCard.lines.join(" "), /не уменьшает роялти/);

const leaked = parseAuthorPartnerInviteesPayload({
  ok: true,
  invitees: [
    {
      state: "pending",
      registered_at: "2026-09-02T00:00:00.000Z",
      email: "secret@example.test",
    },
    {
      state: "activated",
      display_name: "hidden@example.test",
      activated_at: "2026-09-03T00:00:00.000Z",
      expires_at: "2029-09-03T00:00:00.000Z",
      invitee_user_id: "00000000-0000-4000-8000-000000000001",
    },
    {
      state: "activated",
      display_name: "Студия Рассвет",
      activated_at: "2026-09-04T00:00:00.000Z",
      expires_at: "2029-09-04T00:00:00.000Z",
    },
  ],
});
assert.equal(leaked.length, 1, "rows with email or auth id are dropped");
assert.equal(leaked[0]?.state === "activated" ? leaked[0].displayName : "", "Студия Рассвет");

const emailNamed = parseAuthorPartnerInviteesPayload({
  ok: true,
  invitees: [
    {
      state: "activated",
      display_name: "author@example.test",
      activated_at: "2026-09-05T00:00:00.000Z",
      expires_at: "2029-09-05T00:00:00.000Z",
    },
  ],
});
assert.equal(emailNamed[0]?.state === "activated" ? emailNamed[0].displayName : "", "Автор");
assert.equal(
  JSON.stringify(emailNamed).includes("@"),
  false,
  "UI payload keeps no invitee email",
);

assert.equal(parseAuthorPartnerInviteesPayload({ ok: false, invitees: [pending] }).length, 0);
assert.equal(PARTNER_INVITEES_EMPTY.includes("зафиксированных приглашений"), true);
assert.equal(/зарегистрировался/.test(PARTNER_INVITEES_EMPTY), false);

const resorted = sortPartnerInvitees(
  parseAuthorPartnerInviteesPayload({
    ok: true,
    invitees: [pending, newerActivated],
  }),
);
assert.equal(resorted[0]?.state, "activated");

console.log("author-partner-invitees-unit: ok");
