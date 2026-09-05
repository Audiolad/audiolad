-- Seed catalog + identities for isolated admin Ratings tests.
-- Never apply to production.

INSERT INTO auth.users (id) VALUES
  ('11111111-1111-4111-8111-111111111111'),
  ('22222222-2222-4222-8222-222222222222'),
  ('33333333-3333-4333-8333-333333333333'),
  ('44444444-4444-4444-8444-444444444444'),
  ('55555555-5555-4555-8555-555555555555');

INSERT INTO public.authors (id, name, slug) VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'Автор Один', 'author-one'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', 'Автор Два', 'author-two');

INSERT INTO public.practices (id, title, slug, product_kind, author_id) VALUES
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1', 'Практика сна', 'sleep', 'practice', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', 'Музыка утра', 'morning', 'music', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3', 'Аудиопост', 'post', 'audio_post', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2');

INSERT INTO public.profiles (id, full_name, email, created_at) VALUES
  ('11111111-1111-4111-8111-111111111111', 'Слушатель А', 'a@example.com', timestamptz '2026-01-01 00:00:00+00'),
  ('22222222-2222-4222-8222-222222222222', 'Слушатель Б', 'b@example.com', timestamptz '2026-01-02 00:00:00+00'),
  ('33333333-3333-4333-8333-333333333333', 'Слушатель В', 'c@example.com', timestamptz '2026-01-03 00:00:00+00'),
  ('44444444-4444-4444-8444-444444444444', 'Слушатель Г', 'd@example.com', timestamptz '2026-01-04 00:00:00+00'),
  ('55555555-5555-4555-8555-555555555555', 'Слушатель Д', 'e@example.com', timestamptz '2026-09-05 11:50:00+00');
