-- Isolated smoke for location sound settings. Scratch database only.

\set ON_ERROR_STOP on

DO $$
DECLARE
  user_a uuid := '11111111-1111-4111-8111-111111111111';
  user_m uuid := '33333333-3333-4333-8333-333333333333';
  user_b uuid := '22222222-2222-4222-8222-222222222222';
  v_json jsonb;
  v_org uuid;
  v_loc uuid;
  v_version bigint;
  v_flag boolean;
  v_name text;
  cnt integer;
  raised boolean;
  v_err text;
BEGIN
  INSERT INTO auth.users (id, email) VALUES
    (user_a, 'owner@example.com'),
    (user_m, 'manager@example.com'),
    (user_b, 'outsider@example.com');

  PERFORM set_config('request.jwt.claim.sub', user_a::text, true);
  EXECUTE 'SET ROLE authenticated';
  v_json := public.create_business_organization_with_location(
    'Кофейня', 'Кофейня Уют', 'Кафе', 'RU', 'Europe/Moscow'
  );
  v_org := (v_json->>'organization_id')::uuid;
  v_loc := (v_json->>'location_id')::uuid;

  v_json := public.save_business_location_sound_settings(
    v_loc, 'cozy', 'jazz', 'auto', 0::smallint,
    time '07:00', time '11:00', time '11:00', time '16:00', time '16:00', time '20:00',
    NULL::boolean
  );
  IF coalesce(v_json->>'ok', '') <> 'true' OR (v_json->>'settings_version')::bigint <> 1 THEN
    RAISE EXCEPTION 'OwnerSave: expected version 1, got %', v_json;
  END IF;
  IF (v_json->>'point_can_edit_settings')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'OwnerSave: flag must default true';
  END IF;

  v_json := public.save_business_location_sound_settings(
    v_loc, 'city', 'rhythm', 'evening', 15::smallint,
    time '08:00', time '12:00', time '12:00', time '17:00', time '17:00', time '21:00',
    NULL::boolean
  );
  IF (v_json->>'settings_version')::bigint <> 2 THEN
    RAISE EXCEPTION 'LastWrite: expected version 2, got %', v_json;
  END IF;

  v_json := public.save_business_location_sound_settings(
    v_loc, 'city', 'rhythm', 'evening', 15::smallint,
    time '08:00', time '12:00', time '12:00', time '17:00', time '17:00', time '21:00',
    false
  );
  IF (v_json->>'settings_version')::bigint <> 2
    OR (v_json->>'point_can_edit_settings')::boolean IS NOT FALSE THEN
    RAISE EXCEPTION 'FlagOnly: version must stay 2 and flag false, got %', v_json;
  END IF;

  RESET ROLE;
  SELECT settings_version, point_can_edit_settings INTO v_version, v_flag
  FROM public.business_location_sound_settings WHERE location_id = v_loc;
  IF v_version <> 2 OR v_flag IS NOT FALSE THEN
    RAISE EXCEPTION 'Stored row mismatch version % flag %', v_version, v_flag;
  END IF;

  raised := false;
  BEGIN
    PERFORM public.business_location_sound_settings_apply(
      v_loc, 'point', NULL::uuid, 'classic', 'calm', 'day', 0::smallint,
      time '08:00', time '12:00', time '12:00', time '17:00', time '17:00', time '21:00',
      NULL::boolean
    );
  EXCEPTION WHEN OTHERS THEN
    raised := true;
    v_err := SQLERRM;
  END;
  IF NOT raised OR position('point_settings_locked' in v_err) = 0 THEN
    RAISE EXCEPTION 'PointLocked: expected point_settings_locked, got %', v_err;
  END IF;

  UPDATE public.business_location_sound_settings
  SET point_can_edit_settings = true
  WHERE location_id = v_loc;

  v_json := public.business_location_sound_settings_apply(
    v_loc, 'point', NULL::uuid, 'classic', 'calm', 'day', 0::smallint,
    time '08:00', time '12:00', time '12:00', time '17:00', time '17:00', time '21:00',
    NULL::boolean
  );
  IF (v_json->>'settings_version')::bigint <> 3 THEN
    RAISE EXCEPTION 'PointWrite: expected version 3, got %', v_json;
  END IF;
  IF (SELECT updated_by FROM public.business_location_sound_settings WHERE location_id = v_loc) IS DISTINCT FROM user_a THEN
    RAISE EXCEPTION 'PointWrite: must keep the owner in updated_by';
  END IF;

  raised := false;
  BEGIN
    PERFORM public.business_location_sound_settings_apply(
      v_loc, 'point', NULL::uuid, 'classic', 'calm', 'day', 0::smallint,
      time '08:00', time '12:00', time '12:00', time '17:00', time '17:00', time '21:00',
      false
    );
  EXCEPTION WHEN OTHERS THEN
    raised := true;
    v_err := SQLERRM;
  END;
  IF NOT raised OR position('point_cannot_change_flag' in v_err) = 0 THEN
    RAISE EXCEPTION 'PointFlag: expected point_cannot_change_flag, got %', v_err;
  END IF;

  raised := false;
  BEGIN
    PERFORM public.save_business_point_sound_settings(
      repeat('a', 32), v_loc, 'classic', 'calm', 'day', 0::smallint,
      time '08:00', time '12:00', time '12:00', time '17:00', time '17:00', time '21:00'
    );
  EXCEPTION WHEN OTHERS THEN
    raised := true;
    v_err := SQLERRM;
  END;
  IF NOT raised OR position('point_session_not_available' in v_err) = 0 THEN
    RAISE EXCEPTION 'PointClosed: expected point_session_not_available, got %', v_err;
  END IF;

  PERFORM set_config('request.jwt.claim.sub', user_a::text, true);
  EXECUTE 'SET ROLE authenticated';
  v_json := public.rename_business_location(v_loc, '  Кофейня Уют  ');
  IF coalesce(v_json->>'name', '') <> 'Кофейня Уют' THEN
    RAISE EXCEPTION 'Rename: got %', v_json;
  END IF;
  RESET ROLE;
  SELECT name INTO v_name FROM public.business_locations WHERE id = v_loc;
  IF v_name <> 'Кофейня Уют' THEN
    RAISE EXCEPTION 'Rename stored %', v_name;
  END IF;

  INSERT INTO public.business_organization_members (organization_id, user_id, role)
  VALUES (v_org, user_m, 'manager');

  PERFORM set_config('request.jwt.claim.sub', user_m::text, true);
  EXECUTE 'SET ROLE authenticated';
  SELECT count(*) INTO cnt FROM public.business_location_sound_settings WHERE location_id = v_loc;
  IF cnt <> 1 THEN RAISE EXCEPTION 'ManagerRead: expected the row'; END IF;

  raised := false;
  BEGIN
    PERFORM public.save_business_location_sound_settings(
      v_loc, 'cozy', 'jazz', 'auto', 0::smallint,
      time '07:00', time '11:00', time '11:00', time '16:00', time '16:00', time '20:00',
      NULL::boolean
    );
  EXCEPTION WHEN OTHERS THEN
    raised := true;
    v_err := SQLERRM;
  END;
  IF NOT raised OR position('not_organization_owner' in v_err) = 0 THEN
    RAISE EXCEPTION 'ManagerSave: expected not_organization_owner, got %', v_err;
  END IF;

  raised := false;
  BEGIN
    PERFORM public.rename_business_location(v_loc, 'Чужое имя');
  EXCEPTION WHEN OTHERS THEN
    raised := true;
    v_err := SQLERRM;
  END;
  IF NOT raised OR position('not_organization_owner' in v_err) = 0 THEN
    RAISE EXCEPTION 'ManagerRename: expected not_organization_owner, got %', v_err;
  END IF;

  raised := false;
  BEGIN
    INSERT INTO public.business_location_sound_settings (location_id, organization_id)
    VALUES (v_loc, v_org);
  EXCEPTION WHEN insufficient_privilege THEN
    raised := true;
  END;
  IF NOT raised THEN
    RAISE EXCEPTION 'DirectInsert: authenticated must not insert sound settings';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', user_b::text, true);
  SELECT count(*) INTO cnt FROM public.business_location_sound_settings WHERE location_id = v_loc;
  IF cnt <> 0 THEN RAISE EXCEPTION 'OutsiderRead: row leaked'; END IF;

  RESET ROLE;
  SELECT name INTO v_name FROM public.business_locations WHERE id = v_loc;
  IF v_name <> 'Кофейня Уют' THEN
    RAISE EXCEPTION 'ManagerRename wrote a name: %', v_name;
  END IF;
END
$$;
