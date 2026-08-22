-- MAX Mini App Stage 2: persist verified external identities.
-- Touch only: never creates auth.users, never sets user_id / linked_at.
-- Safe to DROP FUNCTION + DROP TABLE before Stage 3 links exist.
-- DO NOT apply to production without explicit approval.

BEGIN;

CREATE TABLE public.external_identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  provider_user_id text NOT NULL,
  user_id uuid NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_verified_at timestamptz NOT NULL DEFAULT now(),
  linked_at timestamptz NULL,
  CONSTRAINT external_identities_provider_nonempty
    CHECK (char_length(provider) > 0 AND provider = btrim(provider)),
  CONSTRAINT external_identities_provider_user_id_nonempty
    CHECK (
      char_length(provider_user_id) > 0
      AND provider_user_id = btrim(provider_user_id)
    ),
  CONSTRAINT external_identities_provider_user_unique
    UNIQUE (provider, provider_user_id)
);

CREATE UNIQUE INDEX external_identities_provider_linked_user_uidx
  ON public.external_identities (provider, user_id)
  WHERE user_id IS NOT NULL;

COMMENT ON TABLE public.external_identities IS
  'External messenger identities. Stage 2 MAX touch only; user_id stays NULL until Stage 3.';

ALTER TABLE public.external_identities ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.external_identities FROM PUBLIC;
REVOKE ALL ON TABLE public.external_identities FROM anon;
REVOKE ALL ON TABLE public.external_identities FROM authenticated;

CREATE OR REPLACE FUNCTION public.touch_external_identity(
  p_provider text,
  p_provider_user_id text
)
RETURNS TABLE (linked boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_provider text;
  v_provider_user_id text;
BEGIN
  v_provider := btrim(COALESCE(p_provider, ''));
  v_provider_user_id := btrim(COALESCE(p_provider_user_id, ''));

  IF v_provider = '' THEN
    RAISE EXCEPTION 'invalid_provider' USING ERRCODE = '22023';
  END IF;

  IF v_provider_user_id = '' THEN
    RAISE EXCEPTION 'invalid_provider_user_id' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  INSERT INTO public.external_identities (provider, provider_user_id)
  VALUES (v_provider, v_provider_user_id)
  ON CONFLICT (provider, provider_user_id) DO UPDATE SET
    last_verified_at = now(),
    updated_at = now()
  RETURNING (external_identities.user_id IS NOT NULL);
END;
$$;

COMMENT ON FUNCTION public.touch_external_identity(text, text) IS
  'Upsert provider identity; updates last_verified_at only. Never sets user_id or linked_at.';

REVOKE ALL ON FUNCTION public.touch_external_identity(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.touch_external_identity(text, text) FROM anon;
REVOKE ALL ON FUNCTION public.touch_external_identity(text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.touch_external_identity(text, text) TO service_role;

COMMIT;
