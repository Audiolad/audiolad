-- Author banner focal point for CSS object-position (0–100%, default center).

ALTER TABLE public.authors
  ADD COLUMN IF NOT EXISTS banner_position_x numeric NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS banner_position_y numeric NOT NULL DEFAULT 50;

ALTER TABLE public.authors
  DROP CONSTRAINT IF EXISTS authors_banner_position_x_range;

ALTER TABLE public.authors
  ADD CONSTRAINT authors_banner_position_x_range
  CHECK (banner_position_x >= 0 AND banner_position_x <= 100);

ALTER TABLE public.authors
  DROP CONSTRAINT IF EXISTS authors_banner_position_y_range;

ALTER TABLE public.authors
  ADD CONSTRAINT authors_banner_position_y_range
  CHECK (banner_position_y >= 0 AND banner_position_y <= 100);

COMMENT ON COLUMN public.authors.banner_position_x IS
  'Horizontal object-position for author banner (0–100, default 50 = center).';

COMMENT ON COLUMN public.authors.banner_position_y IS
  'Vertical object-position for author banner (0–100, default 50 = center).';
