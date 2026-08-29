-- One-time legacy-complete backfill for the commercial checklist 5-step rule.
-- Authors who already satisfy evaluateCommercialOnboardingChecklist complete
-- (application approved + current terms accepted + published paid product,
-- after the published-free commercial gate) but were never stamped complete
-- (old-world 5/6: promotion link and/or payout missing) become immediately
-- compact via commercial_hidden_at.
--
-- Do not treat a later first GET stamp as legacy: new 5th-step completions
-- still first-stamp commercial_completed_at = now() with hidden_at null.
-- Private table only. No columns on public.authors.
-- DO NOT apply to production without explicit approval.

BEGIN;

INSERT INTO public.author_onboarding_ui_state (
  author_id,
  commercial_completed_at,
  commercial_hidden_at
)
SELECT
  authors.id,
  now(),
  now()
FROM public.authors AS authors
WHERE public.author_has_published_free_product_for_commercial_gate(authors.id)
  AND (
    authors.access_status IN (
      'commercial_onboarding',
      'commercial_active',
      'commercial_suspended',
      'commercial'
    )
    OR EXISTS (
      SELECT 1
      FROM public.author_commercial_applications AS applications
      WHERE applications.author_id = authors.id
        AND applications.status = 'approved'
    )
  )
  AND EXISTS (
    SELECT 1
    FROM public.author_terms_versions AS terms_versions
    INNER JOIN public.author_terms_acceptances AS acceptances
      ON acceptances.terms_version_id = terms_versions.id
     AND acceptances.author_id = authors.id
    WHERE terms_versions.is_current IS TRUE
  )
  AND EXISTS (
    SELECT 1
    FROM public.practices AS practices
    WHERE practices.author_id = authors.id
      AND practices.deleted_at IS NULL
      AND practices.status = 'published'
      AND practices.is_free IS FALSE
  )
ON CONFLICT (author_id) DO UPDATE
SET
  commercial_completed_at = COALESCE(
    public.author_onboarding_ui_state.commercial_completed_at,
    EXCLUDED.commercial_completed_at
  ),
  commercial_hidden_at = COALESCE(
    public.author_onboarding_ui_state.commercial_hidden_at,
    EXCLUDED.commercial_hidden_at
  )
WHERE public.author_onboarding_ui_state.commercial_completed_at IS NULL;

COMMENT ON TABLE public.author_onboarding_ui_state IS
  'Per-author onboarding checklist UI epochs. completed_at is first 100% of the current epoch; hidden_at is «Скрыть сейчас». Commercial complete is 5 required steps; promotion and payout do not count. No show/expand preference.';

COMMIT;
