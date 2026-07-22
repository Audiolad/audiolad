/**
 * Canonical inventory of data-writing scripts for static audit.
 */
export const GUARDED_WRITE_SCRIPTS = [
  "scripts/author-access-provisioning-integration.mjs",
  "scripts/author-promotion-practice-change-integration.mjs",
  "scripts/test-user-reset-integration.mjs",
  "scripts/admin-operation-log-migration-validation.mjs",
  "scripts/platform-analytics-fixture.mjs",
  "scripts/platform-analytics-http-e2e.mjs",
  "scripts/platform-analytics-e2e.mjs",
  "scripts/stage-e-multi-publish-e2e.mjs",
  "scripts/stage-p1-personal-materials-db.mjs",
  "scripts/stage-p2-personal-materials-api-db.mjs",
  "scripts/stage-p3-personal-materials-return-url-db.mjs",
  "scripts/stage-p5-personal-materials-client-library-db.mjs",
  "scripts/stage1-pr2-library-claim-db.mjs",
  "scripts/tmp-promo-staging-smoke.mjs",
  "scripts/.tmp-promo-integration-smoke.mjs",
  "scripts/author-dashboard-e2e.mjs",
  "scripts/backfill-image-variants.mjs",
  "scripts/generate-author-default-avatar.mjs",
  "scripts/profile-avatar-save-smoke.mjs",
  "scripts/promo-zhenskie-signup-e2e.mjs",
  "scripts/playlists-pr2-validation-smoke.mjs",
  "scripts/playlists-pr3-3-storage-smoke.mjs",
  "scripts/playlists-pr5-validation-smoke.mjs",
  "scripts/stage-bc-product-contents-check.mjs",
  "scripts/global-mini-player-e2e.mjs",
  "scripts/promo-funnel-production-smoke.mjs",
];

export const READ_ONLY_SQL_SCRIPTS = [
  "scripts/platform-analytics-security.mjs",
  "scripts/platform-analytics-visitor-audit.mjs",
  "scripts/platform-analytics-sql-verify.mjs",
  "scripts/stage-a-server-check.mjs",
  "scripts/stage-d-listen-check.mjs",
  "scripts/diagnose-kod-save.mjs",
  "scripts/verify-kod-save-flow.mjs",
];

export const ADMIN_INTERACTIVE_SCRIPTS = [
  "scripts/admin-users-deletion-interactive-check.mjs",
];

export const UNIT_MOCK_WRITE_SCRIPTS = [
  "scripts/admin-user-deletion-unit.mjs",
  "scripts/test-user-reset-unit.mjs",
  "scripts/test-user-reset-guard-unit.mjs",
  "scripts/test-user-reset-service-mock-unit.mjs",
];

export const REQUIRED_GUARD_MARKERS = [
  "assertFixtureWritesAllowed",
  "bootstrapDataWriteScript",
  "assertProductionFixturesAllowed",
  "assertAdminInteractiveConfirmed",
  // Isolated personal-materials test DB scripts use this production hard-fail.
  "assertPersonalMaterialsTestDbAllowed",
];

export const REQUIRED_ADMIN_MARKERS = [
  "assertAdminInteractiveConfirmed",
];
