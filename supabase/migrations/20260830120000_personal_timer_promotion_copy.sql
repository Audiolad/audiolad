BEGIN;

ALTER TABLE public.practice_price_promotions
  ADD COLUMN IF NOT EXISTS above_timer_text text NULL,
  ADD COLUMN IF NOT EXISTS below_button_text text NULL;

ALTER TABLE public.practice_price_promotions
  DROP CONSTRAINT IF EXISTS practice_price_promotions_above_timer_text_check;

ALTER TABLE public.practice_price_promotions
  ADD CONSTRAINT practice_price_promotions_above_timer_text_check
  CHECK (
    above_timer_text IS NULL
    OR char_length(btrim(above_timer_text)) BETWEEN 1 AND 280
  );

ALTER TABLE public.practice_price_promotions
  DROP CONSTRAINT IF EXISTS practice_price_promotions_below_button_text_check;

ALTER TABLE public.practice_price_promotions
  ADD CONSTRAINT practice_price_promotions_below_button_text_check
  CHECK (
    below_button_text IS NULL
    OR char_length(btrim(below_button_text)) BETWEEN 1 AND 280
  );

COMMENT ON COLUMN public.practice_price_promotions.above_timer_text IS
  'Optional personal-timer headline. Null falls back to the default template with {time_left}.';

COMMENT ON COLUMN public.practice_price_promotions.below_button_text IS
  'Optional personal-timer note under the CTA. Null falls back to the default template with {full_price}.';

COMMIT;
