import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { processBusinessAccessReminders } from "@/lib/email/process-business-access-reminders";
import {
  BUSINESS_ACCESS_REMINDER_BUTTON_LABEL,
  BUSINESS_ACCESS_REMINDER_SUBJECTS,
  businessAccessReminderParagraphs,
  businessAccessReminderSubject,
  renderBusinessAccessReminderEmailHtml,
  renderBusinessAccessReminderEmailText,
} from "@/lib/email/templates/business-access-reminder";
import { BUSINESS_EMAIL_COLORS, BUSINESS_EMAIL_SENDER_NAME } from "@/lib/email/templates/business-layout";
import {
  BUSINESS_ACCESS_REMINDER_CABINET_URL,
  BUSINESS_ACCESS_REMINDER_LEAD_DAYS,
  businessAccessReminderDedupeKey,
  businessAccessReminderKind,
} from "@/lib/business/access-reminders";
import { BUSINESS_GRACE_DAYS, formatBusinessMonthlyPrice } from "@/lib/business/plan";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATION = readFileSync(
  join(ROOT, "supabase/migrations/20270207140000_business_access_reminder_emails.sql"),
  "utf8",
);

const END = "2026-11-22T12:00:00.000Z";
const DAY = 24 * 60 * 60 * 1000;

assert.equal(BUSINESS_ACCESS_REMINDER_LEAD_DAYS, 3);
assert.equal(BUSINESS_GRACE_DAYS, 3);

assert.equal(businessAccessReminderKind(END, new Date("2026-11-18T12:00:00.000Z")), null, "4 days before");
assert.equal(
  businessAccessReminderKind(END, new Date("2026-11-19T12:00:00.000Z")),
  "before_end",
  "3 calendar days before",
);
assert.equal(
  businessAccessReminderKind(END, new Date("2026-11-21T20:00:00.000Z")),
  "before_end",
  "the day before",
);
assert.equal(
  businessAccessReminderKind(END, new Date("2026-11-22T09:00:00.000Z")),
  null,
  "morning of the end day, access still open",
);
assert.equal(
  businessAccessReminderKind(END, new Date("2026-11-22T12:00:00.000Z")),
  "grace_start",
  "the end instant starts grace",
);
assert.equal(
  businessAccessReminderKind(END, new Date("2026-11-24T12:00:00.000Z")),
  "grace_start",
  "middle grace day is still the one end-of-access letter",
);
assert.equal(
  businessAccessReminderKind(END, new Date("2026-11-25T09:00:00.000Z")),
  "grace_last",
  "last grace day",
);
assert.equal(
  businessAccessReminderKind(END, new Date("2026-11-25T12:00:00.000Z")),
  null,
  "grace is already closed",
);
assert.equal(businessAccessReminderKind("not-a-date", new Date(END)), null);

const userId = "11111111-1111-1111-1111-111111111111";
const keys = (["before_end", "grace_start", "grace_last"] as const).map((kind) =>
  businessAccessReminderDedupeKey(userId, END, kind),
);
assert.equal(new Set(keys).size, 3, "each kind is its own send");
assert.equal(
  businessAccessReminderDedupeKey(userId, END, "before_end"),
  businessAccessReminderDedupeKey(userId, END, "before_end"),
);
assert.notEqual(
  businessAccessReminderDedupeKey(userId, END, "before_end"),
  businessAccessReminderDedupeKey(userId, new Date(Date.parse(END) + DAY).toISOString(), "before_end"),
);

const labels = {
  endsAtLabel: "22 ноября 2026 г., 15:00 МСК",
  graceEndsLabel: "25 ноября 2026 г., 15:00 МСК",
};
const price = formatBusinessMonthlyPrice();

for (const kind of ["before_end", "grace_start", "grace_last"] as const) {
  const subject = businessAccessReminderSubject(kind);
  const paragraphs = businessAccessReminderParagraphs({ kind, ...labels });
  const text = renderBusinessAccessReminderEmailText({ kind, ...labels });
  const html = renderBusinessAccessReminderEmailHtml({ kind, ...labels });
  assert.equal(subject, BUSINESS_ACCESS_REMINDER_SUBJECTS[kind]);
  assert.equal(subject.includes("—"), false, subject);
  assert.equal(text.includes("—"), false);
  assert.equal(html.includes("—"), false);
  assert.equal(paragraphs.join("\n").includes("—"), false);
  assert.match(text, new RegExp(price.replace(" ", " ")));
  assert.match(text, /799 ₽ за 30 дней/);
  assert.match(text, /Автосписания нет/);
  assert.match(text, new RegExp(BUSINESS_ACCESS_REMINDER_BUTTON_LABEL));
  assert.ok(text.includes(BUSINESS_ACCESS_REMINDER_CABINET_URL));
  assert.equal(/отпис|unsubscribe/i.test(text + html), false, "service letter has no unsubscribe");
  const urls = html.match(/https?:\/\/[^"'\s<]+/g) ?? [];
  assert.ok(urls.length >= 2, html);
  for (const url of urls) {
    assert.ok(url.startsWith("https://business.audiolad.ru"), url);
  }
  assert.ok(html.includes(`href="${BUSINESS_ACCESS_REMINDER_CABINET_URL}"`) || html.includes("https://business.audiolad.ru/#dostup"));
  assert.ok(html.includes(BUSINESS_EMAIL_SENDER_NAME));
  assert.ok(html.includes(BUSINESS_EMAIL_COLORS.accent));
  assert.ok(html.includes(BUSINESS_EMAIL_COLORS.background));
  assert.ok(html.includes(BUSINESS_EMAIL_COLORS.text));
  assert.equal(html.includes("#6633cc"), false, "purple AudioLad button must not be used");
  assert.equal(html.includes("#5e2ca5"), false);
  assert.match(text, /Команда АудиоЛад Бизнес/);
}

assert.match(
  businessAccessReminderParagraphs({ kind: "before_end", ...labels }).join("\n"),
  /действует до 22 ноября 2026 г\., 15:00 МСК/,
);
assert.match(
  businessAccessReminderParagraphs({ kind: "grace_start", ...labels }).join("\n"),
  /закончился 22 ноября 2026 г\., 15:00 МСК/,
);
assert.match(
  businessAccessReminderParagraphs({ kind: "grace_last", ...labels }).join("\n"),
  /играет до 25 ноября 2026 г\., 15:00 МСК/,
);

assert.match(MIGRATION, /business_access_service/);
assert.match(MIGRATION, /service_notifications IS FALSE/);
assert.match(MIGRATION, /scope IN \('all', 'all_non_critical'\)/);
assert.match(MIGRATION, /UNIQUE \(user_id, period_end, reminder_kind\)/);
assert.match(MIGRATION, /clock_timestamp\(\)/);
assert.match(MIGRATION, /interval '3 days'/);
assert.match(MIGRATION, /BETWEEN 1 AND 3/);
assert.match(MIGRATION, /Europe\/Moscow/);
assert.equal(MIGRATION.includes("DROP TABLE public.access_grants"), false);
assert.equal(MIGRATION.includes("DROP TABLE public.access_paid_periods"), false);

const REMINDER_SOURCE = readFileSync(
  join(ROOT, "src/lib/email/templates/business-access-reminder.ts"),
  "utf8",
);
const PURPLE_SHELL = readFileSync(join(ROOT, "src/lib/email/templates/brand-layout.ts"), "utf8");
assert.equal(REMINDER_SOURCE.includes("brand-layout"), false);
assert.match(REMINDER_SOURCE, /business-layout/);
assert.match(PURPLE_SHELL, /#6633cc/, "regular AudioLad letters stay on the purple shell");

type ClaimRow = {
  send_id: string;
  user_id: string;
  period_end: string;
  reminder_kind: string;
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
        if (fn === "claim_business_access_reminders") {
          return { data: claimQueues.shift() ?? [], error: null };
        }
        if (fn === "complete_business_access_reminder") {
          options.onComplete?.(args);
          return { data: true, error: null };
        }
        if (fn === "fail_business_access_reminder") {
          options.onFail?.(args);
          return { data: true, error: null };
        }
        return { data: null, error: { message: `unexpected ${fn}` } };
      },
    },
  };
}

const row: ClaimRow = {
  send_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  user_id: userId,
  period_end: END,
  reminder_kind: "grace_start",
  recipient_email: "owner@example.test",
  lease_token: "dddddddd-dddd-dddd-dddd-dddddddddddd",
};

{
  const completed: string[] = [];
  const { client } = mockClient({
    claims: [[row], []],
    onComplete: (args) => completed.push(String(args.p_send_id)),
  });
  let sendCount = 0;
  const first = await processBusinessAccessReminders({
    supabase: client,
    send: async () => {
      sendCount += 1;
      return { ok: true };
    },
  });
  assert.deepEqual(first, { claimed: 1, sent: 1, skipped: 0, failed: 0 });
  const second = await processBusinessAccessReminders({
    supabase: client,
    send: async () => {
      sendCount += 1;
      return { ok: true };
    },
  });
  assert.deepEqual(second, { claimed: 0, sent: 0, skipped: 0, failed: 0 });
  assert.equal(sendCount, 1, "second run does not send again");
  assert.deepEqual(completed, [row.send_id]);
}

{
  const fails: Array<Record<string, unknown>> = [];
  const { client } = mockClient({
    claims: [[{ ...row, recipient_email: null }]],
    onFail: (args) => fails.push(args),
  });
  let sendCount = 0;
  const result = await processBusinessAccessReminders({
    supabase: client,
    send: async () => {
      sendCount += 1;
      return { ok: true };
    },
  });
  assert.deepEqual(result, { claimed: 1, sent: 0, skipped: 1, failed: 0 });
  assert.equal(sendCount, 0);
  assert.equal(fails[0]?.p_permanent, true);
}

{
  const fails: Array<Record<string, unknown>> = [];
  const { client } = mockClient({
    claims: [[row]],
    onFail: (args) => fails.push(args),
  });
  const result = await processBusinessAccessReminders({
    supabase: client,
    send: async () => ({ ok: false, code: "send_failed" }),
  });
  assert.deepEqual(result, { claimed: 1, sent: 0, skipped: 0, failed: 1 });
  assert.equal(fails[0]?.p_permanent, false);
}

{
  const fails: Array<Record<string, unknown>> = [];
  const { client } = mockClient({
    claims: [[row]],
    onFail: (args) => fails.push(args),
  });
  const result = await processBusinessAccessReminders({
    supabase: client,
    send: async () => ({ ok: false, code: "smtp_not_configured" }),
  });
  assert.deepEqual(result, { claimed: 1, sent: 0, skipped: 0, failed: 1 });
  assert.equal(fails[0]?.p_permanent, false, "missing SMTP retries later and does not send now");
}

console.log("business-access-reminder-unit: ok");
