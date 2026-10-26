BEGIN;

-- d60213c5: enqueue in the approval transaction; workers see committed rows only.
-- Additive: existing moderation RPC, evidence checks, data and RLS are untouched.
-- The permanent unique email_outbox dedup index is provided by 20261219120000.
CREATE FUNCTION public.enqueue_business_catalog_approved_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_email text;
BEGIN
  SELECT lower(btrim(email)) INTO v_email FROM auth.users WHERE id = NEW.owner_user_id;
  IF coalesce(v_email, '') = '' THEN
    -- Fail closed rather than silently committing an approval without a notification.
    RAISE EXCEPTION 'business_catalog_approved_account_email_missing';
  END IF;

  INSERT INTO public.email_outbox (
    message_type, user_id, to_email, template_key, template_version, payload,
    deduplication_key
  ) VALUES (
    'author_operational', NEW.owner_user_id, v_email,
    'business_catalog_approved', 'business-catalog-approved-v1',
    jsonb_build_object('senderIdentity', 'authors', 'verificationId', NEW.id),
    'business-catalog-approved:' || NEW.id::text
  ) ON CONFLICT (deduplication_key) WHERE deduplication_key IS NOT NULL DO NOTHING;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_business_catalog_approved_email()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER business_catalog_approved_email
AFTER UPDATE OF status ON public.business_rightsholder_verifications
FOR EACH ROW
WHEN (OLD.status = 'submitted' AND NEW.status = 'verified')
EXECUTE FUNCTION public.enqueue_business_catalog_approved_email();

COMMIT;
