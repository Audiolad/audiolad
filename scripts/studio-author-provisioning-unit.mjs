#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => readFileSync(path.join(ROOT, file), "utf8");

const migration = read(
  "supabase/migrations/20261006130100_studio_author_workspace_provisioning.sql",
);
const action = read("src/app/(platform)/admin/authors/new/actions.ts");
const provisioner = read("src/lib/admin/studio-author-provisioning.ts");
const page = read("src/app/(platform)/admin/authors/new/page.tsx");
const form = read("src/components/admin/CreateStudioWorkspaceForm.tsx");

// A user without authors.manage is rejected both at the server action and DB boundary.
assert.match(action, /requireAdminPermission\("authors\.manage"\)/);
assert.match(
  migration,
  /has_platform_permission\(v_actor_user_id, 'authors\.manage'\)/,
);
assert.match(migration, /RAISE EXCEPTION 'forbidden'/);

// An authorized session uses the narrow studio-only RPC and cannot supply a role.
assert.match(action, /provisionStudioAuthorWorkspace/);
assert.match(provisioner, /provision_studio_author_workspace/);
assert.match(migration, /'studio', 'free'/);
assert.match(migration, /VALUES \(v_author_id, p_owner_user_id, 'owner'\)/);
assert.doesNotMatch(action, /\brole\b/);
assert.doesNotMatch(form, /name="role"/);

// The owner is resolved through trusted server-side Auth lookup and verified again in SQL.
assert.match(provisioner, /service\.auth\.admin\.getUserById\(userId\)/);
assert.match(migration, /FROM auth\.users AS u\s+WHERE u\.id = p_owner_user_id/s);
assert.match(migration, /owner_user_not_found/);

// Slug and input failures are safely validated before the RPC and by the DB.
assert.match(provisioner, /AUTHOR_SLUG_RE/);
assert.match(migration, /studio_slug_taken/);
assert.match(provisioner, /Этот slug уже занят/);
assert.match(migration, /GET STACKED DIAGNOSTICS v_constraint_name = CONSTRAINT_NAME/);
assert.match(migration, /v_constraint_name = 'authors_slug_key'/);
assert.match(migration, /END;\s*\n\n  INSERT INTO public\.author_members/s);

// SQL functions execute atomically, and no direct client-side provisioning route exists.
assert.match(migration, /SECURITY DEFINER/);
assert.match(migration, /REVOKE ALL ON FUNCTION/);
assert.match(migration, /GRANT EXECUTE ON FUNCTION[\s\S]*TO authenticated;/);
assert.doesNotMatch(migration, /TO authenticated, service_role/);
assert.match(migration, /INSERT INTO public\.admin_operation_log/);
assert.match(migration, /digest\(lower\(btrim\(v_owner_email\)\), 'sha256'\)/);
assert.match(page, /requireAdminPermission\("authors\.manage"\)/);
assert.doesNotMatch(form, /supabase|\.rpc\(/);

console.log("studio-author-provisioning-unit: ok");
