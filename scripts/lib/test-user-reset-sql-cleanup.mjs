/**
 * SQL helpers mirroring scoped cleanup semantics for synthetic integration fixtures.
 */
import { quoteLiteral, sqlScalar } from "./test-user-reset-docker-db.mjs";

export function sqlScopedAnalyticsEventsDelete(targetUserId, anonymousIds = [], sessionIds = []) {
  const clauses = [`user_id = ${quoteLiteral(targetUserId)}`];

  for (const anonymousId of anonymousIds) {
    clauses.push(
      `(anonymous_session_id = ${quoteLiteral(anonymousId)} AND (user_id IS NULL OR user_id = ${quoteLiteral(targetUserId)}))`,
    );
  }

  for (const sessionId of sessionIds) {
    clauses.push(
      `(session_id = ${quoteLiteral(sessionId)}::uuid AND (user_id IS NULL OR user_id = ${quoteLiteral(targetUserId)}))`,
    );
  }

  return `DELETE FROM public.analytics_events WHERE ${clauses.join(" OR ")}`;
}

export function sqlScopedAnalyticsSessionsDelete(targetUserId, anonymousIds = [], sessionIds = []) {
  const clauses = [`user_id = ${quoteLiteral(targetUserId)}`];

  for (const anonymousId of anonymousIds) {
    clauses.push(
      `(anonymous_id = ${quoteLiteral(anonymousId)} AND (user_id IS NULL OR user_id = ${quoteLiteral(targetUserId)}))`,
    );
  }

  for (const sessionId of sessionIds) {
    clauses.push(
      `(id = ${quoteLiteral(sessionId)}::uuid AND (user_id IS NULL OR user_id = ${quoteLiteral(targetUserId)}))`,
    );
  }

  return `DELETE FROM public.analytics_sessions WHERE ${clauses.join(" OR ")}`;
}

export function sqlDeleteSyntheticEmailScope(userId, contactIds, normalizedEmail) {
  const contactList =
    contactIds.length > 0
      ? contactIds.map((id) => quoteLiteral(id)).join(", ")
      : null;

  const outboxFilter = contactList
    ? `(user_id = ${quoteLiteral(userId)} OR contact_id IN (${contactList}))`
    : `user_id = ${quoteLiteral(userId)}`;

  return `
DELETE FROM public.email_delivery_events
WHERE outbox_id IN (SELECT id FROM public.email_outbox WHERE ${outboxFilter});

DELETE FROM public.email_outbox WHERE ${outboxFilter};

DELETE FROM public.email_preferences WHERE user_id = ${quoteLiteral(userId)};

DELETE FROM public.email_consents
WHERE user_id = ${quoteLiteral(userId)}
   ${contactList ? `OR contact_id IN (${contactList})` : ""};

${
  contactList
    ? `DELETE FROM public.email_contacts WHERE id IN (${contactList});`
    : `DELETE FROM public.email_contacts WHERE normalized_email = ${quoteLiteral(normalizedEmail)};`
}
`;
}

export function countAnalyticsEventsForUser(userId) {
  return Number(sqlScalar(`SELECT COUNT(*) FROM public.analytics_events WHERE user_id = ${quoteLiteral(userId)}`));
}

export function countEmailContactsForEmail(normalizedEmail) {
  return Number(
    sqlScalar(
      `SELECT COUNT(*) FROM public.email_contacts WHERE normalized_email = ${quoteLiteral(normalizedEmail)}`,
    ),
  );
}

export function countOrdersForUser(userId) {
  return Number(sqlScalar(`SELECT COUNT(*) FROM public.orders WHERE user_id = ${quoteLiteral(userId)}`));
}
