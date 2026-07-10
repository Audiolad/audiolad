BEGIN;

DO $$
DECLARE
  matched_count integer;
  eligible_count integer;
  existing_count integer;
  occupied_order_count integer;
BEGIN
  SELECT count(*)
  INTO matched_count
  FROM public.practices
  WHERE slug IN (
    'elixir-molodosti',
    'klyuch-k-izobiliyu',
    'kod-prityazheniya'
  );

  IF matched_count <> 3 THEN
    RAISE EXCEPTION 'Expected exactly 3 starter practices, found %', matched_count;
  END IF;

  SELECT count(*)
  INTO eligible_count
  FROM public.practices
  WHERE slug IN (
    'elixir-molodosti',
    'klyuch-k-izobiliyu',
    'kod-prityazheniya'
  )
    AND status = 'published'
    AND is_free = true
    AND price = 0;

  IF eligible_count <> 3 THEN
    RAISE EXCEPTION 'All starter practices must be published, free, and have zero price';
  END IF;

  SELECT count(*)
  INTO existing_count
  FROM public.starter_practices AS sp
  INNER JOIN public.practices AS p ON p.id = sp.practice_id
  WHERE p.slug IN (
    'elixir-molodosti',
    'klyuch-k-izobiliyu',
    'kod-prityazheniya'
  );

  IF existing_count > 0 THEN
    RAISE EXCEPTION 'One or more starter practices are already configured';
  END IF;

  SELECT count(*)
  INTO occupied_order_count
  FROM public.starter_practices
  WHERE sort_order IN (1, 2, 3);

  IF occupied_order_count > 0 THEN
    RAISE EXCEPTION 'Starter sort_order values 1, 2, or 3 are already occupied';
  END IF;
END;
$$;

INSERT INTO public.starter_practices (
  practice_id,
  sort_order,
  is_active
)
SELECT
  p.id,
  CASE p.slug
    WHEN 'elixir-molodosti' THEN 1
    WHEN 'klyuch-k-izobiliyu' THEN 2
    WHEN 'kod-prityazheniya' THEN 3
  END,
  true
FROM public.practices AS p
WHERE p.slug IN (
  'elixir-molodosti',
  'klyuch-k-izobiliyu',
  'kod-prityazheniya'
)
ORDER BY CASE p.slug
  WHEN 'elixir-molodosti' THEN 1
  WHEN 'klyuch-k-izobiliyu' THEN 2
  WHEN 'kod-prityazheniya' THEN 3
END;

DO $$
DECLARE
  active_count integer;
  expected_slug_count integer;
BEGIN
  SELECT count(*)
  INTO active_count
  FROM public.starter_practices
  WHERE is_active = true;

  IF active_count <> 3 THEN
    RAISE EXCEPTION 'Expected exactly 3 active starter practices, found %', active_count;
  END IF;

  SELECT count(*)
  INTO expected_slug_count
  FROM public.starter_practices AS sp
  INNER JOIN public.practices AS p ON p.id = sp.practice_id
  WHERE sp.is_active = true
    AND sp.sort_order IN (1, 2, 3)
    AND p.slug IN (
      'elixir-molodosti',
      'klyuch-k-izobiliyu',
      'kod-prityazheniya'
    )
    AND p.status = 'published'
    AND p.is_free = true
    AND p.price = 0;

  IF expected_slug_count <> 3 THEN
    RAISE EXCEPTION 'Active starter bundle must contain the three configured free published practices';
  END IF;
END;
$$;

COMMIT;
