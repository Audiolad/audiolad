/**
 * Production fixture guard — re-exports from fixture-context.mjs.
 *
 * ALLOW_PRODUCTION_TEST_FIXTURES=true no longer bypasses production writes.
 */
export {
  FIXTURES_ALLOW_ENV,
  TEST_DATABASE_ENV,
  FIXTURE_PUBLISH_ENV,
  DOC,
  normalizeSupabaseHost,
  isProductionSupabaseTarget,
  isAllowlistedSupabaseTarget,
  hasProductionServerMarker,
  isProductionDeployEnvInUse,
  isProductionFixtureContext,
  isProductionFixturesExplicitlyAllowed,
  buildFixtureContext,
  assertFixtureWritesAllowed,
  assertFixturePublishingAllowed,
  assertProductionFixturesAllowed,
  assertProductionDockerSqlAllowed,
  getDefaultFixturePracticeVisibility,
} from "./fixture-context.mjs";
