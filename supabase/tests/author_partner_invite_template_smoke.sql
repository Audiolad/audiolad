-- Scratch-db smoke for the owner invitation template. Never run on production.
\set ON_ERROR_STOP on

DO $$
DECLARE
  owner uuid := '11111111-1111-4111-8111-111111111111';
  editor uuid := '33333333-3333-4333-8333-333333333333';
  other uuid := '22222222-2222-4222-8222-222222222222';
  author uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  v_json jsonb;
  v_err text;
BEGIN
  INSERT INTO auth.users (id) VALUES (owner), (editor), (other);
  INSERT INTO public.authors (id, name, slug) VALUES (author, 'Anna', 'anna');
  INSERT INTO public.author_members (author_id, user_id, role) VALUES
    (author, owner, 'owner'),
    (author, editor, 'editor');

  PERFORM set_config('request.jwt.claim.sub', owner::text, true);
  v_json := public.ensure_author_partner_profile(author);
  IF v_json->>'ok' IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'ensure failed: %', v_json;
  END IF;

  v_json := public.get_author_partner_invite_template(author);
  IF v_json->>'template' IS NOT NULL THEN
    RAISE EXCEPTION 'default template must be null, got %', v_json;
  END IF;

  v_json := public.set_author_partner_invite_template(
    author,
    'Мой текст {HOME_PARTNER_LINK} и {AUTHOR_PARTNER_LINK}'
  );
  IF v_json->>'template' IS DISTINCT FROM 'Мой текст {HOME_PARTNER_LINK} и {AUTHOR_PARTNER_LINK}' THEN
    RAISE EXCEPTION 'save mismatch: %', v_json;
  END IF;

  v_json := public.get_author_partner_invite_template(author);
  IF v_json->>'template' IS DISTINCT FROM 'Мой текст {HOME_PARTNER_LINK} и {AUTHOR_PARTNER_LINK}' THEN
    RAISE EXCEPTION 'reload mismatch: %', v_json;
  END IF;

  PERFORM set_config('request.jwt.claim.sub', editor::text, true);
  BEGIN
    PERFORM public.set_author_partner_invite_template(author, 'editor');
    RAISE EXCEPTION 'editor must be denied';
  EXCEPTION WHEN insufficient_privilege THEN
    v_err := SQLERRM;
  END;
  IF v_err IS DISTINCT FROM 'forbidden' THEN
    RAISE EXCEPTION 'editor error was %', v_err;
  END IF;

  PERFORM set_config('request.jwt.claim.sub', other::text, true);
  v_err := NULL;
  BEGIN
    PERFORM public.get_author_partner_invite_template(author);
    RAISE EXCEPTION 'foreign owner must be denied';
  EXCEPTION WHEN insufficient_privilege THEN
    v_err := SQLERRM;
  END;
  IF v_err IS DISTINCT FROM 'forbidden' THEN
    RAISE EXCEPTION 'foreign error was %', v_err;
  END IF;

  PERFORM set_config('request.jwt.claim.sub', owner::text, true);
  v_json := public.get_author_partner_invite_template(author);
  IF v_json->>'template' IS DISTINCT FROM 'Мой текст {HOME_PARTNER_LINK} и {AUTHOR_PARTNER_LINK}' THEN
    RAISE EXCEPTION 'editor attempt mutated template: %', v_json;
  END IF;
END;
$$;
