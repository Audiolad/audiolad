BEGIN;

-- ---------------------------------------------------------------------------
-- Service reminders for AudioLad Business access (not marketing).
-- Additive only. Does not send mail. Does not apply itself to production.
--
-- One contractual end per owner: the later of access_grants.ends_at and
-- access_paid_periods.paid_until. The 3-day grace is not stored on paid_until.
-- Each of before_end, grace_start and grace_last is inserted at most once
-- for a (user_id, period_end) pair. A later paid_until is a new period.
--
-- Claim skips the row when email_preferences.service_notifications is false
-- or email_suppressions has a live scope of all / all_non_critical.
-- Marketing and author_marketing stops do not block this service letter.
-- There is no unsubscribe link.
--
-- A «no» on business_access_renewal_choices for the same user and period_end
-- stops every later letter for that period. Paying (a new paid_until) deletes
-- that «no». The payment function itself is not changed here.
--
-- Rollback is not executed by this file. Run it only with Sergey's OK:
--   1. DROP TRIGGER IF EXISTS business_access_renewal_clear_no ON public.access_paid_periods;
--   2. DROP FUNCTION IF EXISTS public.clear_business_renewal_decline_on_payment();
--   3. DROP FUNCTION IF EXISTS public.admin_business_access_renewal_notes();
--   4. DROP FUNCTION IF EXISTS public.set_business_access_renewal_choice(text, text);
--   5. DROP FUNCTION IF EXISTS public.business_access_renewal_choice_for_caller();
--   6. DROP FUNCTION IF EXISTS public.business_access_contractual_end(uuid);
--   7. DROP TABLE IF EXISTS public.business_access_renewal_notes;
--   8. DROP TABLE IF EXISTS public.business_access_renewal_choices;
--   9. DROP FUNCTION IF EXISTS public.claim_business_access_reminders(integer, integer);
--  10. DROP FUNCTION IF EXISTS public.complete_business_access_reminder(uuid, uuid);
--  11. DROP FUNCTION IF EXISTS public.fail_business_access_reminder(uuid, uuid, boolean);
--  12. DROP FUNCTION IF EXISTS public.business_access_reminder_kind(timestamptz, timestamptz);
--  13. DROP TABLE IF EXISTS public.business_access_reminder_sends;
-- Do not drop access_grants, access_paid_periods, email_preferences or email_suppressions.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.business_access_reminder_sends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  period_end timestamptz NOT NULL,
  reminder_kind text NOT NULL,
  message_type text NOT NULL DEFAULT 'business_access_service',
  status text NOT NULL DEFAULT 'pending',
  lease_token uuid NULL,
  lease_until timestamptz NULL,
  sent_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT business_access_reminder_sends_kind_check
    CHECK (reminder_kind IN ('before_end', 'grace_start', 'grace_last')),
  CONSTRAINT business_access_reminder_sends_message_type_check
    CHECK (message_type = 'business_access_service'),
  CONSTRAINT business_access_reminder_sends_status_check
    CHECK (status IN ('pending', 'sent', 'skipped')),
  CONSTRAINT business_access_reminder_sends_period_kind_key
    UNIQUE (user_id, period_end, reminder_kind)
);

COMMENT ON TABLE public.business_access_reminder_sends IS
  'audiolad:business-access-reminder; one service letter per owner, contractual end and kind. Not marketing. No FK to auth.users.';

ALTER TABLE public.business_access_reminder_sends ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.business_access_reminder_sends FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.business_access_reminder_sends TO service_role;

CREATE OR REPLACE FUNCTION public.business_access_reminder_kind(
  p_period_end timestamptz,
  p_now timestamptz
)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN p_period_end IS NULL OR p_now IS NULL THEN NULL
    WHEN p_now < p_period_end
      AND (
        (timezone('Europe/Moscow', p_period_end))::date
        - (timezone('Europe/Moscow', p_now))::date
      ) BETWEEN 1 AND 3
      THEN 'before_end'
    WHEN p_now >= p_period_end
      AND p_now < p_period_end + interval '3 days'
      AND (timezone('Europe/Moscow', p_now))::date
        = (timezone('Europe/Moscow', p_period_end + interval '3 days' - interval '1 millisecond'))::date
      THEN 'grace_last'
    WHEN p_now >= p_period_end
      AND p_now < p_period_end + interval '3 days'
      AND (timezone('Europe/Moscow', p_now))::date
        >= (timezone('Europe/Moscow', p_period_end))::date
      AND (timezone('Europe/Moscow', p_now))::date
        < (timezone('Europe/Moscow', p_period_end + interval '3 days' - interval '1 millisecond'))::date
      THEN 'grace_start'
    ELSE NULL
  END;
$$;

COMMENT ON FUNCTION public.business_access_reminder_kind(timestamptz, timestamptz) IS
  'audiolad:business-access-reminder; Moscow calendar windows. before_end is 1-3 days before the end day. grace_last is the last grace day. grace_start is the rest of the 3-day grace. Twin of src/lib/business/access-reminders.ts.';

CREATE OR REPLACE FUNCTION public.claim_business_access_reminders(
  p_limit integer DEFAULT 25,
  p_lease_seconds integer DEFAULT 300
)
RETURNS TABLE (
  send_id uuid,
  user_id uuid,
  period_end timestamptz,
  reminder_kind text,
  recipient_email text,
  lease_token uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_limit integer := GREATEST(1, LEAST(COALESCE(p_limit, 25), 100));
  v_lease_seconds integer := GREATEST(30, LEAST(COALESCE(p_lease_seconds, 300), 900));
  v_now timestamptz := clock_timestamp();
BEGIN
  RETURN QUERY
  WITH grant_ends AS (
    SELECT g.user_id, g.ends_at, g.email_hash
    FROM public.access_grants AS g
    WHERE g.kind = 'business_new_client'
  ),
  paid_ends AS (
    SELECT p.user_id, p.paid_until, p.email_hash
    FROM public.access_paid_periods AS p
    WHERE p.kind = 'business_new_client'
  ),
  user_ids AS (
    SELECT g.user_id FROM grant_ends AS g
    UNION
    SELECT p.user_id FROM paid_ends AS p
  ),
  owners AS (
    SELECT
      u.user_id,
      GREATEST(
        COALESCE(
          (SELECT max(g.ends_at) FROM grant_ends AS g WHERE g.user_id = u.user_id),
          '-infinity'::timestamptz
        ),
        COALESCE(
          (
            SELECT max(p.paid_until)
            FROM paid_ends AS p
            WHERE p.user_id = u.user_id
              OR p.email_hash IN (
                SELECT g.email_hash FROM grant_ends AS g WHERE g.user_id = u.user_id
              )
          ),
          '-infinity'::timestamptz
        )
      ) AS period_end
    FROM user_ids AS u
  ),
  due AS MATERIALIZED (
    SELECT
      o.user_id,
      o.period_end,
      public.business_access_reminder_kind(o.period_end, v_now) AS reminder_kind,
      public.normalize_contact_email(au.email) AS recipient_email
    FROM owners AS o
    INNER JOIN auth.users AS au ON au.id = o.user_id
    WHERE o.period_end > '-infinity'::timestamptz
      AND au.email_confirmed_at IS NOT NULL
      AND public.normalize_contact_email(au.email) IS NOT NULL
      AND public.business_access_reminder_kind(o.period_end, v_now) IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM public.business_access_renewal_choices AS c
        WHERE c.user_id = o.user_id
          AND c.period_end = o.period_end
          AND c.answer = 'no'
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.email_preferences AS ep
        WHERE ep.user_id = o.user_id
          AND ep.service_notifications IS FALSE
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.email_suppressions AS s
        WHERE s.normalized_email = public.normalize_contact_email(au.email)
          AND s.scope IN ('all', 'all_non_critical')
          AND (s.expires_at IS NULL OR s.expires_at > v_now)
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.business_access_reminder_sends AS s
        WHERE s.user_id = o.user_id
          AND s.period_end = o.period_end
          AND s.reminder_kind = public.business_access_reminder_kind(o.period_end, v_now)
          AND (
            s.status IN ('sent', 'skipped')
            OR (
              s.status = 'pending'
              AND s.lease_until IS NOT NULL
              AND s.lease_until >= v_now
            )
          )
      )
    ORDER BY o.period_end ASC, o.user_id ASC
    LIMIT v_limit
  ),
  inserted AS (
    INSERT INTO public.business_access_reminder_sends AS s (
      user_id,
      period_end,
      reminder_kind,
      message_type,
      status,
      lease_token,
      lease_until,
      updated_at
    )
    SELECT
      d.user_id,
      d.period_end,
      d.reminder_kind,
      'business_access_service',
      'pending',
      gen_random_uuid(),
      v_now + make_interval(secs => v_lease_seconds),
      v_now
    FROM due AS d
    ON CONFLICT (user_id, period_end, reminder_kind) DO UPDATE
    SET
      lease_token = EXCLUDED.lease_token,
      lease_until = EXCLUDED.lease_until,
      updated_at = EXCLUDED.updated_at
    WHERE s.status = 'pending'
      AND (s.lease_until IS NULL OR s.lease_until < v_now)
    RETURNING
      s.id,
      s.user_id,
      s.period_end,
      s.reminder_kind,
      s.lease_token
  )
  SELECT
    i.id AS send_id,
    i.user_id,
    i.period_end,
    i.reminder_kind,
    d.recipient_email,
    i.lease_token
  FROM inserted AS i
  INNER JOIN due AS d
    ON d.user_id = i.user_id
   AND d.period_end = i.period_end
   AND d.reminder_kind = i.reminder_kind;
END;
$$;

COMMENT ON FUNCTION public.claim_business_access_reminders(integer, integer) IS
  'audiolad:business-access-reminder; lease one due service letter. Service opt-out and all/all_non_critical stops are excluded. Marketing unsubscribe is not.';

CREATE OR REPLACE FUNCTION public.complete_business_access_reminder(
  p_send_id uuid,
  p_lease_token uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_updated integer;
BEGIN
  UPDATE public.business_access_reminder_sends
  SET
    status = 'sent',
    sent_at = clock_timestamp(),
    lease_token = NULL,
    lease_until = NULL,
    updated_at = clock_timestamp()
  WHERE id = p_send_id
    AND lease_token IS NOT DISTINCT FROM p_lease_token
    AND status = 'pending';
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$$;

CREATE OR REPLACE FUNCTION public.fail_business_access_reminder(
  p_send_id uuid,
  p_lease_token uuid,
  p_permanent boolean DEFAULT false
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_updated integer;
BEGIN
  IF COALESCE(p_permanent, false) THEN
    UPDATE public.business_access_reminder_sends
    SET
      status = 'skipped',
      lease_token = NULL,
      lease_until = NULL,
      updated_at = clock_timestamp()
    WHERE id = p_send_id
      AND lease_token IS NOT DISTINCT FROM p_lease_token
      AND status = 'pending';
  ELSE
    UPDATE public.business_access_reminder_sends
    SET
      lease_token = NULL,
      lease_until = NULL,
      updated_at = clock_timestamp()
    WHERE id = p_send_id
      AND lease_token IS NOT DISTINCT FROM p_lease_token
      AND status = 'pending';
  END IF;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.business_access_reminder_kind(timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_business_access_reminders(integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_business_access_reminder(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fail_business_access_reminder(uuid, uuid, boolean) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.business_access_reminder_kind(timestamptz, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_business_access_reminders(integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_business_access_reminder(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_business_access_reminder(uuid, uuid, boolean) TO service_role;

-- Account-level «Да» / «Нет» for the current contractual end.
-- The note lives in a second table: owners can read their own answer,
-- and only an admin can read the free-text note.

CREATE TABLE IF NOT EXISTS public.business_access_renewal_choices (
  user_id uuid NOT NULL,
  period_end timestamptz NOT NULL,
  answer text NOT NULL,
  answered_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, period_end),
  CONSTRAINT business_access_renewal_choices_answer_check
    CHECK (answer IN ('yes', 'no'))
);

COMMENT ON TABLE public.business_access_renewal_choices IS
  'audiolad:business-access-reminder; one yes/no per account and contractual end. A no stops later letters for that end. No FK to auth.users.';

CREATE TABLE IF NOT EXISTS public.business_access_renewal_notes (
  user_id uuid NOT NULL,
  period_end timestamptz NOT NULL,
  improvement_note text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, period_end),
  CONSTRAINT business_access_renewal_notes_choice_fk
    FOREIGN KEY (user_id, period_end)
    REFERENCES public.business_access_renewal_choices (user_id, period_end)
    ON DELETE CASCADE,
  CONSTRAINT business_access_renewal_notes_length_check
    CHECK (char_length(improvement_note) BETWEEN 1 AND 400)
);

COMMENT ON TABLE public.business_access_renewal_notes IS
  'audiolad:business-access-reminder; optional improvement note. Admins only.';

ALTER TABLE public.business_access_renewal_choices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_access_renewal_notes ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.business_access_renewal_choices FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.business_access_renewal_notes FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.business_access_renewal_choices TO authenticated;
GRANT SELECT ON TABLE public.business_access_renewal_notes TO authenticated;
GRANT ALL ON TABLE public.business_access_renewal_choices TO service_role;
GRANT ALL ON TABLE public.business_access_renewal_notes TO service_role;

DROP POLICY IF EXISTS business_access_renewal_choices_select_own ON public.business_access_renewal_choices;
CREATE POLICY business_access_renewal_choices_select_own
  ON public.business_access_renewal_choices
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR public.has_platform_permission(auth.uid(), 'admin_panel.access')
  );

DROP POLICY IF EXISTS business_access_renewal_notes_admin_select ON public.business_access_renewal_notes;
CREATE POLICY business_access_renewal_notes_admin_select
  ON public.business_access_renewal_notes
  FOR SELECT
  TO authenticated
  USING (public.has_platform_permission(auth.uid(), 'admin_panel.access'));

CREATE OR REPLACE FUNCTION public.business_access_contractual_end(p_user_id uuid)
RETURNS timestamptz
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT NULLIF(GREATEST(
    COALESCE(
      (SELECT max(g.ends_at) FROM public.access_grants AS g
        WHERE g.user_id = p_user_id AND g.kind = 'business_new_client'),
      '-infinity'::timestamptz
    ),
    COALESCE(
      (SELECT max(p.paid_until) FROM public.access_paid_periods AS p
        WHERE p.kind = 'business_new_client'
          AND (
            p.user_id = p_user_id
            OR p.email_hash IN (
              SELECT g.email_hash FROM public.access_grants AS g
              WHERE g.user_id = p_user_id AND g.kind = 'business_new_client'
            )
          )),
      '-infinity'::timestamptz
    )
  ), '-infinity'::timestamptz);
$$;

CREATE OR REPLACE FUNCTION public.business_access_renewal_choice_for_caller()
RETURNS TABLE (answer text, period_end timestamptz)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_end timestamptz;
BEGIN
  IF v_user IS NULL THEN
    RETURN;
  END IF;
  v_end := public.business_access_contractual_end(v_user);
  IF v_end IS NULL THEN
    RETURN;
  END IF;
  RETURN QUERY
  SELECT c.answer, c.period_end
  FROM public.business_access_renewal_choices AS c
  WHERE c.user_id = v_user
    AND c.period_end = v_end;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_business_access_renewal_choice(
  p_answer text,
  p_note text DEFAULT NULL
)
RETURNS TABLE (answer text, period_end timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_end timestamptz;
  v_answer text := lower(btrim(coalesce(p_answer, '')));
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
BEGIN
  IF public.business_consent_caller_in_support_mode() THEN
    RAISE EXCEPTION 'support_mode_consent_forbidden' USING ERRCODE = '42501';
  END IF;
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF v_answer NOT IN ('yes', 'no') THEN
    RAISE EXCEPTION 'invalid_renewal_answer' USING ERRCODE = '22023';
  END IF;
  v_end := public.business_access_contractual_end(v_user);
  IF v_end IS NULL THEN
    RAISE EXCEPTION 'no_business_access' USING ERRCODE = 'P0001';
  END IF;
  IF v_note IS NOT NULL AND char_length(v_note) > 400 THEN
    v_note := left(v_note, 400);
  END IF;
  IF v_answer = 'yes' THEN
    v_note := NULL;
  END IF;

  INSERT INTO public.business_access_renewal_choices AS c (user_id, period_end, answer, answered_at)
  VALUES (v_user, v_end, v_answer, clock_timestamp())
  ON CONFLICT (user_id, period_end) DO UPDATE
  SET answer = EXCLUDED.answer, answered_at = EXCLUDED.answered_at;

  IF v_note IS NULL THEN
    DELETE FROM public.business_access_renewal_notes AS n
    WHERE n.user_id = v_user AND n.period_end = v_end;
  ELSE
    INSERT INTO public.business_access_renewal_notes AS n (user_id, period_end, improvement_note, updated_at)
    VALUES (v_user, v_end, v_note, clock_timestamp())
    ON CONFLICT (user_id, period_end) DO UPDATE
    SET improvement_note = EXCLUDED.improvement_note, updated_at = EXCLUDED.updated_at;
  END IF;

  RETURN QUERY SELECT v_answer, v_end;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_business_access_renewal_notes()
RETURNS TABLE (
  user_id uuid,
  period_end timestamptz,
  answer text,
  improvement_note text,
  answered_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL
     OR NOT public.has_platform_permission(auth.uid(), 'admin_panel.access') THEN
    RAISE EXCEPTION 'admin_required' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT c.user_id, c.period_end, c.answer, n.improvement_note, c.answered_at
  FROM public.business_access_renewal_choices AS c
  LEFT JOIN public.business_access_renewal_notes AS n
    ON n.user_id = c.user_id AND n.period_end = c.period_end
  ORDER BY c.answered_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.clear_business_renewal_decline_on_payment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- A payment clears «Нет» for the payer and for any account sharing the paid email.
  DELETE FROM public.business_access_renewal_choices c
  WHERE c.answer = 'no'
    AND c.period_end <= NEW.paid_until
    AND (
      c.user_id = NEW.user_id
      OR c.user_id IN (
        SELECT g.user_id FROM public.access_grants g WHERE g.email_hash = NEW.email_hash
      )
    );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS business_access_renewal_clear_no ON public.access_paid_periods;
CREATE TRIGGER business_access_renewal_clear_no
  AFTER INSERT OR UPDATE OF paid_until ON public.access_paid_periods
  FOR EACH ROW
  EXECUTE FUNCTION public.clear_business_renewal_decline_on_payment();

REVOKE ALL ON FUNCTION public.business_access_contractual_end(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.business_access_renewal_choice_for_caller() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_business_access_renewal_choice(text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_business_access_renewal_notes() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.clear_business_renewal_decline_on_payment() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.business_access_contractual_end(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.business_access_renewal_choice_for_caller() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_business_access_renewal_choice(text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_business_access_renewal_notes() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.clear_business_renewal_decline_on_payment() TO service_role;

COMMIT;
