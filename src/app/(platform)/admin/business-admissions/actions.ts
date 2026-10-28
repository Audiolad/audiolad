"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminPermission } from "@/lib/admin/guard";
import { admissionAuthorsAccepted } from "@/lib/business-admission/agreement.server";
import { createClient } from "@/lib/supabase/server";

const PATH = "/admin/business-admissions";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function saveBusinessAdmissions(form: FormData): Promise<void> {
  await requireAdminPermission("author_products.moderate");
  const kind = String(form.get("kind"));
  const direction = String(form.get("direction"));
  const value = String(form.get("allowed"));
  const ids = [...new Set(form.getAll("ids").map(String))];
  let failed = !["artist", "album"].includes(kind) || !["true", "false", "inherit"].includes(value)
    || ids.length === 0 || ids.length > 200 || ids.some((id) => !UUID.test(id));
  if (!failed) {
    try {
      if (!await admissionAuthorsAccepted(kind as "artist" | "album", ids)) failed = true;
    } catch { failed = true; }
  }
  if (!failed) {
    try {
      const db = await createClient();
      const { error } = await db.rpc("set_business_content_admissions", {
        p_direction: direction, p_kind: kind, p_ids: ids,
        p_allowed: value === "inherit" ? null : value === "true",
      });
      failed = Boolean(error);
    } catch { failed = true; }
  }
  revalidatePath(PATH);
  const query = new URLSearchParams({ kind, result: failed ? "error" : "saved" });
  // Only known search parameters are carried back; no arbitrary redirect target.
  for (const key of ["q", "directionFilter", "decision", "page"]) {
    const value = form.get(key);
    if (typeof value === "string" && value) query.set(key === "directionFilter" ? "direction" : key, value);
  }
  redirect(`${PATH}?${query}`);
}

export async function setBusinessManualContentGate(form: FormData): Promise<void> {
  await requireAdminPermission("author_products.moderate");
  const enabled = String(form.get("enabled")) === "true";
  let failed = false;
  try {
    const db = await createClient();
    const { error } = await db.rpc("set_business_manual_content_gate", { p_enabled: enabled });
    failed = Boolean(error);
  } catch { failed = true; }
  revalidatePath(PATH);
  redirect(`${PATH}?result=${failed ? "gate-error" : "saved"}`);
}

export async function addBusinessDirection(form: FormData): Promise<void> {
  await requireAdminPermission("author_products.moderate");
  let failed = false;
  try {
    const db = await createClient();
    const { error } = await db.rpc("add_business_content_direction", {
      p_key: String(form.get("key") ?? "").trim(),
      p_name: String(form.get("name") ?? "").trim(),
      p_categories: String(form.get("categories") ?? "").split(",").map((s) => s.trim()).filter(Boolean),
    });
    failed = Boolean(error);
  } catch { failed = true; }
  revalidatePath(PATH);
  redirect(`${PATH}?result=${failed ? "direction-error" : "saved"}`);
}
