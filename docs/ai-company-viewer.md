# Read-only viewer of /admin/ai-company (task 7a6fc09c)

Role `ai_company_viewer` = the single permission `ai_company.view`.

What the viewer can do:
- open `/admin/ai-company` (the layout lets it in; the nav shows only «ИИ-компания»);
- see the board read-only: launch / lifecycle / acceptance controls render disabled («только владелец»).

What the viewer cannot do (server-side):
- `POST /api/admin/ai-company/{launch,lifecycle,acceptance}` → `403 owner_required` before the body is read
  and before Company Core is called (plus the existing owner check in the handlers);
- any other admin page → redirected to `/admin/ai-company` (every page guards itself with a panel permission);
- any other admin API / server action → 403/404: they require `admin_panel.access` or a section permission.
- The role deliberately lacks `admin_panel.access`, because `isPlatformAdmin()` maps to it (paid content,
  access links, course access, user deletion / test resets).

## Rollout (needs Sergey's explicit yes)
1. Merge + deploy (migration `20261227120000_ai_company_viewer_role.sql` only adds the role; it assigns nobody).
2. Account: a normal Audiolad sign-up with the agreed address, email confirmed; no author space, no products.
3. Password: generated on the box (`openssl rand -base64 30`), typed only into the sign-up/sign-in form of the box
   browser and saved in that browser's password store / a 0600 file under the agent data dir. Never printed,
   never committed, never sent in chat or PRs.
4. Owner assigns the role (Supabase SQL editor):
   ```sql
   INSERT INTO public.platform_user_roles (user_id, role_code)
   SELECT id, 'ai_company_viewer' FROM auth.users WHERE email = '<viewer email>'
   ON CONFLICT DO NOTHING;
   ```
5. Check: viewer sees the board; `/admin` and `/admin/users` redirect to `/admin/ai-company`; a lifecycle POST is 403.

## Revoke
- Remove access: `DELETE FROM public.platform_user_roles WHERE role_code = 'ai_company_viewer' AND user_id = (SELECT id FROM auth.users WHERE email = '<viewer email>');`
  (effective on the next request; roles are read per request).
- Kill sessions / lock out: Supabase Auth → user → sign out / ban or delete the user; then remove the saved
  password from the box browser.
