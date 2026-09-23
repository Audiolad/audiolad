import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  formatInstalledAuthorEmailOutboxCycle,
  runInstalledAuthorEmailOutboxCycle,
  saleWrapperSummaryLine,
} from "@/lib/email/run-installed-author-email-outbox-cycle";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

const partnerPayload = {
  partner_name: "Сергей",
  invitee_author_name: "Мария Соколова",
  activated_at: "2026-09-23T10:00:00.000Z",
  expires_at: "2029-09-23T10:00:00.000Z",
};

type PartnerStatus = "pending" | "failed" | "processing" | "sent";

type PartnerRow = {
  id: string;
  referral_id: string;
  recipient_email: string;
  status: PartnerStatus;
  next_attempt_at: string;
  lease_token: string | null;
  payload: Record<string, unknown>;
};

type RpcClient = {
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{
    data: unknown;
    error: { message: string } | null;
  }>;
};

function partnerQueue(initial: PartnerRow[]) {
  const rows = initial.map((row) => ({ ...row, payload: { ...row.payload } }));
  const calls: Array<{ fn: string; args: Record<string, unknown> }> = [];
  const client: RpcClient = {
    rpc: async (fn, args = {}) => {
      calls.push({ fn, args });
      if (fn === "claim_author_partner_activation_email_outbox") {
        const now = Date.now();
        const due = rows.filter(
          (row) =>
            (row.status === "pending" || row.status === "failed") &&
            new Date(row.next_attempt_at).getTime() <= now,
        );
        for (const row of due) {
          row.status = "processing";
          row.lease_token = `lease-${row.id}`;
        }
        return {
          data: due.map((row) => ({
            id: row.id,
            referral_id: row.referral_id,
            recipient_email: row.recipient_email,
            lease_token: row.lease_token,
            payload: row.payload,
          })),
          error: null,
        };
      }
      if (fn === "complete_author_partner_activation_email_outbox") {
        const row = rows.find(
          (item) =>
            item.id === args.p_id && item.lease_token === args.p_lease_token,
        );
        if (!row) return { data: false, error: null };
        row.status = "sent";
        row.lease_token = null;
        return { data: true, error: null };
      }
      if (fn === "fail_author_partner_activation_email_outbox") {
        const row = rows.find(
          (item) =>
            item.id === args.p_id && item.lease_token === args.p_lease_token,
        );
        if (!row) return { data: false, error: null };
        row.status = "failed";
        row.lease_token = null;
        row.next_attempt_at = new Date(Date.now() + 60_000).toISOString();
        return { data: true, error: null };
      }
      return { data: null, error: { message: `unexpected ${fn}` } };
    },
  };
  return { rows, calls, client };
}

function saleQueue(claimedRows: unknown[], options?: { claimError?: string }) {
  const calls: Array<{ fn: string; args: Record<string, unknown> }> = [];
  const sentSaleIds: string[] = [];
  const client: RpcClient = {
    rpc: async (fn, args = {}) => {
      calls.push({ fn, args });
      if (fn === "claim_author_sale_email_outbox") {
        if (options?.claimError) {
          return { data: null, error: { message: options.claimError } };
        }
        return { data: claimedRows, error: null };
      }
      return { data: true, error: null };
    },
  };
  return { calls, sentSaleIds, client };
}

const saleRow = {
  id: "sale-outbox-1",
  sale_id: "sale-1",
  recipient_email: "author@example.test",
  lease_token: "sale-lease-1",
  payload: {
    author_name: "Автор",
    product_title: "Продукт",
    buyer_first_name: "Покупатель",
    buyer_last_name: null,
    paid_at: "2026-07-30T10:00:00.000Z",
    amount_minor: 10000,
    author_amount_minor: 7000,
    author_amount_pending: false,
  },
};

const dueFailed: PartnerRow = {
  id: "partner-due",
  referral_id: "referral-due",
  recipient_email: "partner@example.test",
  status: "failed",
  next_attempt_at: new Date(Date.now() - 60_000).toISOString(),
  lease_token: null,
  payload: partnerPayload,
};

const futureFailed: PartnerRow = {
  id: "partner-future",
  referral_id: "referral-future",
  recipient_email: "partner@example.test",
  status: "failed",
  next_attempt_at: new Date(Date.now() + 3_600_000).toISOString(),
  lease_token: null,
  payload: partnerPayload,
};

const partner = partnerQueue([dueFailed, futureFailed]);
const sale = saleQueue([saleRow]);
const sentReferrals: string[] = [];

const firstTick = await runInstalledAuthorEmailOutboxCycle({
  sale: {
    supabase: sale.client as never,
    send: async (input) => {
      sale.sentSaleIds.push(input.saleId);
      return { ok: true };
    },
  },
  partner: {
    supabase: partner.client as never,
    send: async (input) => {
      sentReferrals.push(input.referralId);
      assert.equal(input.activatedAt, partnerPayload.activated_at);
      assert.equal(input.expiresAt, partnerPayload.expires_at);
      return { ok: true };
    },
  },
});

assert.equal(firstTick.sale.ok, true);
assert.deepEqual(firstTick.sale.ok ? firstTick.sale.result : null, {
  claimed: 1,
  sent: 1,
  failed: 0,
});
assert.deepEqual(sale.sentSaleIds, ["sale-1"]);
assert.equal(
  sale.calls.some((call) => call.fn === "complete_author_sale_email_outbox"),
  true,
  "sale lease is completed by the sale RPC",
);
assert.deepEqual(sentReferrals, ["referral-due"]);
assert.equal(firstTick.partner.ok, true);
assert.deepEqual(firstTick.partner.ok ? firstTick.partner.result : null, {
  claimed: 1,
  sent: 1,
  failed: 0,
});
assert.equal(partner.rows.find((row) => row.id === "partner-due")?.status, "sent");
assert.equal(
  partner.rows.find((row) => row.id === "partner-future")?.status,
  "failed",
  "failed row with a future next_attempt_at stays until it is due",
);
assert.equal(
  partner.calls.some((call) => call.fn === "claim_author_partner_activation_email_outbox"),
  true,
);
assert.equal(
  partner.calls.some((call) => call.fn === "complete_author_partner_activation_email_outbox"),
  true,
  "partner lease is completed by its own RPC",
);

const idlePartnerSends: string[] = [];
const secondTick = await runInstalledAuthorEmailOutboxCycle({
  sale: {
    supabase: saleQueue([]).client as never,
    send: async () => {
      throw new Error("sale_must_not_send");
    },
  },
  partner: {
    supabase: partner.client as never,
    send: async () => {
      idlePartnerSends.push("sent");
      return { ok: true };
    },
  },
});
assert.deepEqual(secondTick.partner.ok ? secondTick.partner.result : null, {
  claimed: 0,
  sent: 0,
  failed: 0,
});
assert.deepEqual(idlePartnerSends, []);

const partnerDown = await runInstalledAuthorEmailOutboxCycle({
  sale: {
    supabase: saleQueue([saleRow]).client as never,
    send: async () => ({ ok: true }),
  },
  partner: {
    supabase: {
      rpc: async () => {
        throw new Error("partner_db_down");
      },
    } as never,
  },
});
assert.equal(partnerDown.sale.ok, true);
assert.deepEqual(partnerDown.sale.ok ? partnerDown.sale.result : null, {
  claimed: 1,
  sent: 1,
  failed: 0,
});
assert.equal(partnerDown.partner.ok, false);
const partnerDownOutput = formatInstalledAuthorEmailOutboxCycle(partnerDown);
assert.equal(partnerDownOutput.exitCode, 0);
assert.equal(partnerDownOutput.stdout, '{"claimed":1,"sent":1,"failed":0}');
assert.match(partnerDownOutput.stderr, /partner_activation_email_outbox_failed/);
assert.equal(
  saleWrapperSummaryLine(`${partnerDownOutput.stderr}\n${partnerDownOutput.stdout}`),
  partnerDownOutput.stdout,
);

const retryQueue = partnerQueue([
  {
    ...dueFailed,
    id: "partner-retry",
    referral_id: "referral-retry",
    status: "failed",
    next_attempt_at: new Date(Date.now() - 5_000).toISOString(),
  },
]);
const saleDown = await runInstalledAuthorEmailOutboxCycle({
  sale: {
    supabase: saleQueue([], { claimError: "sale_db_down" }).client as never,
    send: async () => ({ ok: true }),
  },
  partner: {
    supabase: retryQueue.client as never,
    send: async (input) => {
      assert.equal(input.referralId, "referral-retry");
      return { ok: true };
    },
  },
});
assert.equal(saleDown.sale.ok, false);
assert.equal(saleDown.partner.ok, true);
assert.deepEqual(saleDown.partner.ok ? saleDown.partner.result : null, {
  claimed: 1,
  sent: 1,
  failed: 0,
});
assert.equal(retryQueue.rows[0]?.status, "sent");
const saleDownOutput = formatInstalledAuthorEmailOutboxCycle(saleDown);
assert.equal(saleDownOutput.exitCode, 1);
assert.equal(saleDownOutput.stdout, "");
assert.match(saleDownOutput.stderr, /author_sale_email_outbox_claim_failed:sale_db_down/);
assert.equal(saleWrapperSummaryLine(saleDownOutput.stderr), "");

const cycleSource = readFileSync(
  join(repoRoot, "src/lib/email/run-installed-author-email-outbox-cycle.ts"),
  "utf8",
);
const runnerSource = readFileSync(
  join(repoRoot, "scripts/process-author-sale-email-outbox.ts"),
  "utf8",
);
assert.equal(cycleSource.includes("drainPartnerActivationEmailIfNeeded"), false);
assert.equal(cycleSource.includes("finalize_author_partner_referral"), false);
assert.match(runnerSource, /runInstalledAuthorEmailOutboxCycle/);
assert.match(
  readFileSync(join(repoRoot, "package.json"), "utf8"),
  /"run:author-sale-email-outbox": "npx tsx scripts\/process-author-sale-email-outbox\.ts"/,
);
assert.match(
  readFileSync(join(repoRoot, "deploy/scripts/run-author-sale-email-outbox.sh"), "utf8"),
  /run run:author-sale-email-outbox/,
);

console.log("author-email-outbox-cycle-unit: ok");
