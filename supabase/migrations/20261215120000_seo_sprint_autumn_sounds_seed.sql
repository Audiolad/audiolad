-- SEO sprint #1 «Осень звучит»: canonical SEO base + lightweight sprint membership.
-- User-curated Wordstat phrases. Frequencies are intentionally NULL because counts were not provided.
-- Initial pool: 100 (56 music / 44 voice). Reserve: 99 (43 music / 56 voice).
-- Existing seo_queries keep authoritative query_text/frequency/source; initial-pool rows are promoted to analyzed.
-- Reservation/occupancy continues to use the existing public.seo_query_reservations lifecycle.

BEGIN;

CREATE TABLE public.seo_sprints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT seo_sprints_slug_not_blank CHECK (btrim(slug) <> ''),
  CONSTRAINT seo_sprints_title_not_blank CHECK (btrim(title) <> '')
);

CREATE TABLE public.seo_sprint_queries (
  sprint_id uuid NOT NULL REFERENCES public.seo_sprints(id) ON DELETE CASCADE,
  query_id uuid NOT NULL REFERENCES public.seo_queries(id) ON DELETE CASCADE,
  display_title text NOT NULL,
  author_group text NOT NULL,
  pool text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (sprint_id, query_id),
  CONSTRAINT seo_sprint_queries_title_not_blank CHECK (btrim(display_title) <> ''),
  CONSTRAINT seo_sprint_queries_author_group_check CHECK (author_group IN ('music', 'voice')),
  CONSTRAINT seo_sprint_queries_pool_check CHECK (pool IN ('initial', 'reserve'))
);

CREATE INDEX seo_sprint_queries_listing_idx
  ON public.seo_sprint_queries(sprint_id, author_group, pool, display_title);

ALTER TABLE public.seo_sprints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seo_sprint_queries ENABLE ROW LEVEL SECURITY;

CREATE POLICY seo_sprints_select_authors_or_staff ON public.seo_sprints
  FOR SELECT TO authenticated USING (
    public.is_platform_staff(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.author_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'editor')
    )
  );

CREATE POLICY seo_sprint_queries_select_authors_or_staff ON public.seo_sprint_queries
  FOR SELECT TO authenticated USING (
    public.is_platform_staff(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.author_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'editor')
    )
  );

CREATE POLICY seo_sprints_manage_staff ON public.seo_sprints
  FOR ALL TO authenticated
  USING (public.is_platform_staff(auth.uid()))
  WITH CHECK (public.is_platform_staff(auth.uid()));

CREATE POLICY seo_sprint_queries_manage_staff ON public.seo_sprint_queries
  FOR ALL TO authenticated
  USING (public.is_platform_staff(auth.uid()))
  WITH CHECK (public.is_platform_staff(auth.uid()));

REVOKE ALL ON public.seo_sprints, public.seo_sprint_queries FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.seo_sprints, public.seo_sprint_queries TO authenticated;
GRANT ALL ON public.seo_sprints, public.seo_sprint_queries TO service_role;

INSERT INTO public.seo_sprints (slug, title)
VALUES ('osen-zvuchit-2026', 'Осень звучит')
ON CONFLICT (slug) DO UPDATE
SET title = EXCLUDED.title;

INSERT INTO public.seo_queries (
  query_text,
  frequency,
  frequency_checked_at,
  intent,
  recommended_format,
  audio_fit,
  analysis_status,
  source
)
VALUES
  ('Босса нова музыка для кофейни', NULL, NULL, 'music', 'Музыка', 'high', 'analyzed', 'manual'),
  ('Волшебная осенняя музыка', NULL, NULL, 'music', 'Музыка', 'high', 'analyzed', 'manual'),
  ('Грустная осенняя музыка', NULL, NULL, 'music', 'Музыка', 'high', 'analyzed', 'manual'),
  ('Детская осенняя музыка без слов', NULL, NULL, 'music', 'Музыка', 'high', 'analyzed', 'manual'),
  ('Джазовая музыка для кофеен', NULL, NULL, 'music', 'Музыка', 'high', 'analyzed', 'manual'),
  ('Звук дождя для глубокого сна', NULL, NULL, 'music', 'Музыка', 'high', 'analyzed', 'manual'),
  ('Звук дождя для сна и отдыха', NULL, NULL, 'music', 'Музыка', 'high', 'analyzed', 'manual'),
  ('Звуки осеннего леса', NULL, NULL, 'music', 'Музыка', 'high', 'analyzed', 'manual'),
  ('Китайская музыка для релакса', NULL, NULL, 'music', 'Музыка', 'high', 'analyzed', 'manual'),
  ('Красивая музыка для массажа', NULL, NULL, 'music', 'Музыка', 'high', 'analyzed', 'manual'),
  ('Красивая музыка для релакса и отдыха', NULL, NULL, 'music', 'Музыка', 'high', 'analyzed', 'manual'),
  ('Легкая музыка для релакса', NULL, NULL, 'music', 'Музыка', 'high', 'analyzed', 'manual'),
  ('Музыка для занятий творчеством', NULL, NULL, 'music', 'Музыка', 'high', 'analyzed', 'manual'),
  ('Музыка для кофейни джаз', NULL, NULL, 'music', 'Музыка', 'high', 'analyzed', 'manual'),
  ('Музыка для массажа и расслабления', NULL, NULL, 'music', 'Музыка', 'high', 'analyzed', 'manual'),
  ('Музыка для массажа и спа', NULL, NULL, 'music', 'Музыка', 'high', 'analyzed', 'manual'),
  ('Музыка для осенней прогулки', NULL, NULL, 'music', 'Музыка', 'high', 'analyzed', 'manual'),
  ('Музыка для осенней ярмарки', NULL, NULL, 'music', 'Музыка', 'high', 'analyzed', 'manual'),
  ('Музыка для релакса джаз', NULL, NULL, 'music', 'Музыка', 'high', 'analyzed', 'manual'),
  ('Музыка для релакса осень', NULL, NULL, 'music', 'Музыка', 'high', 'analyzed', 'manual'),
  ('Музыка для релакса пианино', NULL, NULL, 'music', 'Музыка', 'high', 'analyzed', 'manual'),
  ('Музыка для релакса саксофон', NULL, NULL, 'music', 'Музыка', 'high', 'analyzed', 'manual'),
  ('Музыка для уютного вечера', NULL, NULL, 'music', 'Музыка', 'high', 'analyzed', 'manual'),
  ('Музыка осеннего утра', NULL, NULL, 'music', 'Музыка', 'high', 'analyzed', 'manual'),
  ('Музыка осенней природы', NULL, NULL, 'music', 'Музыка', 'high', 'analyzed', 'manual'),
  ('Музыка релакс для йоги', NULL, NULL, 'music', 'Музыка', 'high', 'analyzed', 'manual'),
  ('Музыка релакс для медитации', NULL, NULL, 'music', 'Музыка', 'high', 'analyzed', 'manual'),
  ('Музыка релакс для работы', NULL, NULL, 'music', 'Музыка', 'high', 'analyzed', 'manual'),
  ('Музыка релакс для рисования', NULL, NULL, 'music', 'Музыка', 'high', 'analyzed', 'manual'),
  ('Мягкий звук дождя для сна', NULL, NULL, 'music', 'Музыка', 'high', 'analyzed', 'manual'),
  ('Осенний джаз музыка для отдыха', NULL, NULL, 'music', 'Музыка', 'high', 'analyzed', 'manual'),
  ('Осенняя джазовая музыка', NULL, NULL, 'music', 'Музыка', 'high', 'analyzed', 'manual'),
  ('Осенняя музыка для души', NULL, NULL, 'music', 'Музыка', 'high', 'analyzed', 'manual'),
  ('Осенняя музыка для малышей', NULL, NULL, 'music', 'Музыка', 'high', 'analyzed', 'manual'),
  ('Осенняя музыка для сна', NULL, NULL, 'music', 'Музыка', 'high', 'analyzed', 'manual'),
  ('Осенняя музыка для творчества', NULL, NULL, 'music', 'Музыка', 'high', 'analyzed', 'manual'),
  ('Осенняя музыка для учебы', NULL, NULL, 'music', 'Музыка', 'high', 'analyzed', 'manual'),
  ('Осенняя уютная музыка', NULL, NULL, 'music', 'Музыка', 'high', 'analyzed', 'manual'),
  ('Расслабляющая музыка для релакса', NULL, NULL, 'music', 'Музыка', 'high', 'analyzed', 'manual'),
  ('Расслабляющая музыка для чтения', NULL, NULL, 'music', 'Музыка', 'high', 'analyzed', 'manual'),
  ('Релакс музыка для отдыха', NULL, NULL, 'music', 'Музыка', 'high', 'analyzed', 'manual'),
  ('Релакс музыка для хорошего сна', NULL, NULL, 'music', 'Музыка', 'high', 'analyzed', 'manual'),
  ('Спокойная музыка для кофейни', NULL, NULL, 'music', 'Музыка', 'high', 'analyzed', 'manual'),
  ('Спокойная музыка для работы в офисе', NULL, NULL, 'music', 'Музыка', 'high', 'analyzed', 'manual'),
  ('Спокойная музыка для работы и учебы', NULL, NULL, 'music', 'Музыка', 'high', 'analyzed', 'manual'),
  ('Спокойная музыка для чтения книг', NULL, NULL, 'music', 'Музыка', 'high', 'analyzed', 'manual'),
  ('Спокойная уютная музыка', NULL, NULL, 'music', 'Музыка', 'high', 'analyzed', 'manual'),
  ('Спокойная фоновая музыка для чтения', NULL, NULL, 'music', 'Музыка', 'high', 'analyzed', 'manual'),
  ('Теплая уютная музыка', NULL, NULL, 'music', 'Музыка', 'high', 'analyzed', 'manual'),
  ('Уютная джазовая музыка', NULL, NULL, 'music', 'Музыка', 'high', 'analyzed', 'manual'),
  ('Уютная музыка для дома', NULL, NULL, 'music', 'Музыка', 'high', 'analyzed', 'manual'),
  ('Уютная музыка для работы', NULL, NULL, 'music', 'Музыка', 'high', 'analyzed', 'manual'),
  ('Уютная музыка для учебы', NULL, NULL, 'music', 'Музыка', 'high', 'analyzed', 'manual'),
  ('Уютная музыка кофейни', NULL, NULL, 'music', 'Музыка', 'high', 'analyzed', 'manual'),
  ('Фоновая музыка для кофейни', NULL, NULL, 'music', 'Музыка', 'high', 'analyzed', 'manual'),
  ('Фоновая музыка для творчества', NULL, NULL, 'music', 'Музыка', 'high', 'analyzed', 'manual'),
  ('Аффирмации на благополучие', NULL, NULL, 'practice', 'Свой формат', 'high', 'analyzed', 'manual'),
  ('Аффирмации на деньги и изобилие', NULL, NULL, 'practice', 'Свой формат', 'high', 'analyzed', 'manual'),
  ('Аффирмации на женскую привлекательность', NULL, NULL, 'practice', 'Свой формат', 'high', 'analyzed', 'manual'),
  ('Аффирмации на исполнение желаний', NULL, NULL, 'practice', 'Свой формат', 'high', 'analyzed', 'manual'),
  ('Аффирмации на привлекательность', NULL, NULL, 'practice', 'Свой формат', 'high', 'analyzed', 'manual'),
  ('Аффирмации на привлечение мужчины', NULL, NULL, 'practice', 'Свой формат', 'high', 'analyzed', 'manual'),
  ('Аффирмации на самооценку', NULL, NULL, 'practice', 'Свой формат', 'high', 'analyzed', 'manual'),
  ('Аффирмации на счастливую любовь', NULL, NULL, 'practice', 'Свой формат', 'high', 'analyzed', 'manual'),
  ('Аффирмации на счастливый день', NULL, NULL, 'practice', 'Свой формат', 'high', 'analyzed', 'manual'),
  ('Аффирмации на уверенность в себе для женщины', NULL, NULL, 'practice', 'Свой формат', 'high', 'analyzed', 'manual'),
  ('Аффирмации на удачу и богатство', NULL, NULL, 'practice', 'Свой формат', 'high', 'analyzed', 'manual'),
  ('Аффирмации на удачу и везение', NULL, NULL, 'practice', 'Свой формат', 'high', 'analyzed', 'manual'),
  ('Аффирмации на учебу', NULL, NULL, 'practice', 'Свой формат', 'high', 'analyzed', 'manual'),
  ('Аффирмация на желание', NULL, NULL, 'practice', 'Свой формат', 'high', 'analyzed', 'manual'),
  ('Аффирмация на отношения с мужчиной', NULL, NULL, 'practice', 'Свой формат', 'high', 'analyzed', 'manual'),
  ('Аффирмация на позитивное мышление', NULL, NULL, 'practice', 'Свой формат', 'high', 'analyzed', 'manual'),
  ('Аффирмация на счастливую жизнь', NULL, NULL, 'practice', 'Свой формат', 'high', 'analyzed', 'manual'),
  ('Аффирмация на удачу и деньги', NULL, NULL, 'practice', 'Свой формат', 'high', 'analyzed', 'manual'),
  ('Медитация баланса', NULL, NULL, 'practice', 'Медитация', 'high', 'analyzed', 'manual'),
  ('Медитация благодарности перед сном', NULL, NULL, 'practice', 'Медитация', 'high', 'analyzed', 'manual'),
  ('Медитация на благополучие', NULL, NULL, 'practice', 'Медитация', 'high', 'analyzed', 'manual'),
  ('Медитация на богатство', NULL, NULL, 'practice', 'Медитация', 'high', 'analyzed', 'manual'),
  ('Медитация на деньги и денежный поток', NULL, NULL, 'practice', 'Медитация', 'high', 'analyzed', 'manual'),
  ('Медитация на любовь и счастливые отношения', NULL, NULL, 'practice', 'Медитация', 'high', 'analyzed', 'manual'),
  ('Медитация на очищение', NULL, NULL, 'practice', 'Медитация', 'high', 'analyzed', 'manual'),
  ('Медитация на привлечение любви', NULL, NULL, 'practice', 'Медитация', 'high', 'analyzed', 'manual'),
  ('Медитация на привлечение счастливых событий', NULL, NULL, 'practice', 'Медитация', 'high', 'analyzed', 'manual'),
  ('Медитация на счастливые отношения', NULL, NULL, 'practice', 'Медитация', 'high', 'analyzed', 'manual'),
  ('Медитация на уверенность в себе', NULL, NULL, 'practice', 'Медитация', 'high', 'analyzed', 'manual'),
  ('Медитация на удачу', NULL, NULL, 'practice', 'Медитация', 'high', 'analyzed', 'manual'),
  ('Медитация на удачу и успех', NULL, NULL, 'practice', 'Медитация', 'high', 'analyzed', 'manual'),
  ('Медитация на успех и благополучие', NULL, NULL, 'practice', 'Медитация', 'high', 'analyzed', 'manual'),
  ('Медитация на успех и деньги', NULL, NULL, 'practice', 'Медитация', 'high', 'analyzed', 'manual'),
  ('Медитация на хороший день', NULL, NULL, 'practice', 'Медитация', 'high', 'analyzed', 'manual'),
  ('Медитация перед сном для женщин', NULL, NULL, 'practice', 'Медитация', 'high', 'analyzed', 'manual'),
  ('Медитация привлечения счастливых отношений', NULL, NULL, 'practice', 'Медитация', 'high', 'analyzed', 'manual'),
  ('Медитация пробуждения', NULL, NULL, 'practice', 'Медитация', 'high', 'analyzed', 'manual'),
  ('Медитация процветания', NULL, NULL, 'practice', 'Медитация', 'high', 'analyzed', 'manual'),
  ('Наполнение женщины медитация', NULL, NULL, 'practice', 'Медитация', 'high', 'analyzed', 'manual'),
  ('Очищающая медитация', NULL, NULL, 'practice', 'Медитация', 'high', 'analyzed', 'manual'),
  ('Позитивные аффирмации для женщины', NULL, NULL, 'practice', 'Свой формат', 'high', 'analyzed', 'manual'),
  ('Утренняя аффирмация на день', NULL, NULL, 'practice', 'Свой формат', 'high', 'analyzed', 'manual'),
  ('Утренняя медитация на день', NULL, NULL, 'practice', 'Медитация', 'high', 'analyzed', 'manual'),
  ('Утренняя медитация наполнения', NULL, NULL, 'practice', 'Медитация', 'high', 'analyzed', 'manual'),
  ('Хорошая осенняя музыка', NULL, NULL, 'music', 'Музыка', 'high', 'not_analyzed', 'manual'),
  ('Русская осенняя музыка', NULL, NULL, 'music', 'Музыка', 'high', 'not_analyzed', 'manual'),
  ('Музыка осеннего саксофона', NULL, NULL, 'music', 'Музыка', 'high', 'not_analyzed', 'manual'),
  ('Осенняя музыка релакс', NULL, NULL, 'music', 'Музыка', 'high', 'not_analyzed', 'manual'),
  ('Уютная музыка для сна', NULL, NULL, 'music', 'Музыка', 'high', 'not_analyzed', 'manual'),
  ('Уютная музыка для сна и релакса', NULL, NULL, 'music', 'Музыка', 'high', 'not_analyzed', 'manual'),
  ('Спокойная музыка для чтения стихов', NULL, NULL, 'music', 'Музыка', 'high', 'not_analyzed', 'manual'),
  ('Музыка для чтения сказки', NULL, NULL, 'music', 'Музыка', 'high', 'not_analyzed', 'manual'),
  ('Музыка для чтения для детей', NULL, NULL, 'music', 'Музыка', 'high', 'not_analyzed', 'manual'),
  ('Спокойная музыка для работы онлайн', NULL, NULL, 'music', 'Музыка', 'high', 'not_analyzed', 'manual'),
  ('Спокойная расслабленная музыка для работы', NULL, NULL, 'music', 'Музыка', 'high', 'not_analyzed', 'manual'),
  ('Фоновая музыка для кофеен', NULL, NULL, 'music', 'Музыка', 'high', 'not_analyzed', 'manual'),
  ('Релакс музыка для салона красоты', NULL, NULL, 'music', 'Музыка', 'high', 'not_analyzed', 'manual'),
  ('Хорошая музыка для салона красоты', NULL, NULL, 'music', 'Музыка', 'high', 'not_analyzed', 'manual'),
  ('Музыка для медитации и массажа', NULL, NULL, 'music', 'Музыка', 'high', 'not_analyzed', 'manual'),
  ('Музыка для тайского массажа', NULL, NULL, 'music', 'Музыка', 'high', 'not_analyzed', 'manual'),
  ('Китайская музыка для массажа', NULL, NULL, 'music', 'Музыка', 'high', 'not_analyzed', 'manual'),
  ('Музыка для салона массажа', NULL, NULL, 'music', 'Музыка', 'high', 'not_analyzed', 'manual'),
  ('Музыка для тантрического массажа', NULL, NULL, 'music', 'Музыка', 'high', 'not_analyzed', 'manual'),
  ('Музыка для секса и массажа', NULL, NULL, 'music', 'Музыка', 'high', 'not_analyzed', 'manual'),
  ('Музыка для массажа лица', NULL, NULL, 'music', 'Музыка', 'high', 'not_analyzed', 'manual'),
  ('Музыка для массажа детей', NULL, NULL, 'music', 'Музыка', 'high', 'not_analyzed', 'manual'),
  ('Релакс музыка для успокоения нервов', NULL, NULL, 'music', 'Музыка', 'high', 'not_analyzed', 'manual'),
  ('Релакс музыка для успокоения души', NULL, NULL, 'music', 'Музыка', 'high', 'not_analyzed', 'manual'),
  ('Релакс музыка для снятия стресса', NULL, NULL, 'music', 'Музыка', 'high', 'not_analyzed', 'manual'),
  ('Музыка для бани релакс', NULL, NULL, 'music', 'Музыка', 'high', 'not_analyzed', 'manual'),
  ('Релакс музыка для ванн', NULL, NULL, 'music', 'Музыка', 'high', 'not_analyzed', 'manual'),
  ('Релакс музыка для спа салонов', NULL, NULL, 'music', 'Музыка', 'high', 'not_analyzed', 'manual'),
  ('Музыка для сауны релакс', NULL, NULL, 'music', 'Музыка', 'high', 'not_analyzed', 'manual'),
  ('Музыка для сауны и бани релакс', NULL, NULL, 'music', 'Музыка', 'high', 'not_analyzed', 'manual'),
  ('Релакс музыка для фона', NULL, NULL, 'music', 'Музыка', 'high', 'not_analyzed', 'manual'),
  ('Музыка для полного релакса', NULL, NULL, 'music', 'Музыка', 'high', 'not_analyzed', 'manual'),
  ('Успокаивающая музыка релакс для малышей', NULL, NULL, 'music', 'Музыка', 'high', 'not_analyzed', 'manual'),
  ('Нежная музыка для глубокого релакса', NULL, NULL, 'music', 'Музыка', 'high', 'not_analyzed', 'manual'),
  ('Релакс музыка для офиса', NULL, NULL, 'music', 'Музыка', 'high', 'not_analyzed', 'manual'),
  ('Музыка релакс для детского сна', NULL, NULL, 'music', 'Музыка', 'high', 'not_analyzed', 'manual'),
  ('Музыка для релакса в ванной', NULL, NULL, 'music', 'Музыка', 'high', 'not_analyzed', 'manual'),
  ('Музыка для релакса женщины', NULL, NULL, 'music', 'Музыка', 'high', 'not_analyzed', 'manual'),
  ('Музыка релакс для аквариума', NULL, NULL, 'music', 'Музыка', 'high', 'not_analyzed', 'manual'),
  ('Музыка релакс успокаивающая для медитации', NULL, NULL, 'music', 'Музыка', 'high', 'not_analyzed', 'manual'),
  ('Музыка релакс для машины', NULL, NULL, 'music', 'Музыка', 'high', 'not_analyzed', 'manual'),
  ('Музыка для релакса перед сном', NULL, NULL, 'music', 'Музыка', 'high', 'not_analyzed', 'manual'),
  ('Музыка для глубокой медитации', NULL, NULL, 'music', 'Музыка', 'high', 'not_analyzed', 'manual'),
  ('Медитация восстановление нервной системы', NULL, NULL, 'practice', 'Медитация', 'high', 'not_analyzed', 'manual'),
  ('Медитация на бывшего', NULL, NULL, 'practice', 'Медитация', 'high', 'not_analyzed', 'manual'),
  ('Медитация от головной боли', NULL, NULL, 'practice', 'Медитация', 'high', 'not_analyzed', 'manual'),
  ('Медитация от бессонницы', NULL, NULL, 'practice', 'Медитация', 'high', 'not_analyzed', 'manual'),
  ('Медитация на исцеление и оздоровление', NULL, NULL, 'practice', 'Медитация', 'high', 'not_analyzed', 'manual'),
  ('Медитация на омоложение', NULL, NULL, 'practice', 'Медитация', 'high', 'not_analyzed', 'manual'),
  ('Медитация от тревоги и стресса', NULL, NULL, 'practice', 'Медитация', 'high', 'not_analyzed', 'manual'),
  ('Медитация исцеления нервной системы и психики', NULL, NULL, 'practice', 'Медитация', 'high', 'not_analyzed', 'manual'),
  ('Медитация погружение в глубокой сон', NULL, NULL, 'practice', 'Медитация', 'high', 'not_analyzed', 'manual'),
  ('Медитация от страха и тревоги', NULL, NULL, 'practice', 'Медитация', 'high', 'not_analyzed', 'manual'),
  ('Медитация любимый мужчина', NULL, NULL, 'practice', 'Медитация', 'high', 'not_analyzed', 'manual'),
  ('Медитации для женщин для хорошего сна', NULL, NULL, 'practice', 'Медитация', 'high', 'not_analyzed', 'manual'),
  ('Медитация благодарности и любви', NULL, NULL, 'practice', 'Медитация', 'high', 'not_analyzed', 'manual'),
  ('Медитация утром для женщин', NULL, NULL, 'practice', 'Медитация', 'high', 'not_analyzed', 'manual'),
  ('Медитация перед сном для успокоения нервной системы', NULL, NULL, 'practice', 'Медитация', 'high', 'not_analyzed', 'manual'),
  ('Медитация для глубокого успокоения', NULL, NULL, 'practice', 'Медитация', 'high', 'not_analyzed', 'manual'),
  ('Медитация женская сила', NULL, NULL, 'practice', 'Медитация', 'high', 'not_analyzed', 'manual'),
  ('Медитация на изобилие и процветание', NULL, NULL, 'practice', 'Медитация', 'high', 'not_analyzed', 'manual'),
  ('Медитация кармы', NULL, NULL, 'practice', 'Медитация', 'high', 'not_analyzed', 'manual'),
  ('Медитация на принятие себя', NULL, NULL, 'practice', 'Медитация', 'high', 'not_analyzed', 'manual'),
  ('Медитация на будущее', NULL, NULL, 'practice', 'Медитация', 'high', 'not_analyzed', 'manual'),
  ('Медитация для уверенности для женщин', NULL, NULL, 'practice', 'Медитация', 'high', 'not_analyzed', 'manual'),
  ('Финансовая медитация', NULL, NULL, 'practice', 'Медитация', 'high', 'not_analyzed', 'manual'),
  ('Медитация на замужество', NULL, NULL, 'practice', 'Медитация', 'high', 'not_analyzed', 'manual'),
  ('Медитация успеха и изобилия', NULL, NULL, 'practice', 'Медитация', 'high', 'not_analyzed', 'manual'),
  ('Аффирмации благодарности дню', NULL, NULL, 'practice', 'Свой формат', 'high', 'not_analyzed', 'manual'),
  ('Аффирмации на квартиру', NULL, NULL, 'practice', 'Свой формат', 'high', 'not_analyzed', 'manual'),
  ('Аффирмацию на поиск работы', NULL, NULL, 'practice', 'Свой формат', 'high', 'not_analyzed', 'manual'),
  ('Аффирмации на стройность', NULL, NULL, 'practice', 'Свой формат', 'high', 'not_analyzed', 'manual'),
  ('Аффирмации на сдачу', NULL, NULL, 'practice', 'Свой формат', 'high', 'not_analyzed', 'manual'),
  ('Аффирмации для повышения уверенности', NULL, NULL, 'practice', 'Свой формат', 'high', 'not_analyzed', 'manual'),
  ('Аффирмации богатства и процветания', NULL, NULL, 'practice', 'Свой формат', 'high', 'not_analyzed', 'manual'),
  ('Утренняя аффирмация на хороший день', NULL, NULL, 'practice', 'Свой формат', 'high', 'not_analyzed', 'manual'),
  ('Аффирмации для поднятия самооценки', NULL, NULL, 'practice', 'Свой формат', 'high', 'not_analyzed', 'manual'),
  ('Аффирмация для хорошего начала дня', NULL, NULL, 'practice', 'Свой формат', 'high', 'not_analyzed', 'manual'),
  ('Аффирмации для бизнеса', NULL, NULL, 'practice', 'Свой формат', 'high', 'not_analyzed', 'manual'),
  ('Аффирмация на любимого мужчину', NULL, NULL, 'practice', 'Свой формат', 'high', 'not_analyzed', 'manual'),
  ('Аффирмация на денежное богатство', NULL, NULL, 'practice', 'Свой формат', 'high', 'not_analyzed', 'manual'),
  ('Аффирмации на счастливые отношения', NULL, NULL, 'practice', 'Свой формат', 'high', 'not_analyzed', 'manual'),
  ('Аффирмация на энергию и силу', NULL, NULL, 'practice', 'Свой формат', 'high', 'not_analyzed', 'manual'),
  ('Аффирмация на достойного мужчину', NULL, NULL, 'practice', 'Свой формат', 'high', 'not_analyzed', 'manual'),
  ('Аффирмации на счастливое замужество', NULL, NULL, 'practice', 'Свой формат', 'high', 'not_analyzed', 'manual'),
  ('Аффирмации на самооценку и уверенность', NULL, NULL, 'practice', 'Свой формат', 'high', 'not_analyzed', 'manual'),
  ('Аффирмации на хорошую работу', NULL, NULL, 'practice', 'Свой формат', 'high', 'not_analyzed', 'manual'),
  ('Аффирмации на радость', NULL, NULL, 'practice', 'Свой формат', 'high', 'not_analyzed', 'manual'),
  ('Аффирмация для женщин на удачу', NULL, NULL, 'practice', 'Свой формат', 'high', 'not_analyzed', 'manual'),
  ('Аффирмация на здоровье и успех', NULL, NULL, 'practice', 'Свой формат', 'high', 'not_analyzed', 'manual'),
  ('Аффирмации на любовь и изобилие', NULL, NULL, 'practice', 'Свой формат', 'high', 'not_analyzed', 'manual'),
  ('Аффирмация на новую работу', NULL, NULL, 'practice', 'Свой формат', 'high', 'not_analyzed', 'manual'),
  ('Аффирмация на привлечение отношений', NULL, NULL, 'practice', 'Свой формат', 'high', 'not_analyzed', 'manual'),
  ('Аффирмации на принятие и любовь к себе', NULL, NULL, 'practice', 'Свой формат', 'high', 'not_analyzed', 'manual'),
  ('Аффирмации счастья и здоровья', NULL, NULL, 'practice', 'Свой формат', 'high', 'not_analyzed', 'manual'),
  ('Аффирмации на хорошую жизнь', NULL, NULL, 'practice', 'Свой формат', 'high', 'not_analyzed', 'manual'),
  ('Аффирмация на привлечение счастливых отношений', NULL, NULL, 'practice', 'Свой формат', 'high', 'not_analyzed', 'manual'),
  ('Аффирмации на взаимную любовь', NULL, NULL, 'practice', 'Свой формат', 'high', 'not_analyzed', 'manual'),
  ('Аффирмация на привлечение клиентов в бизнесе', NULL, NULL, 'practice', 'Свой формат', 'high', 'not_analyzed', 'manual')
ON CONFLICT (normalized_query) DO UPDATE SET
  intent = COALESCE(public.seo_queries.intent, EXCLUDED.intent),
  recommended_format = COALESCE(public.seo_queries.recommended_format, EXCLUDED.recommended_format),
  audio_fit = COALESCE(public.seo_queries.audio_fit, EXCLUDED.audio_fit),
  analysis_status = CASE
    WHEN EXCLUDED.analysis_status = 'analyzed' THEN 'analyzed'
    ELSE public.seo_queries.analysis_status
  END;

WITH sprint AS (
  SELECT id FROM public.seo_sprints WHERE slug = 'osen-zvuchit-2026'
),
seed(display_title, author_group, pool) AS (
  VALUES
  ('Босса нова музыка для кофейни', 'music', 'initial'),
  ('Волшебная осенняя музыка', 'music', 'initial'),
  ('Грустная осенняя музыка', 'music', 'initial'),
  ('Детская осенняя музыка без слов', 'music', 'initial'),
  ('Джазовая музыка для кофеен', 'music', 'initial'),
  ('Звук дождя для глубокого сна', 'music', 'initial'),
  ('Звук дождя для сна и отдыха', 'music', 'initial'),
  ('Звуки осеннего леса', 'music', 'initial'),
  ('Китайская музыка для релакса', 'music', 'initial'),
  ('Красивая музыка для массажа', 'music', 'initial'),
  ('Красивая музыка для релакса и отдыха', 'music', 'initial'),
  ('Легкая музыка для релакса', 'music', 'initial'),
  ('Музыка для занятий творчеством', 'music', 'initial'),
  ('Музыка для кофейни джаз', 'music', 'initial'),
  ('Музыка для массажа и расслабления', 'music', 'initial'),
  ('Музыка для массажа и спа', 'music', 'initial'),
  ('Музыка для осенней прогулки', 'music', 'initial'),
  ('Музыка для осенней ярмарки', 'music', 'initial'),
  ('Музыка для релакса джаз', 'music', 'initial'),
  ('Музыка для релакса осень', 'music', 'initial'),
  ('Музыка для релакса пианино', 'music', 'initial'),
  ('Музыка для релакса саксофон', 'music', 'initial'),
  ('Музыка для уютного вечера', 'music', 'initial'),
  ('Музыка осеннего утра', 'music', 'initial'),
  ('Музыка осенней природы', 'music', 'initial'),
  ('Музыка релакс для йоги', 'music', 'initial'),
  ('Музыка релакс для медитации', 'music', 'initial'),
  ('Музыка релакс для работы', 'music', 'initial'),
  ('Музыка релакс для рисования', 'music', 'initial'),
  ('Мягкий звук дождя для сна', 'music', 'initial'),
  ('Осенний джаз музыка для отдыха', 'music', 'initial'),
  ('Осенняя джазовая музыка', 'music', 'initial'),
  ('Осенняя музыка для души', 'music', 'initial'),
  ('Осенняя музыка для малышей', 'music', 'initial'),
  ('Осенняя музыка для сна', 'music', 'initial'),
  ('Осенняя музыка для творчества', 'music', 'initial'),
  ('Осенняя музыка для учебы', 'music', 'initial'),
  ('Осенняя уютная музыка', 'music', 'initial'),
  ('Расслабляющая музыка для релакса', 'music', 'initial'),
  ('Расслабляющая музыка для чтения', 'music', 'initial'),
  ('Релакс музыка для отдыха', 'music', 'initial'),
  ('Релакс музыка для хорошего сна', 'music', 'initial'),
  ('Спокойная музыка для кофейни', 'music', 'initial'),
  ('Спокойная музыка для работы в офисе', 'music', 'initial'),
  ('Спокойная музыка для работы и учебы', 'music', 'initial'),
  ('Спокойная музыка для чтения книг', 'music', 'initial'),
  ('Спокойная уютная музыка', 'music', 'initial'),
  ('Спокойная фоновая музыка для чтения', 'music', 'initial'),
  ('Теплая уютная музыка', 'music', 'initial'),
  ('Уютная джазовая музыка', 'music', 'initial'),
  ('Уютная музыка для дома', 'music', 'initial'),
  ('Уютная музыка для работы', 'music', 'initial'),
  ('Уютная музыка для учебы', 'music', 'initial'),
  ('Уютная музыка кофейни', 'music', 'initial'),
  ('Фоновая музыка для кофейни', 'music', 'initial'),
  ('Фоновая музыка для творчества', 'music', 'initial'),
  ('Аффирмации на благополучие', 'voice', 'initial'),
  ('Аффирмации на деньги и изобилие', 'voice', 'initial'),
  ('Аффирмации на женскую привлекательность', 'voice', 'initial'),
  ('Аффирмации на исполнение желаний', 'voice', 'initial'),
  ('Аффирмации на привлекательность', 'voice', 'initial'),
  ('Аффирмации на привлечение мужчины', 'voice', 'initial'),
  ('Аффирмации на самооценку', 'voice', 'initial'),
  ('Аффирмации на счастливую любовь', 'voice', 'initial'),
  ('Аффирмации на счастливый день', 'voice', 'initial'),
  ('Аффирмации на уверенность в себе для женщины', 'voice', 'initial'),
  ('Аффирмации на удачу и богатство', 'voice', 'initial'),
  ('Аффирмации на удачу и везение', 'voice', 'initial'),
  ('Аффирмации на учебу', 'voice', 'initial'),
  ('Аффирмация на желание', 'voice', 'initial'),
  ('Аффирмация на отношения с мужчиной', 'voice', 'initial'),
  ('Аффирмация на позитивное мышление', 'voice', 'initial'),
  ('Аффирмация на счастливую жизнь', 'voice', 'initial'),
  ('Аффирмация на удачу и деньги', 'voice', 'initial'),
  ('Медитация баланса', 'voice', 'initial'),
  ('Медитация благодарности перед сном', 'voice', 'initial'),
  ('Медитация на благополучие', 'voice', 'initial'),
  ('Медитация на богатство', 'voice', 'initial'),
  ('Медитация на деньги и денежный поток', 'voice', 'initial'),
  ('Медитация на любовь и счастливые отношения', 'voice', 'initial'),
  ('Медитация на очищение', 'voice', 'initial'),
  ('Медитация на привлечение любви', 'voice', 'initial'),
  ('Медитация на привлечение счастливых событий', 'voice', 'initial'),
  ('Медитация на счастливые отношения', 'voice', 'initial'),
  ('Медитация на уверенность в себе', 'voice', 'initial'),
  ('Медитация на удачу', 'voice', 'initial'),
  ('Медитация на удачу и успех', 'voice', 'initial'),
  ('Медитация на успех и благополучие', 'voice', 'initial'),
  ('Медитация на успех и деньги', 'voice', 'initial'),
  ('Медитация на хороший день', 'voice', 'initial'),
  ('Медитация перед сном для женщин', 'voice', 'initial'),
  ('Медитация привлечения счастливых отношений', 'voice', 'initial'),
  ('Медитация пробуждения', 'voice', 'initial'),
  ('Медитация процветания', 'voice', 'initial'),
  ('Наполнение женщины медитация', 'voice', 'initial'),
  ('Очищающая медитация', 'voice', 'initial'),
  ('Позитивные аффирмации для женщины', 'voice', 'initial'),
  ('Утренняя аффирмация на день', 'voice', 'initial'),
  ('Утренняя медитация на день', 'voice', 'initial'),
  ('Утренняя медитация наполнения', 'voice', 'initial'),
  ('Хорошая осенняя музыка', 'music', 'reserve'),
  ('Русская осенняя музыка', 'music', 'reserve'),
  ('Музыка осеннего саксофона', 'music', 'reserve'),
  ('Осенняя музыка релакс', 'music', 'reserve'),
  ('Уютная музыка для сна', 'music', 'reserve'),
  ('Уютная музыка для сна и релакса', 'music', 'reserve'),
  ('Спокойная музыка для чтения стихов', 'music', 'reserve'),
  ('Музыка для чтения сказки', 'music', 'reserve'),
  ('Музыка для чтения для детей', 'music', 'reserve'),
  ('Спокойная музыка для работы онлайн', 'music', 'reserve'),
  ('Спокойная расслабленная музыка для работы', 'music', 'reserve'),
  ('Фоновая музыка для кофеен', 'music', 'reserve'),
  ('Релакс музыка для салона красоты', 'music', 'reserve'),
  ('Хорошая музыка для салона красоты', 'music', 'reserve'),
  ('Музыка для медитации и массажа', 'music', 'reserve'),
  ('Музыка для тайского массажа', 'music', 'reserve'),
  ('Китайская музыка для массажа', 'music', 'reserve'),
  ('Музыка для салона массажа', 'music', 'reserve'),
  ('Музыка для тантрического массажа', 'music', 'reserve'),
  ('Музыка для секса и массажа', 'music', 'reserve'),
  ('Музыка для массажа лица', 'music', 'reserve'),
  ('Музыка для массажа детей', 'music', 'reserve'),
  ('Релакс музыка для успокоения нервов', 'music', 'reserve'),
  ('Релакс музыка для успокоения души', 'music', 'reserve'),
  ('Релакс музыка для снятия стресса', 'music', 'reserve'),
  ('Музыка для бани релакс', 'music', 'reserve'),
  ('Релакс музыка для ванн', 'music', 'reserve'),
  ('Релакс музыка для спа салонов', 'music', 'reserve'),
  ('Музыка для сауны релакс', 'music', 'reserve'),
  ('Музыка для сауны и бани релакс', 'music', 'reserve'),
  ('Релакс музыка для фона', 'music', 'reserve'),
  ('Музыка для полного релакса', 'music', 'reserve'),
  ('Успокаивающая музыка релакс для малышей', 'music', 'reserve'),
  ('Нежная музыка для глубокого релакса', 'music', 'reserve'),
  ('Релакс музыка для офиса', 'music', 'reserve'),
  ('Музыка релакс для детского сна', 'music', 'reserve'),
  ('Музыка для релакса в ванной', 'music', 'reserve'),
  ('Музыка для релакса женщины', 'music', 'reserve'),
  ('Музыка релакс для аквариума', 'music', 'reserve'),
  ('Музыка релакс успокаивающая для медитации', 'music', 'reserve'),
  ('Музыка релакс для машины', 'music', 'reserve'),
  ('Музыка для релакса перед сном', 'music', 'reserve'),
  ('Музыка для глубокой медитации', 'music', 'reserve'),
  ('Медитация восстановление нервной системы', 'voice', 'reserve'),
  ('Медитация на бывшего', 'voice', 'reserve'),
  ('Медитация от головной боли', 'voice', 'reserve'),
  ('Медитация от бессонницы', 'voice', 'reserve'),
  ('Медитация на исцеление и оздоровление', 'voice', 'reserve'),
  ('Медитация на омоложение', 'voice', 'reserve'),
  ('Медитация от тревоги и стресса', 'voice', 'reserve'),
  ('Медитация исцеления нервной системы и психики', 'voice', 'reserve'),
  ('Медитация погружение в глубокой сон', 'voice', 'reserve'),
  ('Медитация от страха и тревоги', 'voice', 'reserve'),
  ('Медитация любимый мужчина', 'voice', 'reserve'),
  ('Медитации для женщин для хорошего сна', 'voice', 'reserve'),
  ('Медитация благодарности и любви', 'voice', 'reserve'),
  ('Медитация утром для женщин', 'voice', 'reserve'),
  ('Медитация перед сном для успокоения нервной системы', 'voice', 'reserve'),
  ('Медитация для глубокого успокоения', 'voice', 'reserve'),
  ('Медитация женская сила', 'voice', 'reserve'),
  ('Медитация на изобилие и процветание', 'voice', 'reserve'),
  ('Медитация кармы', 'voice', 'reserve'),
  ('Медитация на принятие себя', 'voice', 'reserve'),
  ('Медитация на будущее', 'voice', 'reserve'),
  ('Медитация для уверенности для женщин', 'voice', 'reserve'),
  ('Финансовая медитация', 'voice', 'reserve'),
  ('Медитация на замужество', 'voice', 'reserve'),
  ('Медитация успеха и изобилия', 'voice', 'reserve'),
  ('Аффирмации благодарности дню', 'voice', 'reserve'),
  ('Аффирмации на квартиру', 'voice', 'reserve'),
  ('Аффирмацию на поиск работы', 'voice', 'reserve'),
  ('Аффирмации на стройность', 'voice', 'reserve'),
  ('Аффирмации на сдачу', 'voice', 'reserve'),
  ('Аффирмации для повышения уверенности', 'voice', 'reserve'),
  ('Аффирмации богатства и процветания', 'voice', 'reserve'),
  ('Утренняя аффирмация на хороший день', 'voice', 'reserve'),
  ('Аффирмации для поднятия самооценки', 'voice', 'reserve'),
  ('Аффирмация для хорошего начала дня', 'voice', 'reserve'),
  ('Аффирмации для бизнеса', 'voice', 'reserve'),
  ('Аффирмация на любимого мужчину', 'voice', 'reserve'),
  ('Аффирмация на денежное богатство', 'voice', 'reserve'),
  ('Аффирмации на счастливые отношения', 'voice', 'reserve'),
  ('Аффирмация на энергию и силу', 'voice', 'reserve'),
  ('Аффирмация на достойного мужчину', 'voice', 'reserve'),
  ('Аффирмации на счастливое замужество', 'voice', 'reserve'),
  ('Аффирмации на самооценку и уверенность', 'voice', 'reserve'),
  ('Аффирмации на хорошую работу', 'voice', 'reserve'),
  ('Аффирмации на радость', 'voice', 'reserve'),
  ('Аффирмация для женщин на удачу', 'voice', 'reserve'),
  ('Аффирмация на здоровье и успех', 'voice', 'reserve'),
  ('Аффирмации на любовь и изобилие', 'voice', 'reserve'),
  ('Аффирмация на новую работу', 'voice', 'reserve'),
  ('Аффирмация на привлечение отношений', 'voice', 'reserve'),
  ('Аффирмации на принятие и любовь к себе', 'voice', 'reserve'),
  ('Аффирмации счастья и здоровья', 'voice', 'reserve'),
  ('Аффирмации на хорошую жизнь', 'voice', 'reserve'),
  ('Аффирмация на привлечение счастливых отношений', 'voice', 'reserve'),
  ('Аффирмации на взаимную любовь', 'voice', 'reserve'),
  ('Аффирмация на привлечение клиентов в бизнесе', 'voice', 'reserve')
)
INSERT INTO public.seo_sprint_queries (
  sprint_id,
  query_id,
  display_title,
  author_group,
  pool
)
SELECT
  sprint.id,
  query_row.id,
  seed.display_title,
  seed.author_group,
  seed.pool
FROM seed
CROSS JOIN sprint
JOIN public.seo_queries AS query_row
  ON query_row.normalized_query = public.normalize_seo_query(seed.display_title)
ON CONFLICT (sprint_id, query_id) DO UPDATE SET
  display_title = EXCLUDED.display_title,
  author_group = EXCLUDED.author_group,
  pool = EXCLUDED.pool;

DO $$
DECLARE
  v_sprint_id uuid;
  v_total integer;
  v_initial integer;
  v_reserve integer;
  v_initial_music integer;
  v_initial_voice integer;
  v_reserve_music integer;
  v_reserve_voice integer;
BEGIN
  SELECT id INTO v_sprint_id
  FROM public.seo_sprints
  WHERE slug = 'osen-zvuchit-2026';

  SELECT count(*) INTO v_total
  FROM public.seo_sprint_queries
  WHERE sprint_id = v_sprint_id;

  SELECT
    count(*) FILTER (WHERE pool = 'initial'),
    count(*) FILTER (WHERE pool = 'reserve'),
    count(*) FILTER (WHERE pool = 'initial' AND author_group = 'music'),
    count(*) FILTER (WHERE pool = 'initial' AND author_group = 'voice'),
    count(*) FILTER (WHERE pool = 'reserve' AND author_group = 'music'),
    count(*) FILTER (WHERE pool = 'reserve' AND author_group = 'voice')
  INTO
    v_initial,
    v_reserve,
    v_initial_music,
    v_initial_voice,
    v_reserve_music,
    v_reserve_voice
  FROM public.seo_sprint_queries
  WHERE sprint_id = v_sprint_id;

  IF v_total <> 199
     OR v_initial <> 100
     OR v_reserve <> 99
     OR v_initial_music <> 56
     OR v_initial_voice <> 44
     OR v_reserve_music <> 43
     OR v_reserve_voice <> 56 THEN
    RAISE EXCEPTION
      'seo_sprint_autumn_seed_count_mismatch total=% initial=% reserve=% initial_music=% initial_voice=% reserve_music=% reserve_voice=%',
      v_total, v_initial, v_reserve, v_initial_music, v_initial_voice, v_reserve_music, v_reserve_voice;
  END IF;
END;
$$;

COMMIT;
