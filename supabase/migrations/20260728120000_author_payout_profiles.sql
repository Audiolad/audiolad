-- Author payout profiles (commercial onboarding step).
-- Sensitive PII is stored only as an application-encrypted envelope (ciphertext).
-- DO NOT apply to production without explicit approval and encryption key ready.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.author_payout_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id uuid NOT NULL UNIQUE
    REFERENCES public.authors (id) ON DELETE RESTRICT,

  recipient_type text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  version integer NOT NULL DEFAULT 1
    CHECK (version >= 1),

  -- Application-level AES-256-GCM envelope (json text). Never plaintext PII.
  encrypted_payload text,

  -- Safe display helpers only (no full legal name / INN / account).
  inn_last4 text
    CHECK (inn_last4 IS NULL OR inn_last4 ~ '^[0-9]{4}$'),
  account_last4 text
    CHECK (account_last4 IS NULL OR account_last4 ~ '^[0-9]{4}$'),

  is_npd_declared boolean NOT NULL DEFAULT false,
  npd_status_checked_at timestamptz,
  npd_status_check_result text
    CHECK (
      npd_status_check_result IS NULL
      OR npd_status_check_result = ANY (
        ARRAY[
          'not_checked'::text,
          'needs_manual_check'::text,
          'confirmed'::text,
          'not_npd'::text,
          'error'::text
        ]
      )
    ),

  review_comment text
    CHECK (review_comment IS NULL OR char_length(review_comment) <= 4000),
  staff_note text
    CHECK (staff_note IS NULL OR char_length(staff_note) <= 4000),
  author_revision_comment text
    CHECK (
      author_revision_comment IS NULL
      OR char_length(author_revision_comment) <= 4000
    ),

  reviewed_by uuid REFERENCES auth.users (id),
  submitted_at timestamptz,
  review_started_at timestamptz,
  verified_at timestamptz,
  rejected_at timestamptz,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT author_payout_profiles_recipient_type_check CHECK (
    recipient_type = ANY (
      ARRAY[
        'self_employed'::text,
        'individual_entrepreneur'::text,
        'individual'::text
      ]
    )
  ),
  CONSTRAINT author_payout_profiles_status_check CHECK (
    status = ANY (
      ARRAY[
        'draft'::text,
        'submitted'::text,
        'in_review'::text,
        'needs_changes'::text,
        'verified'::text,
        'rejected'::text
      ]
    )
  ),
  CONSTRAINT author_payout_profiles_envelope_required_when_submitted CHECK (
    status = 'draft'
    OR (encrypted_payload IS NOT NULL AND length(btrim(encrypted_payload)) > 0)
  )
);

CREATE TABLE IF NOT EXISTS public.author_payout_profile_status_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL
    REFERENCES public.author_payout_profiles (id) ON DELETE CASCADE,
  author_id uuid NOT NULL
    REFERENCES public.authors (id) ON DELETE CASCADE,
  from_status text,
  to_status text NOT NULL,
  actor_user_id uuid REFERENCES auth.users (id),
  actor_role text NOT NULL
    CHECK (actor_role = ANY (ARRAY['author'::text, 'staff'::text, 'system'::text])),
  reason text
    CHECK (reason IS NULL OR char_length(reason) <= 3000),
  -- Safe metadata only: changed_fields, recipient_type, version — never PII values.
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT author_payout_profile_status_events_to_status_check CHECK (
    to_status = ANY (
      ARRAY[
        'draft'::text,
        'submitted'::text,
        'in_review'::text,
        'needs_changes'::text,
        'verified'::text,
        'rejected'::text
      ]
    )
  )
);

CREATE INDEX IF NOT EXISTS author_payout_profiles_status_submitted_idx
  ON public.author_payout_profiles (status, submitted_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS author_payout_profiles_updated_at_idx
  ON public.author_payout_profiles (updated_at DESC);

CREATE INDEX IF NOT EXISTS author_payout_profile_status_events_profile_idx
  ON public.author_payout_profile_status_events (profile_id, created_at DESC);

CREATE INDEX IF NOT EXISTS author_payout_profile_status_events_author_idx
  ON public.author_payout_profile_status_events (author_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.set_author_payout_profiles_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS author_payout_profiles_set_updated_at
  ON public.author_payout_profiles;
CREATE TRIGGER author_payout_profiles_set_updated_at
  BEFORE UPDATE ON public.author_payout_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.set_author_payout_profiles_updated_at();

-- ---------------------------------------------------------------------------
-- 2. RLS — no direct client access to ciphertext / staff notes
-- ---------------------------------------------------------------------------

ALTER TABLE public.author_payout_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.author_payout_profile_status_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.author_payout_profiles FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.author_payout_profile_status_events FROM PUBLIC, anon, authenticated;

GRANT ALL ON TABLE public.author_payout_profiles TO service_role;
GRANT ALL ON TABLE public.author_payout_profile_status_events TO service_role;

-- Intentionally no authenticated policies: all reads/writes go through
-- Next.js server APIs with membership / authors.payout_profiles.review checks
-- and application-level decrypt.

-- ---------------------------------------------------------------------------
-- 3. RBAC permission — owner only (not all admins)
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF to_regclass('public.platform_permissions') IS NULL THEN
    RAISE NOTICE 'platform_permissions missing — skip payout profile permission seed';
    RETURN;
  END IF;

  INSERT INTO public.platform_permissions (code, description)
  VALUES (
    'authors.payout_profiles.review',
    'Review author payout profiles and full bank/tax details'
  )
  ON CONFLICT (code) DO NOTHING;

  -- Explicit owner grant only. Do NOT grant to admin/finance/support.
  INSERT INTO public.platform_role_permissions (role_code, permission_code)
  VALUES ('owner', 'authors.payout_profiles.review')
  ON CONFLICT DO NOTHING;

  -- Guard: no unexpected role grants for this permission.
  IF EXISTS (
    SELECT 1
    FROM public.platform_role_permissions
    WHERE permission_code = 'authors.payout_profiles.review'
      AND role_code <> 'owner'
  ) THEN
    RAISE EXCEPTION 'authors.payout_profiles.review must be owner-only';
  END IF;
END;
$$;

COMMIT;
