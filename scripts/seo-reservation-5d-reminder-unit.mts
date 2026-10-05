import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { processSeoReservation5dReminders } from "@/lib/email/process-seo-reservation-5d-reminders";
import {
  buildSeoReservation5dReminderSubject,
  renderSeoReservation5dReminderEmailText,
  SEO_RESERVATION_5D_REMINDER_EMAIL_SUBJECT,
} from "@/lib/email/templates/seo-reservation-5d-reminder";
import {
  formatSeoReservationExpiresAtMsk,
  isSeoReservationDueFor5dReminder,
  isValidReminderRecipientEmail,
  seoReservationProductBlocks5dReminder,
} from "@/lib/seo-queries/reservation-5d-reminder";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATION = readFileSync(
  join(ROOT, "supabase/migrations/20261220130000_seo_reservation_5d_reminder.sql"),
  "utf8",
);

const NOW = new Date("2026-10-05T12:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;

function reservedDaysAgo(days: number): string {
  return new Date(NOW.getTime() - days * DAY).toISOString();
}

function baseReservation(
  overrides: Partial<Parameters<typeof isSeoReservationDueFor5dReminder>[0]> = {},
) {
  return {
    status: "active",
    reservedAt: reservedDaysAgo(5),
    expiresAt: new Date(NOW.getTime() + 2 * DAY).toISOString(),
    reminder5dSentAt: null,
    product: null,
    ...overrides,
  };
}

assert.equal(
  isSeoReservationDueFor5dReminder(baseReservation({ reservedAt: reservedDaysAgo(4.9) }), NOW),
  false,
  "<5 days → no",
);

assert.equal(
  isSeoReservationDueFor5dReminder(baseReservation(), NOW),
  true,
  "5 days active no product → yes",
);

assert.equal(
  isSeoReservationDueFor5dReminder(
    baseReservation({
      product: { status: "published", moderationStatus: "approved" },
    }),
    NOW,
  ),
  false,
  "published → no",
);

assert.equal(
  isSeoReservationDueFor5dReminder(
    baseReservation({
      product: { status: "draft", moderationStatus: "submitted" },
    }),
    NOW,
  ),
  false,
  "on moderation → no",
);

assert.equal(
  isSeoReservationDueFor5dReminder(baseReservation({ status: "released" }), NOW),
  false,
  "released → no",
);

assert.equal(
  isSeoReservationDueFor5dReminder(
    baseReservation({
      expiresAt: new Date(NOW.getTime() - 60_000).toISOString(),
    }),
    NOW,
  ),
  false,
  "expired → no",
);

assert.equal(
  isSeoReservationDueFor5dReminder(
    baseReservation({ reminder5dSentAt: NOW.toISOString() }),
    NOW,
  ),
  false,
  "already sent → no",
);

assert.equal(
  seoReservationProductBlocks5dReminder({
    status: "draft",
    moderationStatus: "not_submitted",
  }),
  false,
);

assert.equal(
  seoReservationProductBlocks5dReminder({
    status: "draft",
    moderationStatus: "changes_requested",
  }),
  false,
);

assert.equal(
  isValidReminderRecipientEmail("author@example.test"),
  true,
);
assert.equal(isValidReminderRecipientEmail(null), false);
assert.equal(isValidReminderRecipientEmail("not-an-email"), false);

assert.equal(buildSeoReservation5dReminderSubject(), SEO_RESERVATION_5D_REMINDER_EMAIL_SUBJECT);

const text = renderSeoReservation5dReminderEmailText({
  queryText: "музыка для кофейни",
  expiresAtLabel: "7 октября 2026 г., 15:00",
});
assert.match(text, /«музыка для кофейни»/);
assert.match(text, /Уже прошло 5 дней/);
assert.match(text, /АудиоЛад/);
assert.match(text, /Бронь действует до: 7 октября 2026 г., 15:00 \(МСК\)\./);
assert.equal(
  formatSeoReservationExpiresAtMsk("2026-10-07T12:00:00.000Z")?.includes("2026"),
  true,
);

assert.match(MIGRATION, /reminder_5d_sent_at/);
assert.match(MIGRATION, /clock_timestamp\(\)/);
assert.match(MIGRATION, /interval '5 days'/);
assert.equal(MIGRATION.includes("now() + interval '7 days'"), false);
assert.equal(MIGRATION.includes("CREATE OR REPLACE FUNCTION public.expire_seo_query_reservation"), false);
assert.match(MIGRATION, /FOR UPDATE OF r SKIP LOCKED/);
assert.match(MIGRATION, /claim_seo_reservation_5d_reminders/);
assert.match(MIGRATION, /count_seo_reservation_5d_reminder_candidates/);

type ClaimRow = {
  reservation_id: string;
  author_id: string;
  query_id: string;
  query_text: string;
  expires_at: string | null;
  reserved_at: string;
  recipient_email: string | null;
  lease_token: string;
};

function mockClient(options: {
  claims: ClaimRow[][];
  onComplete?: (args: Record<string, unknown>) => void;
  onFail?: (args: Record<string, unknown>) => void;
}) {
  const claimQueues = [...options.claims];
  const calls: Array<{ fn: string; args: Record<string, unknown> }> = [];
  return {
    calls,
    client: {
      rpc: async (fn: string, args: Record<string, unknown> = {}) => {
        calls.push({ fn, args });
        if (fn === "claim_seo_reservation_5d_reminders") {
          const next = claimQueues.shift() ?? [];
          return { data: next, error: null };
        }
        if (fn === "complete_seo_reservation_5d_reminder") {
          options.onComplete?.(args);
          return { data: true, error: null };
        }
        if (fn === "fail_seo_reservation_5d_reminder") {
          options.onFail?.(args);
          return { data: true, error: null };
        }
        return { data: null, error: { message: `unexpected ${fn}` } };
      },
    },
  };
}

const row: ClaimRow = {
  reservation_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  author_id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
  query_id: "cccccccc-cccc-cccc-cccc-cccccccccccc",
  query_text: "музыка для кофейни",
  expires_at: "2026-10-07T12:00:00.000Z",
  reserved_at: reservedDaysAgo(5),
  recipient_email: "author@example.test",
  lease_token: "dddddddd-dddd-dddd-dddd-dddddddddddd",
};

{
  const completed: string[] = [];
  const { client } = mockClient({
    claims: [[row], []],
    onComplete: (args) => completed.push(String(args.p_reservation_id)),
  });
  let sendCount = 0;
  const first = await processSeoReservation5dReminders({
    supabase: client,
    send: async () => {
      sendCount += 1;
      return { ok: true };
    },
  });
  assert.deepEqual(first, { claimed: 1, sent: 1, skipped: 0, failed: 0 });
  const second = await processSeoReservation5dReminders({
    supabase: client,
    send: async () => {
      sendCount += 1;
      return { ok: true };
    },
  });
  assert.deepEqual(second, { claimed: 0, sent: 0, skipped: 0, failed: 0 });
  assert.equal(sendCount, 1, "worker run twice → no duplicate send");
  assert.deepEqual(completed, [row.reservation_id]);
}

{
  const fails: Array<Record<string, unknown>> = [];
  const { client } = mockClient({
    claims: [[{ ...row, recipient_email: null }]],
    onFail: (args) => fails.push(args),
  });
  let sendCount = 0;
  const result = await processSeoReservation5dReminders({
    supabase: client,
    send: async () => {
      sendCount += 1;
      return { ok: true };
    },
  });
  assert.deepEqual(result, { claimed: 1, sent: 0, skipped: 1, failed: 0 });
  assert.equal(sendCount, 0, "missing email → no send");
  assert.equal(fails[0]?.p_permanent, true);
}

{
  const fails: Array<Record<string, unknown>> = [];
  const { client } = mockClient({
    claims: [[row]],
    onFail: (args) => fails.push(args),
  });
  const result = await processSeoReservation5dReminders({
    supabase: client,
    send: async () => ({ ok: false, code: "send_failed" }),
  });
  assert.deepEqual(result, { claimed: 1, sent: 0, skipped: 0, failed: 1 });
  assert.equal(fails[0]?.p_permanent, false, "SMTP fail releases lease for retry");
}

{
  // admin-released / author-released are status checks in eligibility
  assert.equal(
    isSeoReservationDueFor5dReminder(baseReservation({ status: "released" }), NOW),
    false,
    "admin/author released → no",
  );
}

console.log("seo-reservation-5d-reminder-unit: ok");
