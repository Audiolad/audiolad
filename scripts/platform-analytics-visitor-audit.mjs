#!/usr/bin/env node --experimental-strip-types
/**
 * Read-only platform analytics visitor audit with test-traffic breakdown.
 *
 * Usage:
 *   node scripts/platform-analytics-visitor-audit.mjs [period]
 *
 * period: today | yesterday | 7d | 30d | all  (default: 7d)
 */
import { execSync } from "node:child_process";
import {
  parseAdminAnalyticsPeriod,
  resolveAdminAnalyticsPeriodRange,
} from "../src/lib/admin/analytics-period.ts";

const TEST_UTM_CAMPAIGN_ALLOWLIST = new Set([
  "analytics_dev_fixture",
  "analytics_dev_test",
  "platform_analytics_prod_smoke",
  "analytics_dev_test_signup",
  "analytics_dev_fixture_signup",
]);

const TEST_UTM_CAMPAIGN_SEGMENTS = new Set([
  "test",
  "qa",
  "smoke",
  "e2e",
  "fixture",
  "playwright",
]);

const TEST_ANONYMOUS_ID_PREFIXES = [
  "aaaaaaaa",
  "bbbbbbbb",
  "manual-",
  "test-",
];

function isTestUtmCampaign(campaign) {
  const normalized = campaign?.trim().toLowerCase() ?? "";

  if (!normalized) {
    return false;
  }

  if (TEST_UTM_CAMPAIGN_ALLOWLIST.has(normalized)) {
    return true;
  }

  const segments = normalized.split("_").filter(Boolean);

  return segments.some((segment) => TEST_UTM_CAMPAIGN_SEGMENTS.has(segment));
}

function isTestAnonymousId(anonymousId) {
  const normalized = anonymousId?.trim().toLowerCase() ?? "";

  if (!normalized) {
    return false;
  }

  return TEST_ANONYMOUS_ID_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

function isTestAnalyticsSession(session) {
  if (isTestUtmCampaign(session.utm_campaign)) {
    return true;
  }

  const campaign = session.utm_campaign?.trim() ?? "";

  if (!campaign && isTestAnonymousId(session.anonymous_id)) {
    return true;
  }

  return false;
}

function sql(query) {
  const oneLine = query.replace(/\s+/g, " ").trim();
  return execSync(
    `docker exec supabase-db psql -U postgres -d postgres -tA -F '|' -c ${JSON.stringify(oneLine)}`,
    { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 },
  ).trim();
}

function sqlRows(query) {
  const raw = sql(query);
  if (!raw) return [];
  return raw.split("\n").map((line) => line.split("|"));
}

function shortId(value) {
  if (!value) return null;
  return `${value.slice(0, 8)}…`;
}

function periodClause(range) {
  if (!range.from && !range.to) return "TRUE";
  const parts = [];
  if (range.from) parts.push(`s.started_at >= timestamptz '${range.from}'`);
  if (range.to) parts.push(`s.started_at < timestamptz '${range.to}'`);
  return parts.join(" AND ");
}

function visitorKey(row) {
  return row.user_id ?? row.anonymous_id;
}

function summarizeSessions(sessions, includeTest) {
  const filtered = includeTest
    ? sessions
    : sessions.filter((session) => !isTestAnalyticsSession(session));

  const visitors = new Set(filtered.map(visitorKey));

  return {
    sessions: filtered.length,
    visitors: visitors.size,
  };
}

function countByField(rows, field) {
  const counts = new Map();

  for (const row of rows) {
    const value = row[field]?.trim() || "(empty)";
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  return Object.fromEntries([...counts.entries()].sort((a, b) => b[1] - a[1]));
}

function main() {
  const period = parseAdminAnalyticsPeriod(process.argv[2] ?? "7d");
  const range = resolveAdminAnalyticsPeriodRange(period);
  const where = periodClause(range);

  const rows = sqlRows(`
    SELECT
      s.id,
      s.anonymous_id,
      s.user_id::text,
      COALESCE(s.utm_source, ''),
      COALESCE(s.utm_campaign, ''),
      COALESCE(s.referrer_domain, ''),
      COALESCE(s.landing_path, ''),
      p.role
    FROM public.analytics_sessions s
    LEFT JOIN public.profiles p ON p.id = s.user_id
    WHERE ${where}
    ORDER BY s.started_at;
  `);

  const sessions = rows.map((row) => ({
    id: row[0],
    anonymous_id: row[1],
    user_id: row[2] || null,
    utm_source: row[3] || null,
    utm_campaign: row[4] || null,
    referrer_domain: row[5] || null,
    landing_path: row[6] || null,
    profile_role: row[7] || null,
  }));

  const withTests = summarizeSessions(sessions, true);
  const withoutTests = summarizeSessions(sessions, false);

  const testSessions = sessions.filter((session) => isTestAnalyticsSession(session));
  const nonTestSessions = sessions.filter((session) => !isTestAnalyticsSession(session));

  const nonTestVisitors = [...new Set(nonTestSessions.map(visitorKey))].map((key) => {
    const related = nonTestSessions.filter((session) => visitorKey(session) === key);
    const sample = related[0];

    return {
      visitor_key_prefix: shortId(key),
      sessions: related.length,
      profile_role: sample.profile_role ?? "anonymous",
      utm_source: sample.utm_source || null,
      utm_campaign: sample.utm_campaign || null,
      referrer_domain: sample.referrer_domain || null,
      landing_path: sample.landing_path || null,
    };
  });

  console.log(
    JSON.stringify(
      {
        period: {
          id: period,
          label: range.label,
          from: range.from,
          to: range.to,
        },
        classifier: {
          testUtmCampaignAllowlist: [...TEST_UTM_CAMPAIGN_ALLOWLIST],
          testUtmCampaignSegments: [...TEST_UTM_CAMPAIGN_SEGMENTS],
          testAnonymousIdPrefixes: TEST_ANONYMOUS_ID_PREFIXES,
        },
        totals: {
          withTestTraffic: withTests,
          withoutTestTraffic: withoutTests,
          excludedTestSessions: testSessions.length,
          excludedTestVisitors: new Set(testSessions.map(visitorKey)).size,
        },
        testBreakdown: {
          byCampaign: countByField(
            testSessions,
            "utm_campaign",
          ),
          bySource: countByField(testSessions, "utm_source"),
        },
        nonTestBreakdown: {
          byCampaign: countByField(nonTestSessions, "utm_campaign"),
          bySource: countByField(nonTestSessions, "utm_source"),
          visitors: nonTestVisitors,
          note:
            "Неклассифицированный и внутренний трафик — не подтверждённые внешние посетители.",
        },
      },
      null,
      2,
    ),
  );
}

main();
