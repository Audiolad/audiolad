BEGIN;

ALTER TABLE public.authors
  ADD COLUMN IF NOT EXISTS client_message_template text NULL;

ALTER TABLE public.authors
  DROP CONSTRAINT IF EXISTS authors_client_message_template_length_check;

ALTER TABLE public.authors
  ADD CONSTRAINT authors_client_message_template_length_check
    CHECK (
      client_message_template IS NULL
      OR char_length(client_message_template) <= 4000
    );

COMMENT ON COLUMN public.authors.client_message_template IS
  'Optional workspace template for client delivery message when sharing personal material links. Supports {clientName} and {publicUrl}.';

COMMIT;
