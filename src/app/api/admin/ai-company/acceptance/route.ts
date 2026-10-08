import { NextResponse } from "next/server";

import { handleOwnerAcceptanceRequest } from "@/lib/admin/ai-company-acceptance";
import { requireAdminPermission } from "@/lib/admin/guard";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const session = await requireAdminPermission("ai_company.view");
  // Core records the decision as actor `sergey`; only the platform owner session may speak for it.
  const actor = { userId: session.userId, isOwner: session.access.roles.includes("owner") };
  const body = await request.json().catch(() => null);
  const result = await handleOwnerAcceptanceRequest({
    body,
    base: process.env.COMPANY_CORE_URL ?? process.env.COMPANY_API_URL,
    token: process.env.COMPANY_API_TOKEN,
    actor,
  });
  // Audit line: authenticated session user id, task, decision and outcome code only. No token, no comment text.
  const record = body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
  console.info("ai_company_acceptance_audit", {
    sessionUserId: actor.userId,
    sessionOwner: actor.isOwner,
    taskId: typeof record.taskId === "string" ? record.taskId.slice(0, 64) : null,
    decision: typeof record.decision === "string" ? record.decision.slice(0, 16) : null,
    status: result.status,
    code: result.body.ok ? "saved" : result.body.code,
  });
  return NextResponse.json(result.body, { status: result.status });
}
