/**
 * Exact-ID cleanup for promo staging fixtures (no broad LIKE deletes).
 */
export function stagingFixtureEmails(suffix) {
  return {
    emailA: `staging-promo-a-${suffix}@staging.audiolad.local`,
    emailB: `staging-promo-b-${suffix}@staging.audiolad.local`,
    slugA: `staging-author-a-${suffix}`,
    slugB: `staging-author-b-${suffix}`,
  };
}

export function unpublishPromoPagesForAuthors(sql, sqlFile, slugA, slugB) {
  const pageIds = sql(
    `SELECT pp.id::text FROM public.promo_pages pp JOIN public.authors a ON a.id = pp.author_id WHERE a.slug IN ('${slugA}', '${slugB}')`,
  )
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  for (const pageId of pageIds) {
    const status = sql(`SELECT status FROM public.promo_pages WHERE id='${pageId}'`);
    if (status === "published") {
      sqlFile(`SELECT public.unpublish_promo_page('${pageId}'::uuid);`);
    }
  }
  return pageIds;
}

export function cleanupPromoStagingSuffix({ suffix, sql, sqlFile, admin, userIds = [] }) {
  const { emailA, emailB, slugA, slugB } = stagingFixtureEmails(suffix);

  unpublishPromoPagesForAuthors(sql, sqlFile, slugA, slugB);

  sql(
    `DELETE FROM public.promotion_campaigns WHERE author_id IN (SELECT id FROM public.authors WHERE slug IN ('${slugA}', '${slugB}'))`,
  );
  sql(
    `DELETE FROM public.promo_page_products WHERE promo_page_id IN (SELECT id FROM public.promo_pages WHERE author_id IN (SELECT id FROM public.authors WHERE slug IN ('${slugA}', '${slugB}')))`,
  );
  sql(
    `DELETE FROM public.promo_pages WHERE author_id IN (SELECT id FROM public.authors WHERE slug IN ('${slugA}', '${slugB}'))`,
  );
  sql(
    `DELETE FROM public.audio_items WHERE practice_id IN (SELECT id FROM public.practices WHERE author_id IN (SELECT id FROM public.authors WHERE slug IN ('${slugA}', '${slugB}')))`,
  );
  sql(
    `DELETE FROM public.practices WHERE author_id IN (SELECT id FROM public.authors WHERE slug IN ('${slugA}', '${slugB}'))`,
  );
  sql(
    `DELETE FROM public.author_members WHERE author_id IN (SELECT id FROM public.authors WHERE slug IN ('${slugA}', '${slugB}'))`,
  );
  sql(`DELETE FROM public.authors WHERE slug IN ('${slugA}', '${slugB}')`);

  if (admin) {
    for (const email of [emailA, emailB]) {
      const userId = sql(
        `SELECT id::text FROM auth.users WHERE email='${email}' LIMIT 1`,
      );
      if (!userId) continue;
      sql(`DELETE FROM public.user_practices WHERE user_id='${userId}'`);
      sql(`DELETE FROM auth.users WHERE id='${userId}'`);
    }
  } else if (userIds.length) {
    for (const userId of userIds) {
      sql(`DELETE FROM public.user_practices WHERE user_id='${userId}'`);
      sql(`DELETE FROM auth.users WHERE id='${userId}'`);
    }
  }
}

export async function cleanupPromoStagingSuffixAsync(ctx) {
  cleanupPromoStagingSuffix(ctx);
}
