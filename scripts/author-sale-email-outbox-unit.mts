import assert from "node:assert/strict";

import { processAuthorSaleEmailOutbox } from "@/lib/email/process-author-sale-email-outbox";

const row = {
  id: "outbox-1",
  sale_id: "sale-1",
  recipient_email: "author@example.test",
  lease_token: "lease-1",
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

function makeClient(claimedRows: unknown[]) {
  const calls: Array<{ fn: string; args: Record<string, unknown> }> = [];
  return {
    calls,
    rpc: async (fn: string, args: Record<string, unknown>) => {
      calls.push({ fn, args });
      if (fn === "claim_author_sale_email_outbox") {
        return { data: claimedRows, error: null };
      }
      return { data: true, error: null };
    },
  };
}

async function main() {
  const failedClient = makeClient([row]);
  const failed = await processAuthorSaleEmailOutbox({
    supabase: failedClient as never,
    send: async () => ({ ok: false, code: "send_failed" }),
  });
  assert.deepEqual(failed, { claimed: 1, sent: 0, failed: 1 });
  assert.equal(
    failedClient.calls.at(-1)?.fn,
    "fail_author_sale_email_outbox",
    "SMTP failure is persisted for retry",
  );

  const sentClient = makeClient([row]);
  const sent = await processAuthorSaleEmailOutbox({
    supabase: sentClient as never,
    send: async () => ({ ok: true }),
  });
  assert.deepEqual(sent, { claimed: 1, sent: 1, failed: 0 });
  assert.equal(
    sentClient.calls.at(-1)?.fn,
    "complete_author_sale_email_outbox",
    "successful send is marked sent",
  );

  // Simulated crash-window: SMTP accepted the first send but persisting sent
  // failed. After lease recovery the same event is retried with the same
  // deterministic sale id; the durable outbox remains consistent, while SMTP
  // can theoretically receive a duplicate.
  const crashClient = makeClient([row]);
  crashClient.rpc = async (fn: string, args: Record<string, unknown>) => {
    crashClient.calls.push({ fn, args });
    if (fn === "claim_author_sale_email_outbox") return { data: [row], error: null };
    if (fn === "complete_author_sale_email_outbox") return { data: false, error: null };
    return { data: true, error: null };
  };
  await assert.rejects(
    processAuthorSaleEmailOutbox({
      supabase: crashClient as never,
      send: async () => ({ ok: true }),
    }),
    /author_sale_email_outbox_complete_failed/,
  );
  const recoveredClient = makeClient([{ ...row, lease_token: "lease-2" }]);
  const recovered = await processAuthorSaleEmailOutbox({
    supabase: recoveredClient as never,
    send: async () => ({ ok: true }),
  });
  assert.deepEqual(recovered, { claimed: 1, sent: 1, failed: 0 });

  const emptyClient = makeClient([]);
  const repeated = await processAuthorSaleEmailOutbox({
    supabase: emptyClient as never,
    send: async () => {
      throw new Error("must_not_send");
    },
  });
  assert.deepEqual(repeated, { claimed: 0, sent: 0, failed: 0 });
  console.log("author-sale-email-outbox-unit: ok");
}

await main();
