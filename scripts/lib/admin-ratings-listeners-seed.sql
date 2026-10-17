-- Synthetic data only. Never apply to production.
INSERT INTO public.authors (id, name, slug) VALUES
  ('a0000000-0000-4000-8000-000000000001', 'Автор Один', 'avtor-odin');

INSERT INTO public.practices (id, title, slug, product_kind, author_id) VALUES
  ('b0000000-0000-4000-8000-000000000001', 'Практика А', 'praktika-a', 'practice', 'a0000000-0000-4000-8000-000000000001'),
  ('b0000000-0000-4000-8000-000000000002', 'Музыка Б', 'muzyka-b', 'music', 'a0000000-0000-4000-8000-000000000001'),
  ('b0000000-0000-4000-8000-000000000003', 'Без слага', NULL, 'practice', 'a0000000-0000-4000-8000-000000000001');

INSERT INTO auth.users (id, email, created_at) VALUES
  ('c0000000-0000-4000-8000-000000000001', 'anna.listener@mail.ru', '2026-10-01T10:00:00Z'),
  ('c0000000-0000-4000-8000-000000000002', 'bob_x@yandex.ru',       '2026-10-10T10:00:00Z'),
  ('c0000000-0000-4000-8000-000000000003', 'tester@mail.ru',        '2026-10-15T10:00:00Z'),
  ('c0000000-0000-4000-8000-000000000004', 'norating@mail.ru',      '2026-10-16T10:00:00Z');

INSERT INTO public.profiles (id, full_name, email, created_at) VALUES
  ('c0000000-0000-4000-8000-000000000001', 'Анна Иванова', 'anna.listener@mail.ru', '2026-10-01T10:00:00Z'),
  ('c0000000-0000-4000-8000-000000000002', '   ', 'bob_x@yandex.ru', '2026-10-10T10:00:00Z'),
  ('c0000000-0000-4000-8000-000000000003', NULL, 'tester@mail.ru', '2026-10-15T10:00:00Z'),
  ('c0000000-0000-4000-8000-000000000004', 'Нет Оценок', 'norating@mail.ru', '2026-10-16T10:00:00Z');

INSERT INTO public.analytics_test_accounts (user_id, label) VALUES
  ('c0000000-0000-4000-8000-000000000003', 'qa');

INSERT INTO public.practice_listen_stats (user_id, practice_id, real_listened_ms, rating_eligible_at) VALUES
  ('c0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', 600000, '2026-10-02T10:00:00Z'),
  ('c0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000002', 45000,  '2026-10-03T10:00:00Z'),
  ('c0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000001', 31000,  '2026-10-10T10:02:00Z'),
  ('c0000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-000000000001', 30000,  '2026-10-15T10:01:00Z');

-- Ratings via the real atomic RPC (creates events too).
SELECT * FROM public.set_practice_rating('c0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', 5, 'v1:ipshared', 'v1:devanna', '2026-10-02T11:00:00Z');
SELECT * FROM public.set_practice_rating('c0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000002', 3, 'v1:ipshared', 'v1:devanna', '2026-10-03T11:00:00Z');
SELECT * FROM public.set_practice_rating('c0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000002', 4, 'v1:ipshared', 'v1:devanna', '2026-10-05T11:00:00Z');
SELECT * FROM public.set_practice_rating('c0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000001', 5, 'v1:ipshared', 'v1:devbob', '2026-10-10T10:05:00Z');
SELECT * FROM public.set_practice_rating('c0000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-000000000001', 1, 'v1:ipother', 'v1:devanna', '2026-10-15T10:03:00Z');

UPDATE public.practice_ratings
SET excluded_at = '2026-10-16T00:00:00Z', excluded_reason = 'synthetic test'
WHERE user_id = 'c0000000-0000-4000-8000-000000000003';
