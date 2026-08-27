-- Isolated RLS + constraint smoke for author_contacts.
-- Run ONLY against a scratch database. Never production postgres.

\set ON_ERROR_STOP on

DO $$
DECLARE
  user_a uuid := '11111111-1111-4111-8111-111111111111';
  user_b uuid := '22222222-2222-4222-8222-222222222222';
  user_guest uuid := '33333333-3333-4333-8333-333333333333';
  author_a uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  author_b uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  contact_a uuid := 'c1111111-1111-4111-8111-111111111111';
  contact_hidden uuid := 'c2222222-2222-4222-8222-222222222222';
  contact_b uuid := 'c3333333-3333-4333-8333-333333333333';
  extra uuid;
  cnt integer;
  raised boolean;
  visible_cnt integer;
BEGIN
  INSERT INTO auth.users (id) VALUES (user_a), (user_b), (user_guest);
  INSERT INTO public.authors (id, name) VALUES (author_a, 'Author A'), (author_b, 'Author B');
  INSERT INTO public.author_members (author_id, user_id, role)
  VALUES (author_a, user_a, 'owner'), (author_b, user_b, 'owner');

  -- -------------------------------------------------------------------------
  -- A. Author A can CRUD / hide / reorder own contacts
  -- -------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claim.sub', user_a::text, false);
  EXECUTE 'SET ROLE authenticated';

  INSERT INTO public.author_contacts (
    id, author_id, platform, title, url, sort_order, is_visible
  ) VALUES (
    contact_a, author_a, 'telegram', 'Telegram-канал', 'https://t.me/a', 0, true
  );

  INSERT INTO public.author_contacts (
    id, author_id, platform, title, url, sort_order, is_visible
  ) VALUES (
    contact_hidden, author_a, 'max', 'Скрытый MAX', 'https://max.ru/a', 1, false
  );

  UPDATE public.author_contacts
  SET title = 'Telegram-канал Сергея', is_visible = true
  WHERE id = contact_a AND author_id = author_a;

  UPDATE public.author_contacts
  SET sort_order = 5
  WHERE id = contact_hidden AND author_id = author_a;

  UPDATE public.author_contacts
  SET sort_order = 1
  WHERE id = contact_a AND author_id = author_a;

  UPDATE public.author_contacts
  SET sort_order = 0
  WHERE id = contact_hidden AND author_id = author_a;

  SELECT count(*) INTO cnt
  FROM public.author_contacts
  WHERE author_id = author_a;
  IF cnt <> 2 THEN
    RAISE EXCEPTION 'A: owner should see both own contacts, got %', cnt;
  END IF;

  -- -------------------------------------------------------------------------
  -- B. Author A cannot mutate author B
  -- -------------------------------------------------------------------------
  raised := false;
  BEGIN
    INSERT INTO public.author_contacts (
      id, author_id, platform, title, url, sort_order, is_visible
    ) VALUES (
      contact_b, author_b, 'telegram', 'Чужой', 'https://t.me/b', 0, true
    );
  EXCEPTION WHEN others THEN
    raised := true;
  END;
  IF NOT raised THEN
    RAISE EXCEPTION 'B: author A insert into author B must fail';
  END IF;

  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', user_b::text, false);
  EXECUTE 'SET ROLE authenticated';

  INSERT INTO public.author_contacts (
    id, author_id, platform, title, url, sort_order, is_visible
  ) VALUES (
    contact_b, author_b, 'telegram', 'Telegram B', 'https://t.me/b', 0, true
  );

  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', user_a::text, false);
  EXECUTE 'SET ROLE authenticated';

  raised := false;
  BEGIN
    UPDATE public.author_contacts
    SET title = 'взлом'
    WHERE id = contact_b;
  EXCEPTION WHEN others THEN
    raised := true;
  END;
  IF NOT raised THEN
    SELECT count(*) INTO cnt FROM public.author_contacts WHERE id = contact_b AND title = 'взлом';
    IF cnt <> 0 THEN
      RAISE EXCEPTION 'B: author A updated author B contact';
    END IF;
    raised := true;
  END IF;

  DELETE FROM public.author_contacts WHERE id = contact_b;
  SELECT count(*) INTO cnt FROM public.author_contacts WHERE id = contact_b;
  IF cnt <> 1 THEN
    RAISE EXCEPTION 'B: author A deleted author B contact';
  END IF;

  -- -------------------------------------------------------------------------
  -- E. Storage RLS for contact icons (existing author-assets policies)
  -- Path shape matches server builder: authors/{authorId}/contacts/{contactId}/...
  -- Client cannot choose this path; API only accepts author_id + contact_id + file.
  -- -------------------------------------------------------------------------
  DECLARE
    icon_a text :=
      'authors/' || author_a::text || '/contacts/' || contact_a::text
      || '/variants/v1/card.webp';
    icon_a_replace text :=
      'authors/' || author_a::text || '/contacts/' || contact_a::text
      || '/variants/v2/card.webp';
    foreign_path text :=
      'authors/' || author_a::text || '/contacts/' || contact_a::text
      || '/variants/stolen/card.webp';
  BEGIN
    RESET ROLE;
    PERFORM set_config('request.jwt.claim.sub', user_a::text, false);
    EXECUTE 'SET ROLE authenticated';

    INSERT INTO storage.objects (bucket_id, name)
    VALUES ('author-assets', icon_a);
    SELECT count(*) INTO cnt FROM storage.objects WHERE name = icon_a;
    IF cnt <> 1 THEN
      RAISE EXCEPTION 'E: author A could not upload own contact icon';
    END IF;

    INSERT INTO storage.objects (bucket_id, name)
    VALUES ('author-assets', icon_a_replace);
    DELETE FROM storage.objects WHERE name = icon_a;
    SELECT count(*) INTO cnt FROM storage.objects WHERE name = icon_a;
    IF cnt <> 0 THEN
      RAISE EXCEPTION 'E: author A could not delete replaced own contact icon';
    END IF;
    SELECT count(*) INTO cnt FROM storage.objects WHERE name = icon_a_replace;
    IF cnt <> 1 THEN
      RAISE EXCEPTION 'E: author A replace upload missing';
    END IF;

    RESET ROLE;
    PERFORM set_config('request.jwt.claim.sub', user_b::text, false);
    EXECUTE 'SET ROLE authenticated';

    raised := false;
    BEGIN
      INSERT INTO storage.objects (bucket_id, name)
      VALUES ('author-assets', foreign_path);
    EXCEPTION WHEN others THEN
      raised := true;
    END;
    IF NOT raised THEN
      RAISE EXCEPTION 'E: author B inserted into author A contact icon path';
    END IF;

    raised := false;
    BEGIN
      UPDATE storage.objects
      SET name = name || '.hijack'
      WHERE name = icon_a_replace;
    EXCEPTION WHEN others THEN
      raised := true;
    END;
    IF NOT raised THEN
      SELECT count(*) INTO cnt
      FROM storage.objects
      WHERE name = icon_a_replace || '.hijack';
      IF cnt <> 0 THEN
        RAISE EXCEPTION 'E: author B overwrote author A contact icon';
      END IF;
    END IF;

    DELETE FROM storage.objects WHERE name = icon_a_replace;
    SELECT count(*) INTO cnt FROM storage.objects WHERE name = icon_a_replace;
    IF cnt <> 1 THEN
      RAISE EXCEPTION 'E: author B deleted author A contact icon';
    END IF;

    RESET ROLE;
    PERFORM set_config('request.jwt.claim.sub', user_a::text, false);
    EXECUTE 'SET ROLE authenticated';
    DELETE FROM storage.objects WHERE name = icon_a_replace;
    SELECT count(*) INTO cnt FROM storage.objects WHERE name = icon_a_replace;
    IF cnt <> 0 THEN
      RAISE EXCEPTION 'E: author A cleanup delete failed';
    END IF;
  END;

  -- -------------------------------------------------------------------------
  -- C. Ordinary user / guest: no mutations; public SELECT only visible
  -- -------------------------------------------------------------------------
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', user_guest::text, false);
  EXECUTE 'SET ROLE authenticated';

  SELECT count(*) INTO visible_cnt FROM public.author_contacts WHERE author_id = author_a;
  IF visible_cnt <> 1 THEN
    RAISE EXCEPTION 'C: guest authenticated must see only visible A contacts, got %', visible_cnt;
  END IF;

  SELECT count(*) INTO cnt FROM public.author_contacts WHERE id = contact_hidden;
  IF cnt <> 0 THEN
    RAISE EXCEPTION 'C: hidden contact leaked to ordinary user';
  END IF;

  raised := false;
  BEGIN
    INSERT INTO public.author_contacts (
      author_id, platform, title, url, sort_order, is_visible
    ) VALUES (
      author_a, 'custom', 'Нет', 'https://example.com', 2, true
    );
  EXCEPTION WHEN others THEN
    raised := true;
  END;
  IF NOT raised THEN
    RAISE EXCEPTION 'C: ordinary user must not insert';
  END IF;

  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', '', false);
  EXECUTE 'SET ROLE anon';

  SELECT count(*) INTO cnt FROM public.author_contacts WHERE author_id = author_a;
  IF cnt <> 1 THEN
    RAISE EXCEPTION 'C: anon must see only visible A contacts, got %', cnt;
  END IF;

  SELECT count(*) INTO cnt FROM public.author_contacts WHERE is_visible = false;
  IF cnt <> 0 THEN
    RAISE EXCEPTION 'C: anon saw hidden contacts';
  END IF;

  raised := false;
  BEGIN
    DELETE FROM public.author_contacts WHERE author_id = author_a;
  EXCEPTION WHEN others THEN
    raised := true;
  END;
  IF NOT raised THEN
    SELECT count(*) INTO cnt FROM public.author_contacts WHERE id = contact_a;
    IF cnt <> 1 THEN
      RAISE EXCEPTION 'C: anon deleted a contact';
    END IF;
  END IF;

  -- -------------------------------------------------------------------------
  -- D + constraints as table owner (postgres): CHECKs fire
  -- -------------------------------------------------------------------------
  RESET ROLE;

  raised := false;
  BEGIN
    INSERT INTO public.author_contacts (
      author_id, platform, title, description, url, sort_order
    ) VALUES (
      author_a, 'telegram', 'Too long', repeat('а', 121), 'https://t.me/x', 2
    );
  EXCEPTION WHEN check_violation THEN
    raised := true;
  END;
  IF NOT raised THEN
    RAISE EXCEPTION 'description 121 must fail CHECK';
  END IF;

  raised := false;
  BEGIN
    INSERT INTO public.author_contacts (
      author_id, platform, title, url, sort_order
    ) VALUES (
      author_a, 'vk', 'VK', 'https://vk.com/x', 2
    );
  EXCEPTION WHEN check_violation THEN
    raised := true;
  END;
  IF NOT raised THEN
    RAISE EXCEPTION 'unknown platform must fail CHECK';
  END IF;

  raised := false;
  BEGIN
    INSERT INTO public.author_contacts (
      author_id, platform, title, url, sort_order
    ) VALUES (
      author_a, 'telegram', 'JS', 'javascript:alert(1)', 2
    );
  EXCEPTION WHEN check_violation THEN
    raised := true;
  END;
  IF NOT raised THEN
    RAISE EXCEPTION 'javascript: url must fail CHECK';
  END IF;

  raised := false;
  BEGIN
    INSERT INTO public.author_contacts (
      author_id, platform, title, url, sort_order
    ) VALUES (
      author_a, 'telegram', 'HTTP', 'http://t.me/x', 2
    );
  EXCEPTION WHEN check_violation THEN
    raised := true;
  END;
  IF NOT raised THEN
    RAISE EXCEPTION 'http url must fail CHECK';
  END IF;

  raised := false;
  BEGIN
    INSERT INTO public.author_contacts (
      author_id, platform, title, url, sort_order
    ) VALUES (
      author_a, 'telegram', 'Order', 'https://t.me/x', 6
    );
  EXCEPTION WHEN check_violation THEN
    raised := true;
  END;
  IF NOT raised THEN
    RAISE EXCEPTION 'sort_order 6 must fail CHECK';
  END IF;

  INSERT INTO public.author_contacts (
    author_id, platform, title, url, sort_order
  ) VALUES
    (author_a, 'custom', '3', 'https://example.com/3', 2),
    (author_a, 'custom', '4', 'https://example.com/4', 3),
    (author_a, 'custom', '5', 'https://example.com/5', 4),
    (author_a, 'custom', '6', 'https://example.com/6', 5);

  raised := false;
  BEGIN
    INSERT INTO public.author_contacts (
      author_id, platform, title, url, sort_order
    ) VALUES (
      author_a, 'custom', '7', 'https://example.com/7', 0
    );
  EXCEPTION WHEN unique_violation THEN
    raised := true;
  END;
  IF NOT raised THEN
    RAISE EXCEPTION '7th contact with reused sort_order must fail unique';
  END IF;

  DELETE FROM public.authors WHERE id = author_b;
  SELECT count(*) INTO cnt FROM public.author_contacts WHERE author_id = author_b;
  IF cnt <> 0 THEN
    RAISE EXCEPTION 'ON DELETE CASCADE did not remove author B contacts';
  END IF;

  -- A can delete own remaining after guest checks
  PERFORM set_config('request.jwt.claim.sub', user_a::text, false);
  EXECUTE 'SET ROLE authenticated';
  DELETE FROM public.author_contacts WHERE id = contact_hidden;
  SELECT count(*) INTO cnt FROM public.author_contacts WHERE id = contact_hidden;
  IF cnt <> 0 THEN
    RAISE EXCEPTION 'A: owner delete own contact failed';
  END IF;

  RESET ROLE;
END;
$$;
