/**
 * Machine-readable test fixture markers stored in existing jsonb columns.
 * Not a substitute for production write guards — defence in depth only.
 */

export const FIXTURE_MARKER_KEY = "_audiolad_fixture";

export function buildFixtureMarker(namespace, runId) {
  return {
    [FIXTURE_MARKER_KEY]: {
      test_fixture: true,
      namespace: String(namespace),
      run_id: String(runId),
    },
  };
}

export function buildPracticeFixtureCoverImage(namespace, runId) {
  return buildFixtureMarker(namespace, runId);
}

export function buildAuthorFixtureAvatarImage(namespace, runId) {
  return buildFixtureMarker(namespace, runId);
}

export function buildAnalyticsFixturePayload(namespace, runId, extra = {}) {
  return {
    ...extra,
    ...buildFixtureMarker(namespace, runId),
  };
}

export function hasFixtureMarker(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const marker = value[FIXTURE_MARKER_KEY];
  return (
    marker != null &&
    typeof marker === "object" &&
    marker.test_fixture === true &&
    typeof marker.namespace === "string" &&
    typeof marker.run_id === "string"
  );
}

export function isFixtureMarkedRecord(record) {
  if (!record || typeof record !== "object") {
    return false;
  }

  return (
    hasFixtureMarker(record.cover_image) ||
    hasFixtureMarker(record.avatar_image) ||
    hasFixtureMarker(record.payload)
  );
}

export const FIXTURE_TEST_EMAIL_DOMAIN = "@staging.audiolad.local";

export function isFixtureTestEmail(email) {
  return (
    typeof email === "string" &&
    email.endsWith(FIXTURE_TEST_EMAIL_DOMAIN)
  );
}
