import { NextResponse } from "next/server";

import { requireAdminPermission } from "@/lib/admin/guard";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function POST(request: Request) {
  await requireAdminPermission("seo.manage");
  const body = await request.json() as Record<string, unknown>;
  const queryText = text(body.query_text);
  if (!queryText) return NextResponse.json({ error: "query_text_required" }, { status: 400 });

  const supabase = createServiceRoleClient();
  const { data, error } = await supabase.from("seo_queries").insert({
    query_text: queryText,
    source: text(body.source) ?? "manual",
    frequency: typeof body.frequency === "number" ? body.frequency : null,
    cluster_id: text(body.cluster_id),
    intent: text(body.intent),
    recommended_format: text(body.recommended_format),
    audio_fit: text(body.audio_fit),
  }).select().single();
  if (error) return NextResponse.json({ error: error.code === "23505" ? "normalized_query_duplicate" : "seo_query_create_failed" }, { status: 400 });
  return NextResponse.json({ query: data }, { status: 201 });
}

export async function PUT(request: Request) {
  await requireAdminPermission("seo.manage");
  const body = await request.json() as Record<string, unknown>;
  const name = text(body.name);
  if (!name) return NextResponse.json({ error: "cluster_name_required" }, { status: 400 });
  const { data, error } = await createServiceRoleClient()
    .from("seo_clusters")
    .insert({
      name,
      canonical_query: text(body.canonical_query),
      intent: text(body.intent),
      recommended_format: text(body.recommended_format),
    })
    .select("id, name")
    .single();
  if (error) return NextResponse.json({ error: "seo_cluster_create_failed" }, { status: 400 });
  return NextResponse.json({ cluster: data }, { status: 201 });
}

export async function PATCH(request: Request) {
  await requireAdminPermission("seo.manage");
  const body = await request.json() as Record<string, unknown>;
  const id = text(body.id);
  if (!id) return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  const update: Record<string, unknown> = {};
  for (const key of ["query_text", "source", "cluster_id", "intent", "recommended_format", "audio_fit"]) {
    if (key in body) update[key] = text(body[key]);
  }
  if (typeof body.frequency === "number" || body.frequency === null) update.frequency = body.frequency;
  const { data, error } = await createServiceRoleClient()
    .from("seo_queries").update(update).eq("id", id).select().single();
  if (error) {
    return NextResponse.json(
      { error: error.code === "23505" ? "normalized_query_duplicate" : "seo_query_update_failed" },
      { status: 400 },
    );
  }
  return NextResponse.json({ query: data });
}

export async function DELETE(request: Request) {
  await requireAdminPermission("seo.manage");
  const body = await request.json() as Record<string, unknown>;
  const reservationId = text(body.reservation_id);
  if (!reservationId) return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  const { data, error } = await createServiceRoleClient().rpc(
    "admin_release_seo_query_reservation",
    { p_reservation_id: reservationId },
  );
  if (error) return NextResponse.json({ error: "seo_reservation_release_failed" }, { status: 400 });
  return NextResponse.json({ reservation: data });
}
