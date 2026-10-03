import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { getVisibleAdminNavItems } from "../src/lib/admin/nav";
import { deriveCampaignRollup } from "../src/lib/admin/mailings/campaign-status";
import { launchAuthorCampaign } from "../src/lib/admin/mailings/launch";
import {
  planAuthorRecipients,
  type AuthorMailingCandidate,
} from "../src/lib/admin/mailings/recipients";
import {
  buildAuthorMailingTestMessage,
  parseMailingTestAllowlist,
  resolveTestSendRecipient,
  sendAuthorMailingTest,
  TEST_SUBJECT_PREFIX,
} from "../src/lib/admin/mailings/test-send";
import { validateCampaignDraft } from "../src/lib/admin/mailings/validation";
import {
  campaignOutboxDedupKey,
  createMemoryApplicationEmailRuntime,
  type EmailCampaignRecord,
} from "../src/lib/email/application-email-runtime";
import { confirmAuthorMarketingUnsubscribe } from "../src/lib/email/confirm-unsubscribe";
import { evaluateAuthorDelivery } from "../src/lib/email/delivery-gate";
import { enqueueApplicationEmail } from "../src/lib/email/enqueue";
import { redactMailingLogFields } from "../src/lib/email/mask-email";
import { processApplicationEmailOutbox } from "../src/lib/email/process-application-email-outbox";
import { getSenderIdentity } from "../src/lib/email/sender-identities";
import { isSupportMailboxConfigured } from "../src/lib/email/smtp-config";
import {
  applyFirstNamePlaceholder,
  parseAbsoluteHttpUrl,
  renderManualCampaignEmail,
  sanitizeEmailSubject,
} from "../src/lib/email/templates/manual-campaign";
import { brandEmailTemplateRenderer } from "../src/lib/email/templates/renderer";
import {
  planAuthorMarketingUnsubscribe,
  signUnsubscribeToken,
  verifyUnsubscribeToken,
} from "../src/lib/email/unsubscribe-token";
import {
  rolesGrantPermission,
  resolvePermissionsForRoles,
} from "../src/lib/auth/platform-permissions";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const now = new Date("2026-12-19T12:00:00.000Z");
const secret = "unit-test-unsubscribe-secret";

function read(rel: string) {
  return readFileSync(path.join(root, rel), "utf8");
}

function candidate(partial: Partial<AuthorMailingCandidate> & Pick<AuthorMailingCandidate, "authorId" | "email">): AuthorMailingCandidate {
  return {
    userId: partial.userId ?? "00000000-0000-4000-8000-0000000000aa",
    contactId: partial.contactId ?? null,
    displayName: partial.displayName ?? "Студия",
    fullName: partial.fullName ?? "Анна Иванова",
    isFixture: partial.isFixture ?? false,
    hasPublishedProduct: partial.hasPublishedProduct ?? false,
    isCommercial: partial.isCommercial ?? false,
    ...partial,
  };
}

function draftRecord(id = "10000000-0000-4000-8000-000000000001"): EmailCampaignRecord {
  return {
    id,
    name: "Тест",
    audienceType: "authors",
    messageType: "author_operational",
    senderIdentity: "authors",
    subject: "Новость для авторов",
    preheader: "Коротко",
    content: {
      heading: "Здравствуйте, {{first_name}}!",
      paragraphs: ["Текст рассылки <b>без html</b>."],
      cta: { label: "Открыть", url: "https://audiolad.ru/author-dashboard" },
      infoBlock: null,
      secondaryLink: null,
    },
    filter: { version: 1, kind: "all_authors" },
    status: "draft",
    createdBy: "00000000-0000-4000-8000-000000000010",
    launchedBy: null,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    queuedAt: null,
    startedAt: null,
    finishedAt: null,
    recipientTotal: 0,
    recipientQueued: 0,
    recipientSent: 0,
    recipientFailed: 0,
    recipientSuppressed: 0,
    recipientExcluded: 0,
  };
}

const migration = read("supabase/migrations/20261219120000_admin_author_mailings.sql");
assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.email_campaigns/);
assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.email_campaign_recipients/);
assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
assert.match(migration, /REVOKE ALL ON TABLE public\.email_campaigns FROM anon, authenticated/);
assert.match(migration, /GRANT ALL ON TABLE public\.email_campaigns TO service_role/);
assert.match(migration, /mailings\.view/);
assert.match(migration, /mailings\.manage/);
assert.match(migration, /mailings\.send/);
assert.doesNotMatch(migration, /\('admin', 'mailings\.view'\)/);
assert.match(migration, /claim_application_email_outbox/);
assert.match(migration, /author_sale_email_outbox/);
assert.match(migration, /FOR UPDATE SKIP LOCKED/);
assert.equal(rolesGrantPermission(["admin"], "mailings.view"), false);
assert.equal(rolesGrantPermission(["admin"], "mailings.send"), false);
assert.equal(rolesGrantPermission(["owner"], "mailings.manage"), true);
assert.equal(rolesGrantPermission(["editor"], "mailings.view"), false);
const ownerNav = getVisibleAdminNavItems({
  userId: "00000000-0000-4000-8000-000000000001",
  roles: ["owner"],
  permissions: resolvePermissionsForRoles(["owner"]),
  usedLegacyFallback: false,
});
assert.equal(ownerNav.some((item) => item.href === "/admin/mailings" && item.label === "Рассылки"), true);
const adminNav = getVisibleAdminNavItems({
  userId: "00000000-0000-4000-8000-000000000002",
  roles: ["admin"],
  permissions: resolvePermissionsForRoles(["admin"]),
  usedLegacyFallback: false,
});
assert.equal(adminNav.some((item) => item.href === "/admin/mailings"), false);

const subject = validateCampaignDraft({
  audienceType: "authors",
  messageType: "author_operational",
  senderIdentity: "authors",
  subject: "Тема\r\nBcc: bad@example.com",
  content: {
    heading: "Заголовок",
    paragraphs: ["Абзац"],
    cta: null,
    infoBlock: null,
    secondaryLink: null,
  },
  filter: { version: 1, kind: "all_authors" },
});
assert.equal(subject.ok, false);
assert.equal(sanitizeEmailSubject("Hello\nBcc: x"), null);
const previewWithBlankSecondary = renderManualCampaignEmail({
  subject: "Служебное",
  content: {
    heading: "Заголовок",
    paragraphs: ["Текст"],
    cta: { label: "Открыть АудиоЛад", url: "https://audiolad.ru" },
    infoBlock: null,
    secondaryLink: { label: "", url: "" },
  },
  siteOrigin: "https://audiolad.ru",
});
assert.equal(previewWithBlankSecondary.ok, true);
if (previewWithBlankSecondary.ok) {
  assert.match(previewWithBlankSecondary.html, /Открыть АудиоЛад/);
  assert.match(previewWithBlankSecondary.html, /https:\/\/audiolad\.ru\/?/);
}
const previewWithEmptyCta = renderManualCampaignEmail({
  subject: "Служебное",
  content: {
    heading: "Заголовок",
    paragraphs: ["Текст"],
    cta: { label: "", url: "" },
    infoBlock: null,
    secondaryLink: { label: " ", url: " " },
  },
  siteOrigin: "https://audiolad.ru",
});
assert.equal(previewWithEmptyCta.ok, true);
const rejectedCta = renderManualCampaignEmail({
  subject: "Служебное",
  content: {
    heading: "Заголовок",
    paragraphs: ["Текст"],
    cta: { label: "Открыть", url: "javascript:alert(1)" },
    infoBlock: null,
    secondaryLink: null,
  },
  siteOrigin: "https://audiolad.ru",
});
assert.equal(rejectedCta.ok, false);
if (!rejectedCta.ok) {
  assert.equal(rejectedCta.code, "url_invalid");
}
const blankLinksDraft = validateCampaignDraft({
  audienceType: "authors",
  messageType: "author_operational",
  senderIdentity: "authors",
  subject: "Тема",
  content: {
    heading: "Заголовок",
    paragraphs: ["Абзац"],
    cta: { label: "", url: "" },
    infoBlock: null,
    secondaryLink: { label: "", url: "" },
  },
  filter: { version: 1, kind: "all_authors" },
});
assert.equal(blankLinksDraft.ok, true);
if (blankLinksDraft.ok) {
  assert.equal(blankLinksDraft.value.content.cta, null);
  assert.equal(blankLinksDraft.value.content.secondaryLink, null);
}
assert.equal(parseAbsoluteHttpUrl("javascript:alert(1)"), null);
assert.equal(parseAbsoluteHttpUrl("/relative"), null);
assert.equal(parseAbsoluteHttpUrl("https://audiolad.ru/author-dashboard")?.startsWith("https://"), true);
assert.equal(validateCampaignDraft({
  audienceType: "listeners",
  messageType: "author_operational",
  senderIdentity: "authors",
  subject: "Тема",
  content: { heading: "Заголовок", paragraphs: ["Абзац"], cta: null, infoBlock: null, secondaryLink: null },
  filter: { version: 1, kind: "all_authors" },
}).ok, false);

const rendered = renderManualCampaignEmail({
  subject: "Тема",
  content: {
    heading: "<img src=x onerror=alert(1)>",
    paragraphs: ["Здравствуйте, {{first_name}}!", "Hello <b>name</b>"],
    cta: { label: "Кнопка", url: "https://audiolad.ru/go" },
    infoBlock: null,
    secondaryLink: null,
  },
  firstName: null,
  siteOrigin: "https://audiolad.ru",
});
assert.equal(rendered.ok, true);
if (rendered.ok) {
  assert.equal(rendered.html.includes("<img src=x"), false);
  assert.equal(rendered.html.includes("<b>name</b>"), false);
  assert.match(rendered.html, /&lt;img/);
  assert.match(rendered.html, /&lt;b&gt;name&lt;\/b&gt;/);
  assert.match(rendered.text, /Здравствуйте!/);
  assert.doesNotMatch(rendered.text, /Здравствуйте,/);
  assert.ok(rendered.text.length > 20);
}
assert.equal(applyFirstNamePlaceholder("Здравствуйте, {{first_name}}!", "Анна"), "Здравствуйте, Анна!");
const viaRenderer = await brandEmailTemplateRenderer.render({
  templateKey: "manual_campaign",
  templateVersion: "manual-campaign-v1-20261219",
  payload: {
    subject: "Тема",
    heading: "Здравствуйте!",
    paragraphs: ["Текст"],
    senderIdentity: "authors",
  },
});
assert.equal(viaRenderer.ok, true);

const authors = getSenderIdentity("authors");
assert.equal(authors.from, "authors@audiolad.ru");
assert.equal(authors.replyTo, "authors@audiolad.ru");
assert.equal(authors.displayName, "АудиоЛад для авторов");
assert.equal(getSenderIdentity("listeners").from, "inbox@audiolad.ru");
assert.notEqual(getSenderIdentity("listeners").replyTo, getSenderIdentity("auth_security").replyTo);
assert.equal(getSenderIdentity("support").from, "1@audiolad.ru");
assert.equal(getSenderIdentity("auth_security").from, "inbox@audiolad.ru");
assert.equal(getSenderIdentity("auth_security").replyTo, "support@audiolad.ru");
const previousSupportUser = process.env.AUDIOLAD_SMTP_SUPPORT_USER;
const previousSupportPass = process.env.AUDIOLAD_SMTP_SUPPORT_PASS;
delete process.env.AUDIOLAD_SMTP_SUPPORT_USER;
delete process.env.AUDIOLAD_SMTP_SUPPORT_PASS;
assert.equal(isSupportMailboxConfigured(), false);
if (previousSupportUser) process.env.AUDIOLAD_SMTP_SUPPORT_USER = previousSupportUser;
if (previousSupportPass) process.env.AUDIOLAD_SMTP_SUPPORT_PASS = previousSupportPass;

const operationalBlock = evaluateAuthorDelivery({
  messageType: "author_operational",
  scopes: new Set(["author_marketing"]),
  preference: null,
  latestAuthorMarketingConsent: null,
});
assert.equal(operationalBlock.ok, true);
const operationalAll = evaluateAuthorDelivery({
  messageType: "author_operational",
  scopes: new Set(["all"]),
  preference: { author_operational: true, author_marketing: false },
  latestAuthorMarketingConsent: null,
});
assert.equal(operationalAll.ok, false);
const marketing = evaluateAuthorDelivery({
  messageType: "author_marketing",
  scopes: new Set(),
  preference: { author_operational: true, author_marketing: true },
  latestAuthorMarketingConsent: "granted",
});
assert.equal(marketing.ok, true);
const marketingNoConsent = evaluateAuthorDelivery({
  messageType: "author_marketing",
  scopes: new Set(),
  preference: { author_operational: true, author_marketing: true },
  latestAuthorMarketingConsent: null,
});
assert.equal(marketingNoConsent.ok, false);

const one = candidate({
  authorId: "20000000-0000-4000-8000-000000000001",
  email: "anna@example.com",
  fullName: "Анна",
});
const duplicate = candidate({
  authorId: "20000000-0000-4000-8000-000000000002",
  email: "anna@example.com",
  userId: "00000000-0000-4000-8000-0000000000bb",
});
const fixture = candidate({
  authorId: "20000000-0000-4000-8000-000000000003",
  email: "audiolad@mail.ru",
  isFixture: true,
});
const published = candidate({
  authorId: "20000000-0000-4000-8000-000000000004",
  email: "pub@example.com",
  hasPublishedProduct: true,
  isCommercial: true,
});
const plain = candidate({
  authorId: "20000000-0000-4000-8000-000000000005",
  email: "plain@example.com",
});
const plan = planAuthorRecipients({
  candidates: [one, duplicate, fixture, published, plain],
  filter: { version: 1, kind: "all_authors" },
  messageType: "author_operational",
  now,
});
assert.equal(plan.ok, true);
if (plan.ok) {
  assert.equal(plan.summary.ready, 3);
  assert.equal(plan.summary.invalidOrNoEmail, 0);
  assert.equal(plan.rows.filter((row) => row.suppressionReason === "duplicate").length, 1);
  assert.equal(plan.rows.filter((row) => row.suppressionReason === "fixture").length, 1);
}
const publishedPlan = planAuthorRecipients({
  candidates: [published, plain],
  filter: { version: 1, kind: "published_products" },
  messageType: "author_operational",
  now,
});
assert.equal(publishedPlan.ok && publishedPlan.summary.ready, 1);
const commercialPlan = planAuthorRecipients({
  candidates: [published, plain],
  filter: { version: 1, kind: "commercial_authors" },
  messageType: "author_operational",
  now,
});
assert.equal(commercialPlan.ok && commercialPlan.summary.ready, 1);
const suppressedPlan = planAuthorRecipients({
  candidates: [one],
  filter: { version: 1, kind: "all_authors" },
  messageType: "author_marketing",
  now,
  gatesByEmail: new Map([
    ["anna@example.com", {
      suppressions: [{ normalizedEmail: "anna@example.com", scope: "author_marketing" as const }],
      preference: { author_operational: true, author_marketing: true },
      latestAuthorMarketingConsent: "granted" as const,
    }],
  ]),
});
assert.equal(suppressedPlan.ok && suppressedPlan.summary.suppressed, 1);
assert.equal(suppressedPlan.ok && suppressedPlan.summary.ready, 0);

const runtime = createMemoryApplicationEmailRuntime();
const queued = await enqueueApplicationEmail({
  messageType: "author_operational",
  toEmail: "anna@example.com",
  templateKey: "manual_campaign",
  templateVersion: "manual-campaign-v1-20261219",
  deduplicationKey: "manual:test:1",
  payload: { subject: "Тема", heading: "Заголовок", paragraphs: ["Текст"], unsubscribeUrl: "https://audiolad.ru/email/unsubscribe?token=should-strip" },
  gate: { suppressions: [{ normalizedEmail: "anna@example.com", scope: "marketing" }], preference: null, latestAuthorMarketingConsent: null },
}, runtime, now);
assert.equal(queued.ok, true);
const again = await enqueueApplicationEmail({
  messageType: "author_operational",
  toEmail: "anna@example.com",
  templateKey: "manual_campaign",
  templateVersion: "manual-campaign-v1-20261219",
  deduplicationKey: "manual:test:1",
  payload: { subject: "Тема", heading: "Заголовок", paragraphs: ["Текст"] },
}, runtime, now);
assert.equal(again.ok, true);
if (queued.ok && again.ok) {
  assert.equal(queued.outboxId, again.outboxId);
  assert.equal(again.deduped, true);
}
const stored = await runtime.findOutboxByDedup("manual:test:1");
assert.equal(stored?.payload.unsubscribeUrl, undefined);
const blocked = await enqueueApplicationEmail({
  messageType: "author_operational",
  toEmail: "blocked@example.com",
  templateKey: "manual_campaign",
  templateVersion: "v",
  deduplicationKey: "manual:blocked",
  payload: { subject: "Тема", heading: "Заголовок", paragraphs: ["Текст"] },
  gate: { suppressions: [{ normalizedEmail: "blocked@example.com", scope: "all" }], preference: null, latestAuthorMarketingConsent: null },
}, runtime, now);
assert.equal(blocked.ok, false);
assert.equal(await runtime.findOutboxByDedup("manual:blocked"), null);
const noConsent = await enqueueApplicationEmail({
  messageType: "author_marketing",
  toEmail: "market@example.com",
  templateKey: "manual_campaign",
  templateVersion: "v",
  deduplicationKey: "manual:market",
  payload: { subject: "Тема", heading: "Заголовок", paragraphs: ["Текст"], unsubscribeUrl: "https://audiolad.ru/email/unsubscribe?token=abc" },
  gate: { suppressions: [], preference: { author_operational: true, author_marketing: false }, latestAuthorMarketingConsent: null },
}, runtime, now);
assert.equal(noConsent.ok, false);

const workerRuntime = createMemoryApplicationEmailRuntime();
await workerRuntime.insertOutbox({
  messageType: "author_operational",
  contactId: null,
  userId: null,
  toEmail: "one@example.com",
  templateKey: "manual_campaign",
  templateVersion: "manual-campaign-v1-20261219",
  payload: { subject: "Тема", heading: "Заголовок", paragraphs: ["Текст"], senderIdentity: "authors" },
  status: "pending",
  priority: 100,
  attemptCount: 0,
  maxAttempts: 5,
  scheduledAt: now.toISOString(),
  lockedAt: null,
  sentAt: null,
  failedAt: null,
  providerMessageId: null,
  lastErrorCode: null,
  lastErrorMessage: null,
  deduplicationKey: "worker:one",
  leaseToken: null,
  leaseExpiresAt: null,
  campaignId: null,
  campaignRecipientId: null,
});
let sends = 0;
const firstPass = await processApplicationEmailOutbox({
  runtime: workerRuntime,
  now,
  authorsSmtpReady: true,
  deliver: async (message) => {
    sends += 1;
    assert.equal(message.replyTo, "authors@audiolad.ru");
    assert.match(message.from, /authors@audiolad\.ru/);
    assert.equal(message.to, "one@example.com");
    assert.equal("bcc" in message, false);
    return { ok: true, providerMessageId: "provider-1" };
  },
});
assert.equal(firstPass.sent, 1);
const secondPass = await processApplicationEmailOutbox({
  runtime: workerRuntime,
  now,
  authorsSmtpReady: true,
  deliver: async () => {
    sends += 1;
    return { ok: true };
  },
});
assert.equal(secondPass.claimed, 0);
assert.equal(sends, 1);
const sentEvents = (await workerRuntime.listEvents()).filter((event) => event.eventType === "sent");
assert.equal(sentEvents.length, 1);
assert.equal(sentEvents[0]?.providerMessageId, "provider-1");

const retryRuntime = createMemoryApplicationEmailRuntime();
await retryRuntime.insertOutbox({
  messageType: "author_operational",
  contactId: null,
  userId: null,
  toEmail: "retry@example.com",
  templateKey: "manual_campaign",
  templateVersion: "manual-campaign-v1-20261219",
  payload: { subject: "Тема", heading: "Заголовок", paragraphs: ["Текст"], senderIdentity: "authors" },
  status: "pending",
  priority: 100,
  attemptCount: 0,
  maxAttempts: 2,
  scheduledAt: now.toISOString(),
  lockedAt: null,
  sentAt: null,
  failedAt: null,
  providerMessageId: null,
  lastErrorCode: null,
  lastErrorMessage: null,
  deduplicationKey: "worker:retry",
  leaseToken: null,
  leaseExpiresAt: null,
  campaignId: null,
  campaignRecipientId: null,
});
const fail = async () => ({ ok: false as const, code: "smtp_send_failed", message: "down", retryable: true });
await processApplicationEmailOutbox({ runtime: retryRuntime, now, authorsSmtpReady: true, deliver: fail });
const tooSoon = await processApplicationEmailOutbox({ runtime: retryRuntime, now, authorsSmtpReady: true, deliver: fail });
assert.equal(tooSoon.claimed, 0);
const later = new Date(now.getTime() + 5 * 60 * 1000);
await processApplicationEmailOutbox({ runtime: retryRuntime, now: later, authorsSmtpReady: true, deliver: fail });
const exhausted = await retryRuntime.findOutboxByDedup("worker:retry");
assert.equal(exhausted?.status, "failed");

const supportRuntime = createMemoryApplicationEmailRuntime();
await supportRuntime.insertOutbox({
  messageType: "author_operational",
  contactId: null,
  userId: null,
  toEmail: "support-path@example.com",
  templateKey: "manual_campaign",
  templateVersion: "manual-campaign-v1-20261219",
  payload: { subject: "Тема", heading: "Заголовок", paragraphs: ["Текст"], senderIdentity: "support" },
  status: "pending",
  priority: 100,
  attemptCount: 0,
  maxAttempts: 3,
  scheduledAt: now.toISOString(),
  lockedAt: null,
  sentAt: null,
  failedAt: null,
  providerMessageId: null,
  lastErrorCode: null,
  lastErrorMessage: null,
  deduplicationKey: "worker:support",
  leaseToken: null,
  leaseExpiresAt: null,
  campaignId: null,
  campaignRecipientId: null,
});
let supportSends = 0;
await processApplicationEmailOutbox({
  runtime: supportRuntime,
  now,
  authorsSmtpReady: true,
  deliver: async () => {
    supportSends += 1;
    return { ok: true };
  },
});
assert.equal(supportSends, 0);
assert.equal((await supportRuntime.findOutboxByDedup("worker:support"))?.status, "failed");

const campaignRuntime = createMemoryApplicationEmailRuntime();
const campaign = await campaignRuntime.insertCampaign(draftRecord());
const launched = await launchAuthorCampaign({
  campaign,
  candidates: [
    candidate({ authorId: "30000000-0000-4000-8000-000000000001", email: "ok@example.com", fullName: "Ольга" }),
    candidate({ authorId: "30000000-0000-4000-8000-000000000002", email: "bad@example.com", fullName: "Борис" }),
  ],
  actorId: "00000000-0000-4000-8000-000000000010",
  now,
  siteOrigin: "https://audiolad.ru",
  unsubscribeSecret: secret,
  runtime: campaignRuntime,
});
assert.equal(launched.ok, true);
const relaunch = await launchAuthorCampaign({
  campaign: { ...campaign, status: "queued" },
  candidates: [
    candidate({ authorId: "30000000-0000-4000-8000-000000000001", email: "ok@example.com" }),
    candidate({ authorId: "30000000-0000-4000-8000-000000000003", email: "extra@example.com" }),
  ],
  actorId: "00000000-0000-4000-8000-000000000010",
  now,
  siteOrigin: "https://audiolad.ru",
  unsubscribeSecret: secret,
  runtime: campaignRuntime,
});
assert.equal(relaunch.ok, true);
if (relaunch.ok) assert.equal(relaunch.alreadyLaunched, true);
const outboxBefore = await campaignRuntime.findOutboxByDedup(campaignOutboxDedupKey(campaign.id, "extra@example.com"));
assert.equal(outboxBefore, null);
await processApplicationEmailOutbox({
  runtime: campaignRuntime,
  now,
  authorsSmtpReady: true,
  deliver: async (message) => {
    if (message.to === "bad@example.com") {
      return { ok: false, code: "smtp_send_failed", message: "rejected", retryable: false };
    }
    return { ok: true, providerMessageId: `id-${message.to}` };
  },
});
const after = await campaignRuntime.getCampaign(campaign.id);
assert.equal(after?.status, "partially_failed");
assert.equal(after?.recipientSent, 1);
assert.equal(after?.recipientFailed, 1);
assert.equal(deriveCampaignRollup(["sent", "failed"]).phase, "partially_failed");
const recipients = await campaignRuntime.listRecipients(campaign.id);
assert.equal(recipients.length, 2);

const token = signUnsubscribeToken({
  normalizedEmail: "anna@example.com",
  secret,
  expiresAt: new Date(now.getTime() + 86_400_000),
});
assert.ok(token);
const verified = verifyUnsubscribeToken({ token: token ?? "", secret, now });
assert.equal(verified.ok && verified.normalizedEmail, "anna@example.com");
const firstPlan = planAuthorMarketingUnsubscribe({ normalizedEmail: "anna@example.com", existing: [], now });
assert.equal(firstPlan.already, false);
const secondPlan = planAuthorMarketingUnsubscribe({
  normalizedEmail: "anna@example.com",
  existing: [firstPlan],
  now,
});
assert.equal(secondPlan.already, true);
let inserts = 0;
const confirmStore = {
  async listSuppressions() {
    return inserts > 0 ? [firstPlan] : [];
  },
  async insertSuppression() {
    inserts += 1;
  },
  async revokeAuthorMarketing() {},
};
const firstConfirm = await confirmAuthorMarketingUnsubscribe({ token: token ?? "", secret, now, store: confirmStore });
const secondConfirm = await confirmAuthorMarketingUnsubscribe({ token: token ?? "", secret, now, store: confirmStore });
assert.equal(firstConfirm.ok && firstConfirm.already, false);
assert.equal(secondConfirm.ok && secondConfirm.already, true);
assert.equal(inserts, 1);
const invalidConfirm = await confirmAuthorMarketingUnsubscribe({ token: "bad.token", secret, now, store: confirmStore });
assert.equal(invalidConfirm.ok, false);
assert.equal(inserts, 1);

assert.equal(resolveTestSendRecipient({ actorEmail: "Owner@Personal.ru", requestedEmail: "owner@personal.ru" }).ok, true);
assert.equal(resolveTestSendRecipient({ actorEmail: "owner@personal.ru", requestedEmail: "other@personal.ru" }).ok, false);
assert.deepEqual(parseMailingTestAllowlist("ops@audiolad.ru, evil@gmail.com"), ["ops@audiolad.ru"]);
assert.equal(resolveTestSendRecipient({
  actorEmail: "owner@personal.ru",
  requestedEmail: "ops@audiolad.ru",
  allowlist: ["ops@audiolad.ru"],
}).ok, true);
assert.equal(resolveTestSendRecipient({
  actorEmail: "owner@personal.ru",
  requestedEmail: "evil@gmail.com",
  allowlist: parseMailingTestAllowlist("evil@gmail.com"),
}).ok, false);
const testMessage = buildAuthorMailingTestMessage({
  toEmail: "owner@personal.ru",
  subject: "Проверка",
  content: draftRecord().content,
  siteOrigin: "https://audiolad.ru",
});
assert.equal(testMessage.ok, true);
if (testMessage.ok) {
  assert.equal(testMessage.message.senderFrom, "authors@audiolad.ru");
  assert.equal(testMessage.message.replyTo, "authors@audiolad.ru");
  assert.equal(testMessage.message.subject.startsWith(TEST_SUBJECT_PREFIX), true);
  const same = renderManualCampaignEmail({
    subject: "Проверка",
    content: draftRecord().content,
    siteOrigin: "https://audiolad.ru",
  });
  assert.equal(same.ok && same.html, testMessage.message.html);
}
const testRuntime = createMemoryApplicationEmailRuntime();
const sentTest = await sendAuthorMailingTest({
  actorEmail: "owner@personal.ru",
  requestedEmail: "owner@personal.ru",
  subject: "Проверка",
  content: draftRecord().content,
  siteOrigin: "https://audiolad.ru",
  deliver: async () => ({ ok: true, providerMessageId: "test-id" }),
});
assert.equal(sentTest.ok, true);
assert.equal((await testRuntime.listCampaigns()).length, 0);

const redacted = redactMailingLogFields({
  token: "raw-unsubscribe-token",
  password: "smtp-secret",
  email: "anna@example.com",
  campaignId: "abc",
});
assert.equal("token" in redacted, false);
assert.equal("password" in redacted, false);
assert.equal(redacted.email, "a***@example.com");
assert.doesNotMatch(JSON.stringify(redacted), /raw-unsubscribe-token/);
assert.doesNotMatch(read("src/lib/email/confirm-unsubscribe.ts"), /console\./);
assert.doesNotMatch(read("src/lib/email/run-installed-author-email-outbox-cycle.ts"), /manual_campaign|email_campaigns/);
assert.match(read("src/app/(platform)/admin/mailings/actions.ts"), /requireAdminPermission\("mailings.send"\)/);
assert.match(read("src/app/(platform)/admin/mailings/actions.ts"), /requireAdminPermission\("mailings.manage"\)/);

console.log("admin-mailings-unit: ok");
