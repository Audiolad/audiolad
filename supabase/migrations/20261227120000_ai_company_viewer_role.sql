-- Read-only viewer of /admin/ai-company (task 7a6fc09c). The role grants only ai_company.view:
-- no admin_panel.access (which elsewhere means platform admin), no other admin section.
-- Assigning it to a user is a separate, owner-approved step (docs/ai-company-viewer.md).

BEGIN;

ALTER TABLE public.platform_roles DROP CONSTRAINT IF EXISTS platform_roles_code_check;
ALTER TABLE public.platform_roles
  ADD CONSTRAINT platform_roles_code_check CHECK (
    code IN (
      'owner',
      'admin',
      'editor',
      'support',
      'analyst',
      'finance',
      'classica_operator',
      'classica_moderator',
      'ai_company_viewer'
    )
  );

INSERT INTO public.platform_permissions (code, description) VALUES
  ('ai_company.view', 'View the AI company board (/admin/ai-company)')
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.platform_roles (code, description) VALUES
  ('ai_company_viewer', 'Read-only viewer of the AI company board')
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.platform_role_permissions (role_code, permission_code) VALUES
  ('owner', 'ai_company.view'),
  ('admin', 'ai_company.view'),
  ('ai_company_viewer', 'ai_company.view')
ON CONFLICT DO NOTHING;

COMMIT;
