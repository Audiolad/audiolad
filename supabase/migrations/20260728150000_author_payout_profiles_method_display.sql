-- Additive display columns for payout method summary (no plaintext secrets).
-- DO NOT apply to production without explicit approval.

BEGIN;

ALTER TABLE public.author_payout_profiles
  ADD COLUMN IF NOT EXISTS payout_method text;

ALTER TABLE public.author_payout_profiles
  ADD COLUMN IF NOT EXISTS bank_display_name text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'author_payout_profiles_payout_method_check'
  ) THEN
    ALTER TABLE public.author_payout_profiles
      ADD CONSTRAINT author_payout_profiles_payout_method_check
      CHECK (
        payout_method IS NULL
        OR payout_method = ANY (
          ARRAY[
            'card'::text,
            'sbp'::text,
            'bank_account'::text
          ]
        )
      );
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'author_payout_profiles_bank_display_name_check'
  ) THEN
    ALTER TABLE public.author_payout_profiles
      ADD CONSTRAINT author_payout_profiles_bank_display_name_check
      CHECK (
        bank_display_name IS NULL
        OR char_length(bank_display_name) <= 200
      );
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS author_payout_profiles_payout_method_idx
  ON public.author_payout_profiles (payout_method)
  WHERE payout_method IS NOT NULL;

COMMIT;
