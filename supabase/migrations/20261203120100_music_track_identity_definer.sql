BEGIN;

-- Restamped from 20261203120000: that version is business_playback_attribution
-- on main. This file stays append-only and does not edit 20261129120000.

-- Author music-track create was failing with SQLSTATE 42501:
-- permission denied for function next_music_track_code.
--
-- 20261129120000 revoked EXECUTE on next_music_track_code() from PUBLIC,
-- anon and authenticated, and granted it only to service_role. The BEFORE
-- INSERT trigger ensure_music_track_identity() and the product-kind backfill
-- trigger stayed SECURITY INVOKER, so an author INSERT ran the trigger as
-- authenticated and the issuer call was denied. The audio_items row was never
-- written. Non-music products never call the issuer.
--
-- Fix: run both trigger functions as their owner (postgres on this Supabase)
-- via SECURITY DEFINER, with search_path pinned to public, pg_temp. The owner
-- keeps EXECUTE on next_music_track_code() because the earlier REVOKE did not
-- target the owner. A DEFINER trigger can therefore assign AL-T-#########
-- during the author's INSERT.
--
-- Do not GRANT EXECUTE on next_music_track_code to authenticated. That
-- function advances a global sequence. A direct grant would let any signed-in
-- user burn codes and read the next value outside the music-insert invariant.
-- The issuer stays SECURITY INVOKER and service_role-only. This migration does
-- not edit 20261129120000.

CREATE OR REPLACE FUNCTION public.ensure_music_track_identity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_product_kind text;
BEGIN
  IF TG_OP = 'UPDATE'
    AND OLD.music_track_code IS NOT NULL
    AND NEW.music_track_code IS DISTINCT FROM OLD.music_track_code THEN
    RAISE EXCEPTION 'music_track_code_immutable' USING ERRCODE = '55000';
  END IF;

  SELECT product_kind
  INTO v_product_kind
  FROM public.practices
  WHERE id = NEW.practice_id;

  IF v_product_kind = 'music' AND NEW.music_track_code IS NULL THEN
    NEW.music_track_code := public.next_music_track_code();
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.backfill_music_track_identity_on_kind_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.product_kind = 'music'
    AND OLD.product_kind IS DISTINCT FROM NEW.product_kind THEN
    UPDATE public.audio_items
    SET music_track_code = public.next_music_track_code(),
        updated_at = now()
    WHERE practice_id = NEW.id
      AND music_track_code IS NULL;
  END IF;

  RETURN NEW;
END;
$$;

-- Reaffirm the issuer lock. CREATE OR REPLACE above does not grant it.
REVOKE ALL ON FUNCTION public.next_music_track_code() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.next_music_track_code() TO service_role;

COMMENT ON FUNCTION public.ensure_music_track_identity() IS
  'audiolad:music-track-identity:v2; SECURITY DEFINER trigger assigns music_track_code without granting next_music_track_code to authenticated.';

COMMENT ON FUNCTION public.backfill_music_track_identity_on_kind_change() IS
  'audiolad:music-track-identity:v2; SECURITY DEFINER backfill when product_kind becomes music. next_music_track_code stays service_role-only.';

DO $$
DECLARE
  v_name text;
  v_definer boolean;
  v_config text[];
  v_owner_can boolean;
  v_names text[] := ARRAY[
    'ensure_music_track_identity',
    'backfill_music_track_identity_on_kind_change'
  ];
BEGIN
  IF (
    SELECT p.prosecdef
    FROM pg_proc AS p
    WHERE p.oid = 'public.next_music_track_code()'::regprocedure
  ) IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'next_music_track_code must stay SECURITY INVOKER';
  END IF;

  IF has_function_privilege('anon', 'public.next_music_track_code()', 'EXECUTE')
    OR has_function_privilege('authenticated', 'public.next_music_track_code()', 'EXECUTE')
    OR NOT has_function_privilege('service_role', 'public.next_music_track_code()', 'EXECUTE') THEN
    RAISE EXCEPTION 'next_music_track_code must stay revoked from anon/authenticated and granted to service_role';
  END IF;

  FOREACH v_name IN ARRAY v_names LOOP
    SELECT p.prosecdef, p.proconfig, has_function_privilege(
      p.proowner,
      'public.next_music_track_code()'::regprocedure,
      'EXECUTE'
    )
    INTO v_definer, v_config, v_owner_can
    FROM pg_proc AS p
    WHERE p.oid = format('public.%I()', v_name)::regprocedure;

    IF v_definer IS DISTINCT FROM true THEN
      RAISE EXCEPTION '% must be SECURITY DEFINER', v_name;
    END IF;

    IF v_config IS NULL
      OR NOT (
        'search_path=public, pg_temp' = ANY (v_config)
        OR 'search_path=public,pg_temp' = ANY (v_config)
      )
    THEN
      RAISE EXCEPTION '% search_path must be public, pg_temp', v_name;
    END IF;

    IF v_owner_can IS DISTINCT FROM true THEN
      RAISE EXCEPTION '% owner cannot execute next_music_track_code', v_name;
    END IF;
  END LOOP;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'ensure_music_track_identity_trigger'
      AND tgrelid = 'public.audio_items'::regclass
      AND NOT tgisinternal
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'backfill_music_track_identity_on_kind_change_trigger'
      AND tgrelid = 'public.practices'::regclass
      AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'music track identity triggers must remain installed';
  END IF;
END;
$$;

COMMIT;
