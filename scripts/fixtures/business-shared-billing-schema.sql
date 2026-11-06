-- Minimal throwaway dependencies for the real shared billing functions, not production schema.
ALTER TABLE auth.users ADD COLUMN email text;
ALTER TABLE orders ADD COLUMN practice_id uuid, ADD COLUMN amount_minor bigint, ADD COLUMN currency text DEFAULT 'RUB',
 ADD COLUMN practice_title_snapshot text, ADD COLUMN practice_slug_snapshot text, ADD COLUMN price_minor_snapshot bigint,
 ADD COLUMN base_price_minor_snapshot bigint, ADD COLUMN author_id_snapshot uuid, ADD COLUMN idempotency_key text UNIQUE,
 ADD COLUMN target_access_level integer, ADD COLUMN created_at timestamptz DEFAULT clock_timestamp(),
 ADD COLUMN paid_at timestamptz, ADD COLUMN is_test boolean DEFAULT false;
CREATE UNIQUE INDEX orders_one_pending_business_subscription_per_user_idx ON orders(user_id) WHERE status='pending' AND order_kind='business_subscription';
ALTER TABLE business_subscription_periods ADD COLUMN email_hash text, ADD COLUMN kind text,
 ADD COLUMN period_start timestamptz, ADD COLUMN applied_at timestamptz;
ALTER TABLE business_subscription_periods ADD CONSTRAINT business_subscription_periods_amount_check CHECK(amount_minor=79900);
CREATE TABLE payments(id uuid DEFAULT gen_random_uuid(), order_id uuid, provider text DEFAULT 'tochka', status text,
 amount_minor bigint, currency text DEFAULT 'RUB', confirmed_at timestamptz, created_at timestamptz DEFAULT clock_timestamp(), is_test boolean DEFAULT false);
CREATE TABLE business_offer_acceptances(user_id uuid);
CREATE FUNCTION business_consent_caller_in_support_mode() RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
CREATE TABLE access_grants(email_hash text, user_id uuid, kind text, starts_at timestamptz, ends_at timestamptz);
CREATE FUNCTION business_subscription_email_hash(text) RETURNS text LANGUAGE sql AS $$ SELECT CASE WHEN $1 IS NULL THEN NULL ELSE encode(sha256(convert_to(lower(trim($1)),'utf8')),'hex') END $$;
CREATE FUNCTION resolve_access_grant(text,uuid,text) RETURNS SETOF access_grants LANGUAGE sql AS $$ SELECT * FROM access_grants WHERE (email_hash=$1 OR user_id=$2) AND kind=$3 $$;
CREATE TABLE access_paid_periods(email_hash text, user_id uuid, kind text, paid_until timestamptz, updated_at timestamptz, UNIQUE(email_hash,kind));
CREATE UNIQUE INDEX access_paid_periods_guest ON access_paid_periods(user_id,kind) WHERE email_hash IS NULL;
CREATE TABLE access_grant_events(email_hash text, user_id uuid, kind text, event_name text, occurred_at timestamptz);
