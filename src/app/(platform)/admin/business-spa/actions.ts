"use server";

import { revalidatePath } from "next/cache";

import { requireAdminPermission } from "@/lib/admin/guard";
import { excludeProgramTrack } from "@/lib/business-app/spa-admin";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Removes one track from a Business SPA program (soft exclusion, history kept). */
export async function removeSpaProgramTrack(formData: FormData): Promise<void> {
  const session = await requireAdminPermission("playlists.manage");
  const programId = String(formData.get("programId") ?? "");
  const audioItemId = String(formData.get("audioItemId") ?? "");
  if (!UUID.test(programId) || !UUID.test(audioItemId)) throw new Error("invalid_request");
  // Single atomic exclusion (program row locked in SQL); no read-modify-write race.
  await excludeProgramTrack(programId, audioItemId, `admin_removed:${session.userId}`);
  revalidatePath("/admin/business-spa");
}
