/**
 * Our own test venues hidden from «Подарочная неделя» (task 253821e0). Nothing is deleted:
 * the rows stay in the database, the page only skips them and shows «Скрыто тестовых: N».
 *
 * AUDIOLAD_BUSINESS_TRIAL_EXCLUDED_ORG_IDS: full business_organizations.id values,
 * separated by commas, spaces or new lines. Anything that is not a UUID is ignored.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function businessTrialExcludedOrgIds(env: Record<string, string | undefined>): ReadonlySet<string> {
  const ids = new Set<string>();
  for (const part of (env.AUDIOLAD_BUSINESS_TRIAL_EXCLUDED_ORG_IDS ?? "").split(/[\s,;]+/)) {
    const id = part.trim().toLowerCase();
    if (UUID.test(id)) ids.add(id);
  }
  return ids;
}
