-- Venue sound settings for one location.
-- Additive. No changes to existing tables or rows.
-- Owner writes are open. Point writes stay closed until a point session exists.
-- The flag check itself is already in the shared writer, so a later migration
-- must call that writer instead of updating this table directly.

BEGIN;

CREATE TABLE public.business_location_sound_settings (
  location_id uuid PRIMARY KEY
    REFERENCES public.business_locations (id) ON DELETE RESTRICT,
  organization_id uuid NOT NULL
    REFERENCES public.business_organizations (id) ON DELETE RESTRICT,
  character text NOT NULL DEFAULT 'cozy',
  direction text NOT NULL DEFAULT 'jazz',
  daypart_mode text NOT NULL DEFAULT 'auto',
  energy_offset smallint NOT NULL DEFAULT 0,
  morning_start time NOT NULL DEFAULT time '07:00',
  morning_end time NOT NULL DEFAULT time '11:00',
  day_start time NOT NULL DEFAULT time '11:00',
  day_end time NOT NULL DEFAULT time '16:00',
  evening_start time NOT NULL DEFAULT time '16:00',
  evening_end time NOT NULL DEFAULT time '20:00',
  point_can_edit_settings boolean NOT NULL DEFAULT true,
  settings_version bigint NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid NULL REFERENCES auth.users (id) ON DELETE SET NULL,
  CONSTRAINT business_location_sound_settings_character_check
    CHECK (character IN ('cozy', 'city', 'classic', 'evening')),
  CONSTRAINT business_location_sound_settings_direction_check
    CHECK (direction IN ('jazz', 'calm', 'rhythm', 'melodic')),
  CONSTRAINT business_location_sound_settings_daypart_mode_check
    CHECK (daypart_mode IN ('auto', 'morning', 'day', 'evening')),
  CONSTRAINT business_location_sound_settings_energy_check
    CHECK (energy_offset IN (-15, 0, 15)),
  CONSTRAINT business_location_sound_settings_version_check
    CHECK (settings_version >= 1),
  CONSTRAINT business_location_sound_settings_windows_check
    CHECK (
      morning_start < morning_end
      AND morning_end = day_start
      AND day_start < day_end
      AND day_end = evening_start
      AND evening_start < evening_end
    )
);

COMMENT ON TABLE public.business_location_sound_settings IS
  'audiolad:business-sound; one atmosphere row per location. Last sound write wins by settings_version. The venue player applies a newer version on the next track.';

COMMENT ON COLUMN public.business_location_sound_settings.point_can_edit_settings IS
  'When false, the point session cannot change atmosphere. Only the organization owner may change this flag. Local play and pause on the point device are not this flag.';

COMMENT ON COLUMN public.business_location_sound_settings.settings_version IS
  'Increments when the sound fields change. A flag-only update leaves the version as it was.';

CREATE INDEX business_location_sound_settings_org_idx
  ON public.business_location_sound_settings (organization_id);

CREATE OR REPLACE FUNCTION public.business_location_sound_settings_org_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_org uuid;
BEGIN
  SELECT l.organization_id INTO v_org
  FROM public.business_locations AS l
  WHERE l.id = NEW.location_id;

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'location_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_org IS DISTINCT FROM NEW.organization_id THEN
    RAISE EXCEPTION 'cross_organization_settings' USING ERRCODE = '22023';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS business_location_sound_settings_org_guard
  ON public.business_location_sound_settings;
CREATE TRIGGER business_location_sound_settings_org_guard
  BEFORE INSERT OR UPDATE OF location_id, organization_id
  ON public.business_location_sound_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.business_location_sound_settings_org_guard();

DROP TRIGGER IF EXISTS business_location_sound_settings_set_updated_at
  ON public.business_location_sound_settings;
CREATE TRIGGER business_location_sound_settings_set_updated_at
  BEFORE UPDATE ON public.business_location_sound_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.business_domain_set_updated_at();

REVOKE ALL ON FUNCTION public.business_location_sound_settings_org_guard() FROM PUBLIC, anon, authenticated;

ALTER TABLE public.business_location_sound_settings ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.business_location_sound_settings FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.business_location_sound_settings TO authenticated;
GRANT ALL ON TABLE public.business_location_sound_settings TO service_role;

DROP POLICY IF EXISTS "Business members can read location sound settings"
  ON public.business_location_sound_settings;
CREATE POLICY "Business members can read location sound settings"
  ON public.business_location_sound_settings
  FOR SELECT
  TO authenticated
  USING (public.is_business_organization_member(organization_id));

-- Shared writer. Not granted to anon or authenticated.
-- actor 'owner' may change sound and the flag.
-- actor 'point' may change sound only while point_can_edit_settings is true,
-- and cannot change the flag. A missing row counts as allowed (column default true).
CREATE OR REPLACE FUNCTION public.business_location_sound_settings_apply(
  p_location_id uuid,
  p_actor text,
  p_editor uuid,
  p_character text,
  p_direction text,
  p_daypart_mode text,
  p_energy_offset smallint,
  p_morning_start time,
  p_morning_end time,
  p_day_start time,
  p_day_end time,
  p_evening_start time,
  p_evening_end time,
  p_point_can_edit_settings boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_org uuid;
  v_row public.business_location_sound_settings%ROWTYPE;
  v_found boolean;
  v_character text := btrim(coalesce(p_character, ''));
  v_direction text := btrim(coalesce(p_direction, ''));
  v_daypart text := btrim(coalesce(p_daypart_mode, ''));
  v_flag boolean;
  v_changed boolean;
  v_version bigint;
BEGIN
  IF p_actor IS NULL OR p_actor NOT IN ('owner', 'point') THEN
    RAISE EXCEPTION 'invalid_sound_actor' USING ERRCODE = '22023';
  END IF;

  IF p_location_id IS NULL THEN
    RAISE EXCEPTION 'location_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_character NOT IN ('cozy', 'city', 'classic', 'evening')
    OR v_direction NOT IN ('jazz', 'calm', 'rhythm', 'melodic')
    OR v_daypart NOT IN ('auto', 'morning', 'day', 'evening')
    OR p_energy_offset IS NULL
    OR p_energy_offset NOT IN (-15, 0, 15) THEN
    RAISE EXCEPTION 'invalid_sound_settings' USING ERRCODE = '22023';
  END IF;

  IF p_morning_start IS NULL OR p_morning_end IS NULL
    OR p_day_start IS NULL OR p_day_end IS NULL
    OR p_evening_start IS NULL OR p_evening_end IS NULL
    OR NOT (
      p_morning_start < p_morning_end
      AND p_morning_end = p_day_start
      AND p_day_start < p_day_end
      AND p_day_end = p_evening_start
      AND p_evening_start < p_evening_end
    ) THEN
    RAISE EXCEPTION 'invalid_daypart_hours' USING ERRCODE = '22023';
  END IF;

  SELECT l.organization_id INTO v_org
  FROM public.business_locations AS l
  WHERE l.id = p_location_id
  FOR UPDATE;

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'location_not_found' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_row
  FROM public.business_location_sound_settings
  WHERE location_id = p_location_id
  FOR UPDATE;
  v_found := FOUND;

  IF p_actor = 'point' THEN
    IF p_point_can_edit_settings IS NOT NULL THEN
      RAISE EXCEPTION 'point_cannot_change_flag' USING ERRCODE = '42501';
    END IF;
    IF v_found AND v_row.point_can_edit_settings IS FALSE THEN
      RAISE EXCEPTION 'point_settings_locked' USING ERRCODE = '42501';
    END IF;
    v_flag := COALESCE(v_row.point_can_edit_settings, true);
  ELSE
    v_flag := COALESCE(p_point_can_edit_settings, v_row.point_can_edit_settings, true);
  END IF;

  v_changed := NOT v_found
    OR v_row.character IS DISTINCT FROM v_character
    OR v_row.direction IS DISTINCT FROM v_direction
    OR v_row.daypart_mode IS DISTINCT FROM v_daypart
    OR v_row.energy_offset IS DISTINCT FROM p_energy_offset
    OR v_row.morning_start IS DISTINCT FROM p_morning_start
    OR v_row.morning_end IS DISTINCT FROM p_morning_end
    OR v_row.day_start IS DISTINCT FROM p_day_start
    OR v_row.day_end IS DISTINCT FROM p_day_end
    OR v_row.evening_start IS DISTINCT FROM p_evening_start
    OR v_row.evening_end IS DISTINCT FROM p_evening_end;

  v_version := CASE
    WHEN NOT v_found THEN 1
    WHEN v_changed THEN v_row.settings_version + 1
    ELSE v_row.settings_version
  END;

  INSERT INTO public.business_location_sound_settings AS s (
    location_id, organization_id, character, direction, daypart_mode, energy_offset,
    morning_start, morning_end, day_start, day_end, evening_start, evening_end,
    point_can_edit_settings, settings_version, updated_by
  ) VALUES (
    p_location_id, v_org, v_character, v_direction, v_daypart, p_energy_offset,
    p_morning_start, p_morning_end, p_day_start, p_day_end, p_evening_start, p_evening_end,
    v_flag, v_version, CASE WHEN p_actor = 'owner' THEN p_editor ELSE NULL END
  )
  ON CONFLICT (location_id) DO UPDATE SET
    organization_id = EXCLUDED.organization_id,
    character = EXCLUDED.character,
    direction = EXCLUDED.direction,
    daypart_mode = EXCLUDED.daypart_mode,
    energy_offset = EXCLUDED.energy_offset,
    morning_start = EXCLUDED.morning_start,
    morning_end = EXCLUDED.morning_end,
    day_start = EXCLUDED.day_start,
    day_end = EXCLUDED.day_end,
    evening_start = EXCLUDED.evening_start,
    evening_end = EXCLUDED.evening_end,
    point_can_edit_settings = EXCLUDED.point_can_edit_settings,
    settings_version = EXCLUDED.settings_version,
    updated_by = CASE
      WHEN p_actor = 'owner' THEN EXCLUDED.updated_by
      ELSE s.updated_by
    END;

  RETURN jsonb_build_object(
    'ok', true,
    'location_id', p_location_id,
    'settings_version', v_version,
    'point_can_edit_settings', v_flag
  );
END;
$$;

REVOKE ALL ON FUNCTION public.business_location_sound_settings_apply(
  uuid, text, uuid, text, text, text, smallint, time, time, time, time, time, time, boolean
) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.save_business_location_sound_settings(
  p_location_id uuid,
  p_character text,
  p_direction text,
  p_daypart_mode text,
  p_energy_offset smallint,
  p_morning_start time,
  p_morning_end time,
  p_day_start time,
  p_day_end time,
  p_evening_start time,
  p_evening_end time,
  p_point_can_edit_settings boolean DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_org uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT l.organization_id INTO v_org
  FROM public.business_locations AS l
  WHERE l.id = p_location_id;

  IF v_org IS NULL OR NOT public.is_business_organization_owner(v_org, v_user_id) THEN
    RAISE EXCEPTION 'not_organization_owner' USING ERRCODE = '42501';
  END IF;

  RETURN public.business_location_sound_settings_apply(
    p_location_id,
    'owner',
    v_user_id,
    p_character,
    p_direction,
    p_daypart_mode,
    p_energy_offset,
    p_morning_start,
    p_morning_end,
    p_day_start,
    p_day_end,
    p_evening_start,
    p_evening_end,
    p_point_can_edit_settings
  );
END;
$$;

COMMENT ON FUNCTION public.save_business_location_sound_settings(
  uuid, text, text, text, smallint, time, time, time, time, time, time, boolean
) IS
  'audiolad:business-sound; owner-only atmosphere save. Null flag leaves point_can_edit_settings unchanged.';

REVOKE ALL ON FUNCTION public.save_business_location_sound_settings(
  uuid, text, text, text, smallint, time, time, time, time, time, time, boolean
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_business_location_sound_settings(
  uuid, text, text, text, smallint, time, time, time, time, time, time, boolean
) TO authenticated, service_role;

-- Closed until business_point_sessions exists. Migration B replaces this body
-- with a token-hash check and then calls business_location_sound_settings_apply
-- as actor 'point' with a null flag. Do not GRANT this function before that.
CREATE OR REPLACE FUNCTION public.save_business_point_sound_settings(
  p_token text,
  p_location_id uuid,
  p_character text,
  p_direction text,
  p_daypart_mode text,
  p_energy_offset smallint,
  p_morning_start time,
  p_morning_end time,
  p_day_start time,
  p_day_end time,
  p_evening_start time,
  p_evening_end time
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_token IS NULL OR char_length(btrim(p_token)) < 32 THEN
    RAISE EXCEPTION 'invalid_point_token' USING ERRCODE = '42501';
  END IF;
  RAISE EXCEPTION 'point_session_not_available' USING ERRCODE = '42501';
END;
$$;

COMMENT ON FUNCTION public.save_business_point_sound_settings(
  text, uuid, text, text, text, smallint, time, time, time, time, time, time
) IS
  'audiolad:business-sound; point atmosphere save. Closed until a point session can be checked. Flag lock lives in business_location_sound_settings_apply.';

REVOKE ALL ON FUNCTION public.save_business_point_sound_settings(
  text, uuid, text, text, text, smallint, time, time, time, time, time, time
) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.rename_business_location(
  p_location_id uuid,
  p_name text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_org uuid;
  v_name text := btrim(coalesce(p_name, ''));
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;

  IF p_location_id IS NULL THEN
    RAISE EXCEPTION 'location_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF char_length(v_name) < 1 OR char_length(v_name) > 120 THEN
    RAISE EXCEPTION 'invalid_location_name' USING ERRCODE = '22023';
  END IF;

  SELECT l.organization_id INTO v_org
  FROM public.business_locations AS l
  WHERE l.id = p_location_id
  FOR UPDATE;

  IF v_org IS NULL OR NOT public.is_business_organization_owner(v_org, v_user_id) THEN
    RAISE EXCEPTION 'not_organization_owner' USING ERRCODE = '42501';
  END IF;

  UPDATE public.business_locations
  SET name = v_name
  WHERE id = p_location_id;

  RETURN jsonb_build_object('ok', true, 'location_id', p_location_id, 'name', v_name);
END;
$$;

COMMENT ON FUNCTION public.rename_business_location(uuid, text) IS
  'audiolad:business-sound; owner-only rename of business_locations.name. No new name column.';

REVOKE ALL ON FUNCTION public.rename_business_location(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rename_business_location(uuid, text) TO authenticated, service_role;

DO $post$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_class AS c
    JOIN pg_namespace AS n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'business_location_sound_settings'
      AND c.relrowsecurity
  ) THEN
    RAISE EXCEPTION 'Post-check failed: sound settings RLS is off';
  END IF;

  IF NOT has_table_privilege('authenticated', 'public.business_location_sound_settings', 'SELECT') THEN
    RAISE EXCEPTION 'Post-check failed: members cannot read sound settings';
  END IF;

  IF has_table_privilege('authenticated', 'public.business_location_sound_settings', 'INSERT')
    OR has_table_privilege('authenticated', 'public.business_location_sound_settings', 'UPDATE')
    OR has_table_privilege('authenticated', 'public.business_location_sound_settings', 'DELETE')
    OR has_table_privilege('anon', 'public.business_location_sound_settings', 'SELECT') THEN
    RAISE EXCEPTION 'Post-check failed: sound settings write or anon read is open';
  END IF;

  IF has_table_privilege('authenticated', 'public.business_locations', 'UPDATE') THEN
    RAISE EXCEPTION 'Post-check failed: location update must stay closed';
  END IF;

  IF NOT has_function_privilege(
    'authenticated',
    'public.save_business_location_sound_settings(uuid,text,text,text,smallint,time,time,time,time,time,time,boolean)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'Post-check failed: owner save is not granted';
  END IF;

  IF has_function_privilege(
    'anon',
    'public.save_business_point_sound_settings(text,uuid,text,text,text,smallint,time,time,time,time,time,time)',
    'EXECUTE'
  ) OR has_function_privilege(
    'authenticated',
    'public.save_business_point_sound_settings(text,uuid,text,text,text,smallint,time,time,time,time,time,time)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'Post-check failed: point save is already granted';
  END IF;
END
$post$;

COMMIT;

-- Rollback, only after a backup and a separate decision. Do not run this with the migration.
-- It removes the new table and functions. It does not change business_locations rows
-- that rename_business_location may have updated; restore those names from the backup
-- if a rename must be undone.
-- BEGIN;
-- DROP FUNCTION IF EXISTS public.rename_business_location(uuid, text);
-- DROP FUNCTION IF EXISTS public.save_business_point_sound_settings(text, uuid, text, text, text, smallint, time, time, time, time, time, time);
-- DROP FUNCTION IF EXISTS public.save_business_location_sound_settings(uuid, text, text, text, smallint, time, time, time, time, time, time, boolean);
-- DROP FUNCTION IF EXISTS public.business_location_sound_settings_apply(uuid, text, uuid, text, text, text, smallint, time, time, time, time, time, time, boolean);
-- DROP TABLE IF EXISTS public.business_location_sound_settings;
-- COMMIT;
