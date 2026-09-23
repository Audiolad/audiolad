import assert from "node:assert/strict";

import {
  payloadIndicatesFirstPartnerActivation,
  shouldEnqueuePartnerActivationEmail,
} from "@/lib/author-partner/activation-email-policy";
import {
  isPartnerActivationEmailPayload,
  processAuthorPartnerActivationEmailOutbox,
} from "@/lib/email/process-author-partner-activation-email";
import { partnerActivationEmailFromAddress } from "@/lib/email/send-partner-author-activated-email";
import {
  PARTNER_AUTHOR_ACTIVATED_EMAIL_SUBJECT,
  renderPartnerAuthorActivatedEmailText,
} from "@/lib/email/templates/partner-author-activated";

assert.equal(
  shouldEnqueuePartnerActivationEmail({
    previousActivatedAt: null,
    nextActivatedAt: "2026-09-23T10:00:00.000Z",
    nextStatus: "activated",
  }),
  true,
  "first activation enqueues",
);

assert.equal(
  shouldEnqueuePartnerActivationEmail({
    previousActivatedAt: "2026-09-23T10:00:00.000Z",
    nextActivatedAt: "2026-09-23T10:00:00.000Z",
    nextStatus: "activated",
  }),
  false,
  "retry does not enqueue a second email",
);

assert.equal(
  shouldEnqueuePartnerActivationEmail({
    previousActivatedAt: null,
    nextActivatedAt: null,
    nextStatus: "attributed",
  }),
  false,
  "plain registration does not enqueue",
);

assert.equal(
  shouldEnqueuePartnerActivationEmail({
    previousActivatedAt: null,
    nextActivatedAt: null,
    nextStatus: "void",
  }),
  false,
  "missing referral is not an activation",
);

assert.equal(payloadIndicatesFirstPartnerActivation({ result: "bound" }), false);
assert.equal(payloadIndicatesFirstPartnerActivation({ result: "no_referral" }), false);
assert.equal(
  payloadIndicatesFirstPartnerActivation({ result: "already_activated" }),
  false,
);
assert.equal(
  payloadIndicatesFirstPartnerActivation({
    ok: true,
    partner_finalize: { result: "activated", referral_id: "ref-1" },
  }),
  true,
);

assert.equal(partnerActivationEmailFromAddress(), "authors@audiolad.ru");
assert.equal(
  PARTNER_AUTHOR_ACTIVATED_EMAIL_SUBJECT,
  "По вашей партнёрской ссылке появился новый автор",
);

const text = renderPartnerAuthorActivatedEmailText({
  partnerName: "Сергей",
  inviteeAuthorName: "Мария Соколова",
  activatedAt: "2026-09-23T10:00:00.000Z",
  expiresAt: "2029-09-23T10:00:00.000Z",
  siteOrigin: "https://audiolad.ru",
});
assert.match(text, /Здравствуйте, Сергей!/);
assert.match(text, /Мария Соколова стал автором/);
assert.match(text, /20%/);
assert.match(text, /не уменьшает роялти/);
assert.match(text, /Ваши 20%/);
assert.match(text, /https:\/\/audiolad\.ru\/author-dashboard\/your-20/);
assert.equal(text.includes("@"), false, "body has no email address");
assert.equal(text.includes("2029"), true, "end date comes from expires_at");

const safePayload = {
  partner_name: "Сергей",
  invitee_author_name: "Мария Соколова",
  activated_at: "2026-09-23T10:00:00.000Z",
  expires_at: "2029-09-23T10:00:00.000Z",
};
assert.equal(isPartnerActivationEmailPayload(safePayload), true);
assert.equal(
  isPartnerActivationEmailPayload({
    ...safePayload,
    invitee_email: "hidden@example.test",
  }),
  false,
);

type Call = { fn: string; args: Record<string, unknown> };

function client(rowsByClaim: unknown[][]) {
  const calls: Call[] = [];
  let claim = 0;
  return {
    calls,
    rpc: async (fn: string, args: Record<string, unknown>) => {
      calls.push({ fn, args });
      if (fn === "claim_author_partner_activation_email_outbox") {
        const rows = rowsByClaim[claim] ?? [];
        claim += 1;
        return { data: rows, error: null };
      }
      return { data: true, error: null };
    },
  };
}

function row(id: string, referralId: string, email: string) {
  return {
    id,
    referral_id: referralId,
    recipient_email: email,
    lease_token: `lease-${id}`,
    payload: { ...safePayload },
  };
}

const sentTo: string[] = [];
const referralIds: string[] = [];

async function send(input: {
  toEmail: string;
  referralId: string;
  activatedAt: string;
  expiresAt: string;
}) {
  sentTo.push(input.toEmail);
  referralIds.push(input.referralId);
  assert.equal(input.activatedAt, safePayload.activated_at);
  assert.equal(input.expiresAt, safePayload.expires_at);
  return { ok: true as const };
}

const first = client([
  [row("1", "referral-a", "partner-a@example.test")],
]);
const firstResult = await processAuthorPartnerActivationEmailOutbox({
  supabase: first as never,
  send,
});
assert.deepEqual(firstResult, { claimed: 1, sent: 1, failed: 0 });
assert.equal(sentTo.length, 1);
assert.equal(
  first.calls.at(-1)?.fn,
  "complete_author_partner_activation_email_outbox",
);

const retry = client([[]]);
const retryResult = await processAuthorPartnerActivationEmailOutbox({
  supabase: retry as never,
  send,
});
assert.deepEqual(retryResult, { claimed: 0, sent: 0, failed: 0 });
assert.equal(sentTo.length, 1, "retry does not send a second email");

const two = client([
  [
    row("2", "referral-b", "partner-b@example.test"),
    row("3", "referral-c", "partner-b@example.test"),
  ],
]);
const twoResult = await processAuthorPartnerActivationEmailOutbox({
  supabase: two as never,
  send,
});
assert.deepEqual(twoResult, { claimed: 2, sent: 2, failed: 0 });
assert.deepEqual(referralIds.slice(-2), ["referral-b", "referral-c"]);

const otherPartner = client([
  [row("4", "referral-d", "other-partner@example.test")],
]);
await processAuthorPartnerActivationEmailOutbox({
  supabase: otherPartner as never,
  send,
});
assert.equal(sentTo.at(-1), "other-partner@example.test");
assert.equal(sentTo.includes("current-partner@example.test"), false);

const leaked = client([
  [
    {
      id: "5",
      referral_id: "referral-e",
      recipient_email: "partner-a@example.test",
      lease_token: "lease-5",
      payload: { ...safePayload, invitee_email: "invitee@example.test" },
    },
  ],
]);
let leakedSends = 0;
const leakedResult = await processAuthorPartnerActivationEmailOutbox({
  supabase: leaked as never,
  send: async () => {
    leakedSends += 1;
    return { ok: true as const };
  },
});
assert.equal(leakedSends, 0, "invitee email in payload is not mailed");
assert.deepEqual(leakedResult, { claimed: 1, sent: 0, failed: 1 });
assert.equal(leaked.calls.at(-1)?.fn, "fail_author_partner_activation_email_outbox");

console.log("author-partner-activation-email-unit: ok");
