#!/usr/bin/env -S npx tsx
// «Отправить на доработку»: unit tests for revision helpers, email template,
// dedup key and the revision_fields migration/rollback (static checks).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  AUTHOR_APPLICATION_REVISION_COMMENT_REQUIRED_MESSAGE,
  AUTHOR_APPLICATION_REVISION_EDIT_PATH,
  AUTHOR_APPLICATION_REVISION_FIELDS,
  canSendAuthorApplicationToRevision,
  getAuthorApplicationRevisionFieldLabels,
  getAuthorApplicationStatusEventLabel,
  isAuthorApplicationResubmissionEvent,
  isAuthorApplicationRevisionField,
  normalizeAuthorApplicationRevisionFields,
} from "../src/lib/author-applications/revision";
import {
  AUTHOR_APPLICATION_NEEDS_CHANGES_MESSAGE_TYPE,
  buildAuthorApplicationNeedsChangesDedupKey,
} from "../src/lib/email/operational-deliveries";
import {
  AUTHOR_APPLICATION_NEEDS_CHANGES_EDIT_PATH,
  AUTHOR_APPLICATION_NEEDS_CHANGES_EMAIL_SUBJECT,
  AUTHOR_APPLICATION_NEEDS_CHANGES_EMAIL_TEMPLATE_KEY,
  AUTHOR_APPLICATION_NEEDS_CHANGES_EMAIL_TEMPLATE_VERSION,
  getAuthorApplicationNeedsChangesEditUrl,
  renderAuthorApplicationNeedsChangesEmailHtml,
  renderAuthorApplicationNeedsChangesEmailText,
} from "../src/lib/email/templates/author-application-needs-changes";
import {
  brandEmailTemplateRenderer,
  getBrandEmailTemplateVersion,
} from "../src/lib/email/templates/renderer";
import { getProfileApplicationCopy } from "../src/lib/profile/application-copy";
import { maxProfileExternalUrl } from "../src/lib/max/profile";

const EM_DASH = "\u2014";
const ORIGIN = "https://audiolad.example";

function testRevisionFields() {
  assert.deepEqual(
    AUTHOR_APPLICATION_REVISION_FIELDS.map((field) => field.key),
    [
      "display_name",
      "direction",
      "about",
      "contact_email",
      "contact_details",
      "readiness",
      "school",
    ],
  );
  assert.equal(isAuthorApplicationRevisionField("about"), true);
  assert.equal(isAuthorApplicationRevisionField("links"), false);
  assert.equal(isAuthorApplicationRevisionField(null), false);
  assert.deepEqual(
    normalizeAuthorApplicationRevisionFields(["readiness", "about", "x", "about", 5]),
    ["about", "readiness"],
  );
  assert.deepEqual(normalizeAuthorApplicationRevisionFields(null), []);
  assert.deepEqual(getAuthorApplicationRevisionFieldLabels(["contact_details", "display_name"]), [
    "Название проекта («Как вы хотите представляться?»)",
    "Телефон, MAX или другой способ связи",
  ]);
  for (const field of AUTHOR_APPLICATION_REVISION_FIELDS) {
    assert.ok(!field.label.includes(EM_DASH), field.key);
  }
  assert.ok(AUTHOR_APPLICATION_REVISION_COMMENT_REQUIRED_MESSAGE.length > 0);
}

function testStatusRules() {
  assert.equal(canSendAuthorApplicationToRevision("submitted"), true);
  assert.equal(canSendAuthorApplicationToRevision("in_review"), true);
  for (const status of ["draft", "needs_changes", "approved", "rejected", "withdrawn"]) {
    assert.equal(canSendAuthorApplicationToRevision(status as never), false, status);
  }
}

function testHistoryLabels() {
  const event = (from: string | null, to: string) =>
    ({ from_status: from, to_status: to }) as never;
  assert.equal(isAuthorApplicationResubmissionEvent(event("needs_changes", "submitted")), true);
  assert.equal(isAuthorApplicationResubmissionEvent(event("draft", "submitted")), false);
  assert.equal(
    getAuthorApplicationStatusEventLabel(event("in_review", "needs_changes")),
    "Отправлено на доработку",
  );
  assert.equal(
    getAuthorApplicationStatusEventLabel(event("needs_changes", "submitted")),
    "Повторно отправлена после доработки",
  );
  assert.equal(getAuthorApplicationStatusEventLabel(event("submitted", "in_review")), "Взята в работу");
}

function testEditLink() {
  assert.equal(AUTHOR_APPLICATION_REVISION_EDIT_PATH, AUTHOR_APPLICATION_NEEDS_CHANGES_EDIT_PATH);
  assert.ok(AUTHOR_APPLICATION_REVISION_EDIT_PATH.startsWith("/become-author"));
  assert.equal(
    getAuthorApplicationNeedsChangesEditUrl(`${ORIGIN}/`),
    `${ORIGIN}/become-author?revision=1#author-application-revision`,
  );
  const copy = getProfileApplicationCopy("needs_changes");
  assert.equal(copy.ctaHref, AUTHOR_APPLICATION_REVISION_EDIT_PATH);
  assert.ok(!copy.description.includes(EM_DASH));
  assert.ok(maxProfileExternalUrl(AUTHOR_APPLICATION_REVISION_EDIT_PATH)?.endsWith(AUTHOR_APPLICATION_REVISION_EDIT_PATH));
  assert.ok(maxProfileExternalUrl("/become-author"));
  assert.equal(maxProfileExternalUrl("/admin"), null);
  assert.equal(maxProfileExternalUrl("/become-authorx"), null);
}

function testDedupKey() {
  assert.equal(AUTHOR_APPLICATION_NEEDS_CHANGES_MESSAGE_TYPE, "author_application_needs_changes");
  assert.equal(
    buildAuthorApplicationNeedsChangesDedupKey(" app-1 ", " 2026-11-04T11:00:00Z "),
    "author-application:app-1:needs_changes:2026-11-04T11:00:00Z",
  );
  assert.notEqual(
    buildAuthorApplicationNeedsChangesDedupKey("app-1", "a"),
    buildAuthorApplicationNeedsChangesDedupKey("app-1", "b"),
  );
}

async function testTemplate() {
  const input = {
    applicantName: "Анна <b>",
    reviewComment: "Строка 1 <script>alert(1)</script>\nСтрока 2",
    fieldLabels: ["Рассказ о себе", " "],
    siteOrigin: ORIGIN,
  };
  const html = renderAuthorApplicationNeedsChangesEmailHtml(input);
  const text = renderAuthorApplicationNeedsChangesEmailText(input);
  const editUrl = `${ORIGIN}/become-author?revision=1#author-application-revision`;

  assert.ok(html.includes(editUrl), "html has direct edit link");
  assert.ok(text.includes(editUrl), "text has direct edit link");
  assert.ok(!html.includes("<script>"), "comment escaped");
  assert.ok(html.includes("&lt;script&gt;"));
  assert.ok(html.includes("Строка 1"), "comment present");
  assert.ok(html.includes("<br />"), "multiline comment keeps line breaks");
  assert.ok(text.includes("Строка 2"));
  assert.ok(html.includes("Рассказ о себе"));
  assert.ok(!html.includes("Анна <b>"), "name escaped");
  for (const body of [html, text, AUTHOR_APPLICATION_NEEDS_CHANGES_EMAIL_SUBJECT]) {
    assert.ok(!body.includes(EM_DASH), "no em dash");
  }
  const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((match) => match[1]);
  assert.ok(hrefs.length > 0);
  for (const href of hrefs) {
    assert.ok(href.startsWith(ORIGIN) || href.startsWith("mailto:"), `no external link: ${href}`);
  }

  const noFields = renderAuthorApplicationNeedsChangesEmailHtml({
    reviewComment: "Коротко",
    siteOrigin: ORIGIN,
  });
  assert.ok(!noFields.includes("Что поправить"));

  assert.equal(
    getBrandEmailTemplateVersion(AUTHOR_APPLICATION_NEEDS_CHANGES_EMAIL_TEMPLATE_KEY),
    AUTHOR_APPLICATION_NEEDS_CHANGES_EMAIL_TEMPLATE_VERSION,
  );
  const rendered = await brandEmailTemplateRenderer.render({
    templateKey: AUTHOR_APPLICATION_NEEDS_CHANGES_EMAIL_TEMPLATE_KEY,
    templateVersion: AUTHOR_APPLICATION_NEEDS_CHANGES_EMAIL_TEMPLATE_VERSION,
    payload: { reviewComment: "Поправьте рассказ", fieldLabels: ["Тематика", 3] },
  } as never);
  assert.equal(rendered.ok, true);
  if (rendered.ok) {
    assert.equal(rendered.subject, AUTHOR_APPLICATION_NEEDS_CHANGES_EMAIL_SUBJECT);
    assert.ok(rendered.html.includes("Поправьте рассказ"));
  }
  const missing = await brandEmailTemplateRenderer.render({
    templateKey: AUTHOR_APPLICATION_NEEDS_CHANGES_EMAIL_TEMPLATE_KEY,
    templateVersion: AUTHOR_APPLICATION_NEEDS_CHANGES_EMAIL_TEMPLATE_VERSION,
    payload: {},
  } as never);
  assert.equal(missing.ok, false);
}

function testMigrationFiles() {
  const migration = readFileSync(
    "supabase/migrations/20270219120000_author_application_revision.sql",
    "utf8",
  );
  const rollback = readFileSync(
    "supabase/rollbacks/20270219120000_author_application_revision.rollback.sql",
    "utf8",
  );
  assert.match(migration, /ADD COLUMN IF NOT EXISTS revision_fields text\[\]/);
  assert.match(migration, /author_applications_guard_revision_fields/);
  assert.match(migration, /author_application_revision_fields_forbidden/);
  assert.match(migration, /author_applications_log_resubmission/);
  assert.match(migration, /OLD\.status = 'needs_changes'/);
  // DB CHECK accepts exactly the app's field keys.
  assert.match(
    migration,
    new RegExp(`cardinality\\(revision_fields\\) <= ${AUTHOR_APPLICATION_REVISION_FIELDS.length}\\b`),
  );
  for (const field of AUTHOR_APPLICATION_REVISION_FIELDS) {
    assert.match(migration, new RegExp(`'${field.key}'`));
  }
  assert.doesNotMatch(migration, /'contacts'/);
  // Supabase default ACL grants new functions to anon/authenticated.
  for (const fn of ["log_author_application_resubmission", "guard_author_application_revision_fields"]) {
    assert.match(
      migration,
      new RegExp(`REVOKE ALL ON FUNCTION public\\.${fn}\\(\\) FROM PUBLIC, anon, authenticated;`),
    );
  }
  const historyGrants = readFileSync(
    "supabase/migrations/20270220120000_author_application_history_grants.sql",
    "utf8",
  );
  assert.match(
    historyGrants,
    /REVOKE ALL ON FUNCTION public\.log_author_application_status_event\(uuid, text, text, uuid, text, text\)\s+FROM PUBLIC, anon, authenticated;/,
  );
  const functionGrants = readFileSync(
    "supabase/migrations/20270222120000_author_application_function_grants.sql",
    "utf8",
  );
  assert.match(
    functionGrants,
    /REVOKE ALL ON FUNCTION public\.guard_author_applications_user_update\(\)\s+FROM PUBLIC, anon, authenticated;/,
  );
  assert.match(
    functionGrants,
    /REVOKE ALL ON FUNCTION public\.transition_author_application_status\(uuid, text, text, text\)\s+FROM PUBLIC, anon, authenticated;/,
  );
  assert.match(
    functionGrants,
    /REVOKE ALL ON FUNCTION public\.approve_author_application\(uuid, text\)\s+FROM PUBLIC, anon;/,
  );
  // The admin approval action calls the RPC through the staff session.
  assert.match(
    functionGrants,
    /GRANT EXECUTE ON FUNCTION public\.approve_author_application\(uuid, text\)\s+TO authenticated, service_role;/,
  );
  assert.match(functionGrants, /has_function_privilege/);
  assert.match(
    readFileSync("supabase/rollbacks/20270222120000_author_application_function_grants.rollback.sql", "utf8"),
    /NOT a migration/,
  );
  // The greeting must not use display_name: it is the project name.
  const adminActions = readFileSync(
    "src/app/(platform)/admin/author-applications/actions.ts",
    "utf8",
  );
  assert.doesNotMatch(adminActions, /applicantName:\s*application\?\.display_name/);
  assert.match(rollback, /NOT a migration/);
  assert.match(rollback, /DROP COLUMN IF EXISTS revision_fields/);
  assert.match(rollback, /DROP TRIGGER IF EXISTS author_applications_log_resubmission/);
  assert.match(rollback, /DROP TRIGGER IF EXISTS author_applications_guard_revision_fields/);
}

testRevisionFields();
testStatusRules();
testHistoryLabels();
testEditLink();
testDedupKey();
await testTemplate();
testMigrationFiles();
console.log("author-application-revision-unit: ok");
