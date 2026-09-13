"use server";

import { revalidatePath } from "next/cache";

import {
  provisionStudioAuthorWorkspace,
  resolveStudioOwner,
  validateStudioProvisionInput,
} from "@/lib/admin/studio-author-provisioning";
import { requireAdminPermission } from "@/lib/admin/guard";
import type { CreateStudioWorkspaceActionState } from "@/lib/admin/studio-author-workspace-form-state";
import { createClient } from "@/lib/supabase/server";

export async function createStudioWorkspace(
  _previousState: CreateStudioWorkspaceActionState,
  formData: FormData,
): Promise<CreateStudioWorkspaceActionState> {
  await requireAdminPermission("authors.manage");

  const validation = validateStudioProvisionInput({
    name: String(formData.get("name") ?? ""),
    slug: String(formData.get("slug") ?? ""),
    owner: String(formData.get("owner") ?? ""),
  });

  if (!validation.ok) return validation;

  const owner = await resolveStudioOwner(validation.owner);
  if (!owner) {
    return { ok: false, error: "Пользователь-владелец не найден." };
  }

  const supabase = await createClient();
  const provisioned = await provisionStudioAuthorWorkspace(supabase, {
    name: validation.name,
    slug: validation.slug,
    ownerUserId: owner.id,
  });

  if (!provisioned.ok) return provisioned;

  revalidatePath("/admin/authors/new");
  revalidatePath("/author-dashboard");

  return {
    ok: true,
    message: "Авторское пространство студии создано.",
    workspace: {
      ...provisioned.result,
      owner,
    },
  };
}
