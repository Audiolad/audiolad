-- Isolated A–H smoke for assert_practice_moderation_ready access-level checks.
-- Scratch database only. Never apply to production.

INSERT INTO public.authors (id, name, access_status)
VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Author A', 'free');

CREATE OR REPLACE FUNCTION public._test_ready_detail(p_practice_id uuid)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_detail text;
BEGIN
  BEGIN
    PERFORM public.assert_practice_moderation_ready(p_practice_id);
    RETURN 'READY';
  EXCEPTION
    WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_detail = PG_EXCEPTION_DETAIL;
      RETURN COALESCE(NULLIF(btrim(v_detail), ''), SQLERRM);
  END;
END;
$$;

CREATE OR REPLACE FUNCTION public._seed_ready_course(
  p_id uuid,
  p_levels integer[],
  p_upgrades integer[],
  p_lesson_levels integer[]
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  i integer;
  v_lesson_id uuid;
BEGIN
  INSERT INTO public.practices (id, author_id, title, publication_class, product_kind)
  VALUES (p_id, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Курс', 'course', 'practice');

  IF p_levels IS NOT NULL THEN
    FOR i IN 1 .. coalesce(array_length(p_levels, 1), 0) LOOP
      INSERT INTO public.practice_access_levels (
        practice_id, level, title, upgrade_price
      ) VALUES (
        p_id,
        p_levels[i],
        'Уровень ' || p_levels[i],
        p_upgrades[i]
      );
    END LOOP;
  END IF;

  FOR i IN 1 .. coalesce(array_length(p_lesson_levels, 1), 0) LOOP
    v_lesson_id := gen_random_uuid();
    INSERT INTO public.course_lessons (
      id, publication_id, title, position, required_access_level
    ) VALUES (
      v_lesson_id, p_id, 'Урок ' || i, i - 1, p_lesson_levels[i]
    );
    INSERT INTO public.course_lesson_blocks (lesson_id, type, position, payload)
    VALUES (v_lesson_id, 'text', 0, jsonb_build_object('text', 'Текст урока ' || i));
  END LOOP;
END;
$$;

SELECT public._seed_ready_course(
  'a0000000-0000-4000-8000-00000000000a'::uuid,
  NULL, NULL, ARRAY[1]
);
SELECT public._seed_ready_course(
  'b0000000-0000-4000-8000-00000000000b'::uuid,
  ARRAY[1, 2], ARRAY[NULL, 2222]::integer[], ARRAY[1, 2]
);
SELECT public._seed_ready_course(
  'c0000000-0000-4000-8000-00000000000c'::uuid,
  ARRAY[2], ARRAY[2222]::integer[], ARRAY[2]
);
SELECT public._seed_ready_course(
  'd0000000-0000-4000-8000-00000000000d'::uuid,
  ARRAY[1, 3], ARRAY[NULL, 1500]::integer[], ARRAY[1, 3]
);
SELECT public._seed_ready_course(
  'e0000000-0000-4000-8000-00000000000e'::uuid,
  ARRAY[1, 2], ARRAY[100, 2222]::integer[], ARRAY[1, 2]
);
SELECT public._seed_ready_course(
  'f1000000-0000-4000-8000-0000000000f1'::uuid,
  ARRAY[1, 2], ARRAY[NULL, NULL]::integer[], ARRAY[1, 2]
);
SELECT public._seed_ready_course(
  'f2000000-0000-4000-8000-0000000000f2'::uuid,
  ARRAY[1, 2], ARRAY[NULL, 0]::integer[], ARRAY[1, 2]
);
SELECT public._seed_ready_course(
  'g0000000-0000-4000-8000-00000000000g'::uuid,
  ARRAY[1, 2], ARRAY[NULL, 2222]::integer[], ARRAY[1, 2, 3]
);
SELECT public._seed_ready_course(
  'h0000000-0000-4000-8000-00000000000h'::uuid,
  ARRAY[1, 2], ARRAY[NULL, 2222]::integer[], ARRAY[1]
);
