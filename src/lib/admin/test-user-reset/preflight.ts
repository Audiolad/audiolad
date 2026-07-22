import {
  TEST_USER_RESET_EMAIL,
  TEST_USER_RESET_NORMALIZED_EMAIL,
} from "@/lib/admin/test-user-reset/constants";
import {
  evaluateTestUserResetBlockers,
  buildTestUserResetBlocker,
  normalizeAllowlistedTestEmail,
} from "@/lib/admin/test-user-reset/policy";
import {
  TEST_USER_RESET_BLOCK_CODES,
  type TestUserResetPreflight,
  TestUserResetPreflightCounts,
} from "@/lib/admin/test-user-reset/types";
import type { createServiceRoleClient } from "@/lib/supabase/service-role";

type ServiceClient = ReturnType<typeof createServiceRoleClient>;

function emptyCounts(): TestUserResetPreflightCounts {
  return {
    userPractices: 0,
    practiceAudioProgress: 0,
    playlists: 0,
    playlistItems: 0,
    emailContacts: 0,
    emailPreferences: 0,
    emailConsents: 0,
    emailOutbox: 0,
    emailDeliveryEvents: 0,
    analyticsSessions: 0,
    analyticsEvents: 0,
    orders: 0,
    payments: 0,
    refundedOrders: 0,
    personalMaterialsCreated: 0,
    personalMaterialsClaimed: 0,
    authorMembers: 0,
    authorApplications: 0,
    promotionCampaigns: 0,
    personalMaterialTemplates: 0,
  };
}

async function countRows(
  service: ServiceClient,
  table: string,
  column: string,
  value: string,
): Promise<number> {
  const { count, error } = await service
    .from(table)
    .select("*", { count: "exact", head: true })
    .eq(column, value);

  if (error) {
    throw new Error(`test_user_reset_preflight_${table}_failed`);
  }

  return count ?? 0;
}

async function countRowsIn(
  service: ServiceClient,
  table: string,
  column: string,
  values: string[],
): Promise<number> {
  if (values.length === 0) {
    return 0;
  }

  const { count, error } = await service
    .from(table)
    .select("*", { count: "exact", head: true })
    .in(column, values);

  if (error) {
    throw new Error(`test_user_reset_preflight_${table}_in_failed`);
  }

  return count ?? 0;
}

async function findAuthUserIdByAllowlistedEmail(
  service: ServiceClient,
): Promise<{ id: string; email: string } | null> {
  const { data: profileMatch, error: profileError } = await service
    .from("profiles")
    .select("id, email")
    .ilike("email", TEST_USER_RESET_NORMALIZED_EMAIL)
    .maybeSingle();

  if (profileError) {
    throw new Error("test_user_reset_profile_lookup_failed");
  }

  if (profileMatch?.id) {
    const { data: authData, error: authError } =
      await service.auth.admin.getUserById(profileMatch.id);

    if (!authError && authData.user?.id && authData.user.email) {
      if (
        normalizeAllowlistedTestEmail(authData.user.email) ===
        TEST_USER_RESET_NORMALIZED_EMAIL
      ) {
        return { id: authData.user.id, email: authData.user.email };
      }
    }
  }

  const { data: listed, error: listError } = await service.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });

  if (listError) {
    throw new Error("test_user_reset_auth_list_failed");
  }

  const authMatch = (listed.users ?? []).find(
    (user) =>
      typeof user.email === "string" &&
      normalizeAllowlistedTestEmail(user.email) === TEST_USER_RESET_NORMALIZED_EMAIL,
  );

  if (!authMatch?.id || !authMatch.email) {
    return null;
  }

  return { id: authMatch.id, email: authMatch.email };
}

async function loadEmailContacts(service: ServiceClient) {
  const { data, error } = await service
    .from("email_contacts")
    .select("id, user_id, email, normalized_email, status")
    .eq("normalized_email", TEST_USER_RESET_NORMALIZED_EMAIL);

  if (error) {
    throw new Error("test_user_reset_preflight_email_contacts_failed");
  }

  return data ?? [];
}

async function countAnalyticsScope(
  service: ServiceClient,
  userId: string | null,
): Promise<{
  anonymousIds: string[];
  analyticsSessionIds: string[];
  analyticsSessions: number;
  analyticsEvents: number;
}> {
  if (!userId) {
    return {
      anonymousIds: [],
      analyticsSessionIds: [],
      analyticsSessions: 0,
      analyticsEvents: 0,
    };
  }

  const { data: sessions, error: sessionsError } = await service
    .from("analytics_sessions")
    .select("id, anonymous_id")
    .eq("user_id", userId);

  if (sessionsError) {
    throw new Error("test_user_reset_preflight_analytics_sessions_failed");
  }

  const { data: events, error: eventsError } = await service
    .from("analytics_events")
    .select("id, anonymous_session_id, session_id")
    .eq("user_id", userId);

  if (eventsError) {
    throw new Error("test_user_reset_preflight_analytics_events_failed");
  }

  const anonymousIds = [
    ...new Set(
      [
        ...(sessions ?? []).map((row) => row.anonymous_id),
        ...(events ?? []).map((row) => row.anonymous_session_id),
      ].filter((value): value is string => Boolean(value?.trim())),
    ),
  ];

  const analyticsSessionIds = [
    ...new Set(
      [
        ...(sessions ?? []).map((row) => row.id),
        ...(events ?? []).map((row) => row.session_id),
      ].filter((value): value is string => Boolean(value)),
    ),
  ];

  const analyticsSessionFilters = [`user_id.eq.${userId}`];
  const analyticsEventFilters = [`user_id.eq.${userId}`];

  for (const anonymousId of anonymousIds) {
    analyticsSessionFilters.push(`anonymous_id.eq.${anonymousId}`);
    analyticsEventFilters.push(`anonymous_session_id.eq.${anonymousId}`);
  }

  for (const sessionId of analyticsSessionIds) {
    analyticsSessionFilters.push(`id.eq.${sessionId}`);
    analyticsEventFilters.push(`session_id.eq.${sessionId}`);
  }

  const { count: analyticsSessions, error: analyticsSessionsCountError } =
    await service
      .from("analytics_sessions")
      .select("id", { count: "exact", head: true })
      .or(analyticsSessionFilters.join(","));

  if (analyticsSessionsCountError) {
    throw new Error("test_user_reset_preflight_analytics_sessions_count_failed");
  }

  const { count: analyticsEvents, error: analyticsEventsCountError } =
    await service
      .from("analytics_events")
      .select("id", { count: "exact", head: true })
      .or(analyticsEventFilters.join(","));

  if (analyticsEventsCountError) {
    throw new Error("test_user_reset_preflight_analytics_events_count_failed");
  }

  return {
    anonymousIds,
    analyticsSessionIds,
    analyticsSessions: analyticsSessions ?? 0,
    analyticsEvents: analyticsEvents ?? 0,
  };
}

export async function getTestUserResetPreflight(
  service: ServiceClient,
  options?: { actorUserId?: string | null },
): Promise<TestUserResetPreflight> {
  const counts = emptyCounts();
  const authUser = await findAuthUserIdByAllowlistedEmail(service);
  const authUserId = authUser?.id ?? null;
  const emailContacts = await loadEmailContacts(service);
  const emailContactIds = emailContacts.map((row) => row.id);
  counts.emailContacts = emailContactIds.length;

  let profile: {
    id: string;
    role: string;
    full_name: string | null;
    email: string | null;
  } | null = null;

  if (authUserId) {
    const { data, error } = await service
      .from("profiles")
      .select("id, role, full_name, email")
      .eq("id", authUserId)
      .maybeSingle();

    if (error) {
      throw new Error("test_user_reset_preflight_profile_failed");
    }

    profile = data;

    counts.userPractices = await countRows(
      service,
      "user_practices",
      "user_id",
      authUserId,
    );
    counts.practiceAudioProgress = await countRows(
      service,
      "practice_audio_progress",
      "user_id",
      authUserId,
    );
    counts.playlists = await countRows(service, "playlists", "user_id", authUserId);

    const { count: playlistItemsCount, error: playlistItemsError } =
      await service
        .from("playlist_items")
        .select("id, playlists!inner(user_id)", { count: "exact", head: true })
        .eq("playlists.user_id", authUserId);

    if (playlistItemsError) {
      throw new Error("test_user_reset_preflight_playlist_items_failed");
    }

    counts.playlistItems = playlistItemsCount ?? 0;
    counts.orders = await countRows(service, "orders", "user_id", authUserId);

    const { count: paymentsCount, error: paymentsError } = await service
      .from("payments")
      .select("id, orders!inner(user_id)", { count: "exact", head: true })
      .eq("orders.user_id", authUserId);

    if (paymentsError) {
      throw new Error("test_user_reset_preflight_payments_failed");
    }

    counts.payments = paymentsCount ?? 0;

    const { count: refundedOnly, error: refundedError } = await service
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("user_id", authUserId)
      .eq("status", "refunded");

    if (refundedError) {
      throw new Error("test_user_reset_preflight_refunds_failed");
    }

    counts.refundedOrders = refundedOnly ?? 0;

    counts.personalMaterialsCreated = await countRows(
      service,
      "personal_materials",
      "created_by",
      authUserId,
    );
    counts.personalMaterialsClaimed = await countRows(
      service,
      "personal_materials",
      "claimed_by_user_id",
      authUserId,
    );
    counts.authorMembers = await countRows(
      service,
      "author_members",
      "user_id",
      authUserId,
    );
    counts.authorApplications = await countRows(
      service,
      "author_applications",
      "user_id",
      authUserId,
    );
    counts.promotionCampaigns = await countRows(
      service,
      "promotion_campaigns",
      "created_by",
      authUserId,
    );
    counts.personalMaterialTemplates = await countRows(
      service,
      "personal_material_templates",
      "created_by",
      authUserId,
    );
    counts.emailPreferences = await countRows(
      service,
      "email_preferences",
      "user_id",
      authUserId,
    );
    counts.emailConsents = await countRows(
      service,
      "email_consents",
      "user_id",
      authUserId,
    );
    counts.emailOutbox = await countRows(
      service,
      "email_outbox",
      "user_id",
      authUserId,
    );
  }

  if (emailContactIds.length > 0) {
    const contactConsents = await countRowsIn(
      service,
      "email_consents",
      "contact_id",
      emailContactIds,
    );
    counts.emailConsents = Math.max(counts.emailConsents, contactConsents);

    const { data: outboxRows, error: outboxError } = await service
      .from("email_outbox")
      .select("id")
      .in("contact_id", emailContactIds);

    if (outboxError) {
      throw new Error("test_user_reset_preflight_outbox_failed");
    }

    const outboxIds = (outboxRows ?? []).map((row) => row.id);
    counts.emailOutbox = Math.max(counts.emailOutbox, outboxIds.length);

    if (outboxIds.length > 0) {
      counts.emailDeliveryEvents = await countRowsIn(
        service,
        "email_delivery_events",
        "outbox_id",
        outboxIds,
      );
    }
  }

  const analyticsScope = await countAnalyticsScope(service, authUserId);
  counts.analyticsSessions = analyticsScope.analyticsSessions;
  counts.analyticsEvents = analyticsScope.analyticsEvents;

  const resolvedEmail =
    authUser?.email ?? emailContacts[0]?.email ?? TEST_USER_RESET_EMAIL;

  const blockers = evaluateTestUserResetBlockers({
    resolvedEmail,
    profileRole: profile?.role ?? null,
    counts,
  });

  if (
    options?.actorUserId &&
    authUserId &&
    options.actorUserId === authUserId
  ) {
    blockers.push(
      buildTestUserResetBlocker(TEST_USER_RESET_BLOCK_CODES.self_reset),
    );
  }

  return {
    allowlistedEmail: TEST_USER_RESET_EMAIL,
    authUserFound: Boolean(authUserId),
    authUserId,
    profileFound: Boolean(profile),
    profileRole: profile?.role ?? null,
    profileDisplayName: profile?.full_name ?? null,
    emailContactIds,
    anonymousIds: analyticsScope.anonymousIds,
    analyticsSessionIds: analyticsScope.analyticsSessionIds,
    counts,
    blockers,
    canReset: blockers.length === 0,
  };
}

export async function resolveAllowlistedTestUserContext(
  service: ServiceClient,
  options?: { actorUserId?: string | null },
): Promise<TestUserResetPreflight> {
  return getTestUserResetPreflight(service, options);
}
