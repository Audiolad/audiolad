BEGIN;

-- ---------------------------------------------------------------------------
-- Email foundation: contacts, consents, preferences, suppressions, outbox
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.email_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NULL REFERENCES auth.users (id) ON DELETE SET NULL,
  email text NOT NULL,
  normalized_email text NOT NULL,
  contact_type text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  source text NOT NULL,
  email_verified_at timestamptz NULL,
  is_suppressed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NULL,
  anonymized_at timestamptz NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,

  CONSTRAINT email_contacts_contact_type_check
    CHECK (contact_type IN ('registered_user', 'lead', 'author_applicant')),

  CONSTRAINT email_contacts_status_check
    CHECK (status IN ('active', 'unlinked', 'anonymized', 'merged')),

  CONSTRAINT email_contacts_email_not_empty_check
    CHECK (char_length(btrim(email)) > 0),

  CONSTRAINT email_contacts_normalized_email_not_empty_check
    CHECK (char_length(btrim(normalized_email)) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS email_contacts_active_normalized_email_uidx
  ON public.email_contacts (normalized_email)
  WHERE status = 'active';

CREATE UNIQUE INDEX IF NOT EXISTS email_contacts_active_user_id_uidx
  ON public.email_contacts (user_id)
  WHERE user_id IS NOT NULL AND status = 'active';

CREATE INDEX IF NOT EXISTS email_contacts_user_id_idx
  ON public.email_contacts (user_id);

COMMENT ON TABLE public.email_contacts IS
  'Normalized email contacts decoupled from auth.users for comms and consent history.';

-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.email_consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES public.email_contacts (id) ON DELETE CASCADE,
  user_id uuid NULL REFERENCES auth.users (id) ON DELETE SET NULL,
  purpose text NOT NULL,
  status text NOT NULL,
  legal_basis text NOT NULL,
  text_version text NOT NULL,
  source text NOT NULL,
  granted_at timestamptz NULL,
  revoked_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  ip_hash text NULL,
  user_agent_hash text NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,

  CONSTRAINT email_consents_purpose_check
    CHECK (
      purpose IN (
        'listener_marketing',
        'listener_recommendations',
        'author_education',
        'author_marketing',
        'product_updates',
        'platform_news'
      )
    ),

  CONSTRAINT email_consents_status_check
    CHECK (status IN ('granted', 'revoked')),

  CONSTRAINT email_consents_legal_basis_check
    CHECK (legal_basis IN ('consent', 'contract', 'legitimate_interest')),

  CONSTRAINT email_consents_granted_revoked_consistency_check
    CHECK (
      (status = 'granted' AND granted_at IS NOT NULL AND revoked_at IS NULL)
      OR (status = 'revoked' AND revoked_at IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS email_consents_contact_id_created_at_idx
  ON public.email_consents (contact_id, created_at DESC);

CREATE INDEX IF NOT EXISTS email_consents_user_id_idx
  ON public.email_consents (user_id);

CREATE UNIQUE INDEX IF NOT EXISTS email_consents_signup_listener_marketing_uidx
  ON public.email_consents (contact_id, purpose, text_version, source)
  WHERE purpose = 'listener_marketing'
    AND source = 'signup_checkbox'
    AND status = 'granted';

COMMENT ON TABLE public.email_consents IS
  'Append-only marketing/legal consent history; updates via new rows only.';

-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.email_preferences (
  contact_id uuid PRIMARY KEY REFERENCES public.email_contacts (id) ON DELETE CASCADE,
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users (id) ON DELETE CASCADE,
  service_notifications boolean NOT NULL DEFAULT true,
  listener_product_updates boolean NOT NULL DEFAULT false,
  listener_recommendations boolean NOT NULL DEFAULT false,
  platform_news boolean NOT NULL DEFAULT false,
  listener_marketing boolean NOT NULL DEFAULT false,
  author_operational boolean NOT NULL DEFAULT true,
  author_sales boolean NOT NULL DEFAULT true,
  author_product_status boolean NOT NULL DEFAULT true,
  author_education boolean NOT NULL DEFAULT false,
  author_marketing boolean NOT NULL DEFAULT false,
  digest_frequency text NOT NULL DEFAULT 'immediate',
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT email_preferences_digest_frequency_check
    CHECK (digest_frequency IN ('immediate', 'daily', 'weekly', 'off'))
);

COMMENT ON TABLE public.email_preferences IS
  'Current email notification toggles; marketing flags require active consent.';

-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.email_suppressions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  normalized_email text NOT NULL,
  reason text NOT NULL,
  scope text NOT NULL,
  source text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,

  CONSTRAINT email_suppressions_reason_check
    CHECK (
      reason IN (
        'unsubscribe',
        'hard_bounce',
        'spam_complaint',
        'admin_block',
        'invalid_email',
        'user_deleted'
      )
    ),

  CONSTRAINT email_suppressions_scope_check
    CHECK (scope IN ('marketing', 'author_marketing', 'all_non_critical', 'all'))
);

CREATE UNIQUE INDEX IF NOT EXISTS email_suppressions_active_uidx
  ON public.email_suppressions (normalized_email, scope, reason)
  WHERE expires_at IS NULL;

CREATE INDEX IF NOT EXISTS email_suppressions_normalized_email_idx
  ON public.email_suppressions (normalized_email);

COMMENT ON TABLE public.email_suppressions IS
  'Delivery suppression list; service-managed except future user unsubscribe RPC.';

-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.email_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_type text NOT NULL,
  contact_id uuid NULL REFERENCES public.email_contacts (id) ON DELETE SET NULL,
  user_id uuid NULL REFERENCES auth.users (id) ON DELETE SET NULL,
  to_email text NOT NULL,
  template_key text NOT NULL,
  template_version text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending',
  priority smallint NOT NULL DEFAULT 100,
  attempt_count integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 5,
  scheduled_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz NULL,
  sent_at timestamptz NULL,
  failed_at timestamptz NULL,
  provider_message_id text NULL,
  last_error_code text NULL,
  last_error_message text NULL,
  deduplication_key text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT email_outbox_status_check
    CHECK (
      status IN (
        'pending',
        'processing',
        'sent',
        'failed',
        'cancelled',
        'suppressed'
      )
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS email_outbox_deduplication_active_uidx
  ON public.email_outbox (deduplication_key)
  WHERE deduplication_key IS NOT NULL
    AND status IN ('pending', 'processing');

CREATE INDEX IF NOT EXISTS email_outbox_status_scheduled_idx
  ON public.email_outbox (status, scheduled_at);

COMMENT ON TABLE public.email_outbox IS
  'Application email queue foundation; worker not connected in MVP.';

-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.email_delivery_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  outbox_id uuid NOT NULL REFERENCES public.email_outbox (id) ON DELETE CASCADE,
  event_type text NOT NULL,
  provider text NULL,
  provider_message_id text NULL,
  event_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT email_delivery_events_event_type_check
    CHECK (
      event_type IN (
        'queued',
        'accepted',
        'sent',
        'delivered',
        'deferred',
        'bounced',
        'complained',
        'opened',
        'clicked',
        'unsubscribed',
        'failed'
      )
    )
);

CREATE INDEX IF NOT EXISTS email_delivery_events_outbox_id_idx
  ON public.email_delivery_events (outbox_id, created_at DESC);

COMMENT ON TABLE public.email_delivery_events IS
  'Append-only delivery telemetry for application outbox.';

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

ALTER TABLE public.email_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_suppressions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_delivery_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS email_contacts_select_own ON public.email_contacts;
CREATE POLICY email_contacts_select_own
  ON public.email_contacts
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS email_consents_select_own ON public.email_consents;
CREATE POLICY email_consents_select_own
  ON public.email_consents
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS email_preferences_select_own ON public.email_preferences;
CREATE POLICY email_preferences_select_own
  ON public.email_preferences
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS email_preferences_update_own ON public.email_preferences;
CREATE POLICY email_preferences_update_own
  ON public.email_preferences
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

REVOKE ALL ON TABLE public.email_contacts FROM PUBLIC;
REVOKE ALL ON TABLE public.email_consents FROM PUBLIC;
REVOKE ALL ON TABLE public.email_preferences FROM PUBLIC;
REVOKE ALL ON TABLE public.email_suppressions FROM PUBLIC;
REVOKE ALL ON TABLE public.email_outbox FROM PUBLIC;
REVOKE ALL ON TABLE public.email_delivery_events FROM PUBLIC;

GRANT SELECT ON TABLE public.email_contacts TO authenticated;
GRANT SELECT ON TABLE public.email_consents TO authenticated;
GRANT SELECT, UPDATE ON TABLE public.email_preferences TO authenticated;

GRANT ALL ON TABLE public.email_contacts TO service_role;
GRANT ALL ON TABLE public.email_consents TO service_role;
GRANT ALL ON TABLE public.email_preferences TO service_role;
GRANT ALL ON TABLE public.email_suppressions TO service_role;
GRANT ALL ON TABLE public.email_outbox TO service_role;
GRANT ALL ON TABLE public.email_delivery_events TO service_role;

COMMIT;
