import { NextResponse } from "next/server";

import { businessHallDeviceLocked } from "@/lib/business-app/cabinet-mode.server";
import { organizationLegalColumns } from "@/lib/business/legal/egrul";
import { lookupBusinessRegistry } from "@/lib/business/legal/egrul.server";
import { checkBusinessInn } from "@/lib/business/legal/inn";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { createClientFromRequest } from "@/lib/supabase/request-client";

export const dynamic = "force-dynamic";

/**
 * ИНН Клиента (оферта ред. 3, раздел 3; t1591u). Только владелец организации, не устройство зала.
 * Владелец вводит только ИНН: контрольные цифры, затем наименование и ОГРН/ОГРНИП из реестра ФНС.
 * Запись – service role (у authenticated нет права UPDATE на business_organizations).
 */
export async function POST(request: Request) {
  const supabase = await createClientFromRequest(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (await businessHallDeviceLocked()) return NextResponse.json({ error: "not_owner" }, { status: 403 });

  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    body = null;
  }
  const check = checkBusinessInn(body && typeof body === "object" ? (body as { inn?: unknown }).inn : null);
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 });

  // Same organization as the cabinet: the caller's first membership (domain.ts), and it must be «owner».
  const { data: memberships, error: membershipError } = await supabase
    .from("business_organization_members")
    .select("organization_id, role, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1);
  if (membershipError) return NextResponse.json({ error: "internal_error" }, { status: 500 });
  const membership = memberships?.[0];
  if (!membership?.organization_id) return NextResponse.json({ error: "no_organization" }, { status: 409 });
  if (membership.role !== "owner") return NextResponse.json({ error: "not_owner" }, { status: 403 });

  const lookup = await lookupBusinessRegistry(check.inn);
  if (!lookup.ok) {
    const status = lookup.error === "registry_unavailable" ? 503 : 422;
    return NextResponse.json({ error: lookup.error }, { status });
  }
  if (lookup.identity.kind !== check.kind) return NextResponse.json({ error: "inn_not_found" }, { status: 422 });

  const db = createServiceRoleClient();
  const { error: updateError } = await db
    .from("business_organizations")
    .update(organizationLegalColumns(lookup.identity, new Date()))
    .eq("id", membership.organization_id);
  if (updateError) return NextResponse.json({ error: "internal_error" }, { status: 500 });

  return NextResponse.json({
    ok: true,
    identity: {
      inn: lookup.identity.inn,
      kind: lookup.identity.kind,
      name: lookup.identity.displayName,
      ogrn: lookup.identity.ogrn,
    },
  });
}
