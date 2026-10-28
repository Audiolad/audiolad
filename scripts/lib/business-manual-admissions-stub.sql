CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN;
CREATE SCHEMA auth;
CREATE TABLE auth.users(id uuid PRIMARY KEY);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
 SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;
CREATE TABLE public.authors(id uuid PRIMARY KEY, name text NOT NULL);
CREATE TABLE public.practices(id uuid PRIMARY KEY, author_id uuid REFERENCES authors(id), title text,
 product_kind text NOT NULL DEFAULT 'music', status text DEFAULT 'published',
 catalog_visibility text DEFAULT 'listed', deleted_at timestamptz);
CREATE TABLE public.audio_items(id uuid PRIMARY KEY, practice_id uuid REFERENCES practices(id));
CREATE TABLE public.business_locations(id uuid PRIMARY KEY, business_category text);
CREATE TABLE public.business_track_eligibility_reviews(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), audio_item_id uuid,
 decision text, created_at timestamptz DEFAULT now());
CREATE TABLE public.test_rights(audio_item_id uuid PRIMARY KEY, valid_until timestamptz);
CREATE TABLE public.music_analyzer_runs(id uuid PRIMARY KEY, normalized_json jsonb);
CREATE FUNCTION public.has_platform_permission(p_user_id uuid, p_code text) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT coalesce(p_user_id = '00000000-0000-0000-0000-000000000001'::uuid, false);
$$;
CREATE FUNCTION public.resolve_business_track_eligibility_v1(
 p_audio_item_id uuid, p_location_id uuid, p_zone_id uuid DEFAULT NULL,
 p_use_type text DEFAULT 'business_background_playback', p_as_of timestamptz DEFAULT now()
) RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT jsonb_build_object('audio_item_id', p_audio_item_id, 'decision',
 CASE WHEN EXISTS (SELECT 1 FROM public.test_rights WHERE audio_item_id = p_audio_item_id AND valid_until > p_as_of)
 THEN 'ELIGIBLE' ELSE 'UNKNOWN' END, 'reason_codes', '[]'::jsonb);
$$;
GRANT USAGE ON SCHEMA public, auth TO authenticated, service_role, anon;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated, service_role, anon;

-- Supabase may pre-grant service_role via default privileges. Explicit revokes must win.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;
