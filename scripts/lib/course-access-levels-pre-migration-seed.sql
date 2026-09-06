-- Rows that exist before ADD COLUMN DEFAULT 1. Never apply to production.

INSERT INTO auth.users (id) VALUES
  ('11111111-1111-4111-8111-111111111111'),
  ('22222222-2222-4222-8222-222222222222'),
  ('33333333-3333-4333-8333-333333333333');

INSERT INTO public.authors (id, name) VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Author A');

INSERT INTO public.author_members (author_id, user_id, role) VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '33333333-3333-4333-8333-333333333333', 'owner');

INSERT INTO public.practices (
  id, author_id, title, slug, status, price, is_free, publication_class
) VALUES
  (
    'c1111111-1111-4111-8111-111111111111',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'Legacy audio',
    'legacy-audio',
    'published',
    299,
    false,
    'practice'
  ),
  (
    'c2222222-2222-4222-8222-222222222222',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'Course with levels',
    'course-levels',
    'published',
    990,
    false,
    'course'
  ),
  (
    'c3333333-3333-4333-8333-333333333333',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'Course legacy',
    'course-legacy',
    'published',
    490,
    false,
    'course'
  );

-- Existing purchase / lesson before access_level columns exist.
INSERT INTO public.user_practices (user_id, practice_id, access_source)
VALUES (
  '11111111-1111-4111-8111-111111111111',
  'c1111111-1111-4111-8111-111111111111',
  'purchase'
);

INSERT INTO public.course_lessons (id, publication_id, title, position)
VALUES (
  'd1111111-1111-4111-8111-111111111111',
  'c2222222-2222-4222-8222-222222222222',
  'Lesson one',
  0
);
