"use server";

import { revalidatePath } from "next/cache";

import { requireAdminPermission } from "@/lib/admin/guard";
import { loadActiveProgramTrackIds, setProgramTracks } from "@/lib/business-app/spa-admin";
import { compositionWithout } from "@/lib/business-app/spa-admin-report";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Removes one track from a Business SPA program (soft exclusion, history kept). */
export async function removeSpaProgramTrack(formData: FormData): Promise<void> {
  const session = await requireAdminPermission("playlists.manage");
  const programId = String(formData.get("programId") ?? "");
  const audioItemId = String(formData.get("audioItemId") ?? "");
  if (!UUID.test(programId) || !UUID.test(audioItemId)) throw new Error("invalid_request");
  const active = await loadActiveProgramTrackIds(programId);
  const next = compositionWithout(active, audioItemId);
  await setProgramTracks(programId, next, `admin_removed:${session.userId}`);
  revalidatePath("/admin/business-spa");
}
