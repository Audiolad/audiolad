import { NextResponse } from "next/server";

import { handleOwnerAcceptanceRequest } from "@/lib/admin/ai-company-acceptance";
import { requireAdminPermission } from "@/lib/admin/guard";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const session = await requireAdminPermission("ai_company.view");
  const result = await handleOwnerAcceptanceRequest({
    actorId: session.userId,
    body: await request.json().catch(() => null),
    base: process.env.COMPANY_CORE_URL ?? process.env.COMPANY_API_URL,
    token: process.env.COMPANY_API_TOKEN,
  });
  if (!result.body.ok) console.error("ai_company_acceptance_rejected", result.body.code);
  return NextResponse.json(result.body, { status: result.status });
}
