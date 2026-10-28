import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { processBusinessAccessReminders } from "@/lib/email/process-business-access-reminders";
import {
  BUSINESS_ACCESS_REMINDER_BUTTON_LABEL,
  BUSINESS_ACCESS_REMINDER_SUBJECTS,
  businessAccessReminderGraceDaysLeft,
  businessAccessReminderGraceDaysPhrase,
  businessAccessReminderParagraphs,
  businessAccessReminderSubject,
  renderBusinessAccessReminderEmailHtml,
  renderBusinessAccessReminderEmailText,
} from "@/lib/email/templates/business-access-reminder";
import {
  BUSINESS_EMAIL_COLORS,
  BUSINESS_EMAIL_SENDER_NAME,
  isBusinessEmailUrl,
} from "@/lib/email/templates/business-layout";
import {
  BUSINESS_RENEWAL_IMPROVEMENT_QUESTION,
  BUSINESS_RENEWAL_NO_URL,
  BUSINESS_RENEWAL_NOTE_ERROR,
  BUSINESS_RENEWAL_QUESTION,
  BUSINESS_RENEWAL_RETRY_LABEL,
  BUSINESS_RENEWAL_YES_URL,
  parseRenewalChoiceHash,
  renewalAnswerBlocksReminders,
  renewalDeclineApplies,
  renewalQuestionVisible,
} from "@/lib/business/renewal-choice";
import {
  BUSINESS_ACCESS_REMINDER_CABINET_URL,
  BUSINESS_ACCESS_REMINDER_LEAD_DAYS,
  businessAccessReminderDedupeKey,
  businessAccessReminderKind,
  businessAccessReminderLastSendDay,
  businessAccessReminderSendWindowOpen,
} from "@/lib/business/access-reminders";
import { BUSINESS_GRACE_DAYS, formatBusinessMonthlyPrice } from "@/lib/business/plan";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATION = readFileSync(
  join(ROOT, "supabase/migrations/20270207140000_business_access_reminder_emails.sql"),
  "utf8",
);

const END = "2026-11-22T12:00:00.000Z";
const NOON_MSK = new Date("2026-11-20T09:00:00.000Z");

// Letters only 10:00–20:00 Europe/Moscow (UTC+3).
assert.equal(businessAccessReminderSendWindowOpen(new Date("2026-11-20T06:59:59.000Z")), false, "09:59 MSK");
assert.equal(businessAccessReminderSendWindowOpen(new Date("2026-11-20T07:00:00.000Z")), true, "10:00 MSK");
assert.equal(businessAccessReminderSendWindowOpen(new Date("2026-11-20T16:59:59.000Z")), true, "19:59 MSK");
assert.equal(businessAccessReminderSendWindowOpen(new Date("2026-11-20T17:00:00.000Z")), false, "20:00 MSK");
assert.equal(businessAccessReminderSendWindowOpen(new Date("2026-11-20T00:00:00.000Z")), false, "03:00 MSK");

// Grace ending just after midnight MSK: the last-day letter goes the previous day.
{
  const end = "2026-11-09T21:30:00.000Z"; // 10 Nov 00:30 MSK; grace ends 13 Nov 00:30 MSK
  assert.equal(businessAccessReminderLastSendDay(end), "2026-11-12");
  assert.equal(businessAccessReminderKind(end, new Date("2026-11-12T09:00:00.000Z")), "grace_last", "12 Nov 12:00 MSK");
  assert.equal(businessAccessReminderKind(end, new Date("2026-11-11T09:00:00.000Z")), "grace_start");
  assert.equal(businessAccessReminderKind(end, new Date("2026-11-10T09:00:00.000Z")), "grace_start");
  assert.equal(businessAccessReminderKind(end, new Date("2026-11-12T21:10:00.000Z")), null, "13 Nov 00:10 MSK, no window");
  assert.equal(businessAccessReminderKind(end, new Date("2026-11-09T09:00:00.000Z")), "before_end", "9 Nov in window");
  assert.equal(businessAccessReminderLastSendDay("2026-11-10T07:30:00.000Z"), "2026-11-12", "10:30 MSK end");
  assert.equal(businessAccessReminderLastSendDay("2026-11-10T08:00:00.000Z"), "2026-11-13", "11:00 MSK end");
}

// Grace ending in the afternoon: same day.
{
  const end = "2026-11-10T12:00:00.000Z"; // 15:00 MSK
  assert.equal(businessAccessReminderLastSendDay(end), "2026-11-13");
  assert.equal(businessAccessReminderKind(end, new Date("2026-11-13T09:00:00.000Z")), "grace_last");
  assert.equal(businessAccessReminderKind(end, new Date("2026-11-12T09:00:00.000Z")), "grace_start");
}

// Real days left in a (possibly late) grace_start letter, with Russian plurals.
assert.equal(businessAccessReminderGraceDaysLeft(END, new Date("2026-11-22T12:45:00.000Z")), 3, "on time");
assert.equal(businessAccessReminderGraceDaysLeft(END, new Date("2026-11-23T09:00:00.000Z")), 2, "a day late");
assert.equal(businessAccessReminderGraceDaysLeft(END, new Date("2026-11-24T09:00:00.000Z")), 1);
assert.equal(businessAccessReminderGraceDaysLeft(END, new Date("2026-11-25T11:00:00.000Z")), 1, "min 1 while open");
assert.equal(businessAccessReminderGraceDaysLeft(END, new Date("2026-11-26T00:00:00.000Z")), 0);
assert.equal(businessAccessReminderGraceDaysPhrase(1), "1 день");
assert.equal(businessAccessReminderGraceDaysPhrase(2), "2 дня");
assert.equal(businessAccessReminderGraceDaysPhrase(3), "3 дня");
assert.equal(businessAccessReminderGraceDaysPhrase(5), "5 дней");

// Exact business host only.
assert.equal(isBusinessEmailUrl("https://business.audiolad.ru/#dostup"), true);
assert.equal(isBusinessEmailUrl("https://business.audiolad.ru"), true);
assert.equal(isBusinessEmailUrl("https://business.audiolad.ru.evil.example/#dostup"), false);
assert.equal(isBusinessEmailUrl("https://business.audiolad.ruevil.example/"), false);
assert.equal(isBusinessEmailUrl("https://business.audiolad.ru@evil.example/"), false);
assert.equal(isBusinessEmailUrl("https://business.audiolad.ru:8443/"), false);
assert.equal(isBusinessEmailUrl("http://business.audiolad.ru/"), false);
assert.equal(isBusinessEmailUrl("https://audiolad.ru/"), false);
assert.equal(isBusinessEmailUrl("not a url"), false);
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
    assert.ok(isBusinessEmailUrl(url.replace(/&amp;/g, "&")), url);
  }
  assert.ok(html.includes(`href="${BUSINESS_ACCESS_REMINDER_CABINET_URL}"`) || html.includes("https://business.audiolad.ru/#dostup"));
  assert.ok(html.includes(BUSINESS_EMAIL_SENDER_NAME));
  assert.ok(html.includes(BUSINESS_EMAIL_COLORS.accent));
  assert.ok(html.includes(BUSINESS_EMAIL_COLORS.background));
  assert.ok(html.includes(BUSINESS_EMAIL_COLORS.text));
  assert.equal(html.includes("#6633cc"), false, "purple AudioLad button must not be used");
  assert.equal(html.includes("#5e2ca5"), false);
  assert.match(text, /Команда АудиоЛад Бизнес/);
  assert.ok(text.includes(BUSINESS_RENEWAL_QUESTION));
  assert.ok(text.includes(BUSINESS_RENEWAL_YES_URL));
  assert.ok(text.includes(BUSINESS_RENEWAL_NO_URL));
  assert.equal(/не понрав|жалко|отказ/i.test(text + html), false);
}

assert.match(
  businessAccessReminderParagraphs({ kind: "before_end", ...labels }).join("\n"),
  /действует до 22 ноября 2026 г\., 15:00 МСК/,
);
assert.match(
  businessAccessReminderParagraphs({ kind: "grace_start", ...labels }).join("\n"),
  /закончился 22 ноября 2026 г\., 15:00 МСК/,
);
for (const [days, phrase] of [[3, "ещё 3 дня"], [2, "ещё 2 дня"], [1, "ещё 1 день"]] as const) {
  const body = businessAccessReminderParagraphs({ kind: "grace_start", ...labels, graceDaysLeft: days }).join("\n");
  assert.ok(body.includes(`Музыка в зале играет ${phrase} – до 25 ноября 2026 г., 15:00 МСК`), body);
  assert.ok(
    renderBusinessAccessReminderEmailText({ kind: "grace_start", ...labels, graceDaysLeft: days }).includes(phrase),
  );
}
for (const kind of ["before_end", "grace_start", "grace_last"] as const) {
  assert.equal(/\d/.test(BUSINESS_ACCESS_REMINDER_SUBJECTS[kind]), false, "no day count in the subject");
  assert.equal(/сегодня/i.test(businessAccessReminderParagraphs({ kind, ...labels }).join("\n")), false);
}
assert.match(
  businessAccessReminderParagraphs({ kind: "grace_last", ...labels }).join("\n"),
  /играет до 25 ноября 2026 г\., 15:00 МСК/,
);

assert.match(MIGRATION, /FUNCTION public\.business_access_reminder_send_window_open/);
assert.match(MIGRATION, /FUNCTION public\.business_access_reminder_last_send_day/);
assert.match(MIGRATION, /IF NOT public\.business_access_reminder_send_window_open\(v_now\)/);
assert.match(MIGRATION, /time '10:00'/);
assert.match(MIGRATION, /time '20:00'/);
assert.match(MIGRATION, /time '11:00'/);
assert.equal(/DELETE FROM public\.business_access_renewal_notes/.test(MIGRATION), false, "notes are history");
assert.equal(/ON CONFLICT \(user_id, period_end\) DO UPDATE SET improvement_note/.test(MIGRATION), false);
assert.equal(BUSINESS_RENEWAL_RETRY_LABEL, "Попробовать ещё раз");
assert.equal(BUSINESS_RENEWAL_NOTE_ERROR.includes("—"), false);
{
  const prompt = readFileSync(join(ROOT, "src/components/business-app/BusinessRenewalPrompt.tsx"), "utf8");
  assert.match(prompt, /setNoteState\(ok \? "sent" : "error"\)/, "a failed note send shows the error, not thanks");
  assert.match(prompt, /BUSINESS_RENEWAL_RETRY_LABEL/);
  assert.match(prompt, /onNote=\{\(note\) => saveRenewalChoice\("no", note\)\}/);
}
{
  // Night run: no claim at all.
  let claimed = false;
  const result = await processBusinessAccessReminders({
    supabase: {
      rpc: async () => {
        claimed = true;
        return { data: [], error: null };
      },
    },
    send: async () => ({ ok: true }),
    now: new Date("2026-11-20T20:00:00.000Z"), // 23:00 MSK
  });
  assert.deepEqual(result, { claimed: 0, sent: 0, skipped: 0, failed: 0 });
  assert.equal(claimed, false, "worker must not claim outside 10:00–20:00 MSK");
}
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
assert.equal(MIGRATION.includes("apply_business_subscription_for_order"), false);
assert.match(MIGRATION, /answer = 'no'/);
assert.match(MIGRATION, /clear_business_renewal_decline_on_payment/);
assert.match(MIGRATION, /business_access_renewal_notes_admin_select/);

assert.equal(renewalAnswerBlocksReminders("no"), true);
assert.equal(renewalAnswerBlocksReminders("yes"), false);
assert.equal(renewalAnswerBlocksReminders(null), false);
assert.equal(
  renewalDeclineApplies({
    answer: "no",
    answeredPeriodEnd: "2026-11-22T12:00:00.000Z",
    contractualEnd: "2026-11-22T12:00:00.000Z",
  }),
  true,
);
assert.equal(
  renewalDeclineApplies({
    answer: "no",
    answeredPeriodEnd: "2026-11-22T12:00:00.000Z",
    contractualEnd: "2026-12-22T12:00:00.000Z",
  }),
  false,
  "a later paid end clears the decline",
);
assert.equal(parseRenewalChoiceHash("#prodlenie?otvet=da"), "yes");
assert.equal(parseRenewalChoiceHash("#prodlenie?otvet=net"), "no");
assert.equal(parseRenewalChoiceHash("#dostup"), null);

{
  const end = "2026-11-10T12:00:00.000Z";
  assert.equal(renewalQuestionVisible({ mode: "trial", endsAt: end }, new Date("2026-11-01T12:00:00.000Z")), false);
  assert.equal(renewalQuestionVisible({ mode: "trial", endsAt: end }, new Date("2026-11-06T20:30:00.000Z")), false);
  assert.equal(renewalQuestionVisible({ mode: "paid", endsAt: end }, new Date("2026-11-06T21:30:00.000Z")), true);
  assert.equal(renewalQuestionVisible({ mode: "paid", endsAt: end }, new Date("2026-11-10T11:00:00.000Z")), true);
  assert.equal(renewalQuestionVisible({ mode: "grace", endsAt: end }, new Date("2026-11-12T09:00:00.000Z")), true);
  assert.equal(renewalQuestionVisible({ mode: "offer", endsAt: end }, new Date("2026-11-20T09:00:00.000Z")), true);
  assert.equal(renewalQuestionVisible({ mode: "none", endsAt: end }, new Date("2026-11-08T09:00:00.000Z")), false);
}
assert.match(MIGRATION, /g\.email_hash = NEW\.email_hash/);
for (const subject of Object.values(BUSINESS_ACCESS_REMINDER_SUBJECTS)) {
  assert.doesNotMatch(subject, /—|-/);
}
assert.equal(BUSINESS_RENEWAL_IMPROVEMENT_QUESTION.includes("не понрав"), false);
assert.equal(BUSINESS_RENEWAL_QUESTION, "Планируете дальше пользоваться сервисом?");

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
    now: NOON_MSK,
    send: async () => {
      sendCount += 1;
      return { ok: true };
    },
  });
  assert.deepEqual(first, { claimed: 1, sent: 1, skipped: 0, failed: 0 });
  const second = await processBusinessAccessReminders({
    supabase: client,
    now: NOON_MSK,
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
    now: NOON_MSK,
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
    now: NOON_MSK,
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
    now: NOON_MSK,
    send: async () => ({ ok: false, code: "smtp_not_configured" }),
  });
  assert.deepEqual(result, { claimed: 1, sent: 0, skipped: 0, failed: 1 });
  assert.equal(fails[0]?.p_permanent, false, "missing SMTP retries later and does not send now");
}

console.log("business-access-reminder-unit: ok");
