import { NextResponse } from "next/server";

import { handleOwnerLifecycleRequest } from "@/lib/admin/ai-company-lifecycle";
import { requireAdminPermission } from "@/lib/admin/guard";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const session = await requireAdminPermission("ai_company.view");
  // Core records lifecycle actions as actor `sergey`; only the platform owner session may speak for it.
  const actor = { userId: session.userId, isOwner: session.access.roles.includes("owner") };
  const body = await request.json().catch(() => null);
  const result = await handleOwnerLifecycleRequest({
    body,
    base: process.env.COMPANY_CORE_URL ?? process.env.COMPANY_API_URL,
    token: process.env.COMPANY_API_TOKEN,
    actor,
  });
  // Audit line: session user id, task, action and outcome code only. No token, no reason text.
  const record = body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
  console.info("ai_company_lifecycle_audit", {
    sessionUserId: actor.userId,
    sessionOwner: actor.isOwner,
    taskId: typeof record.taskId === "string" ? record.taskId.slice(0, 64) : null,
    action: typeof record.action === "string" ? record.action.slice(0, 20) : null,
    status: result.status,
    code: result.body.ok ? "applied" : result.body.code,
  });
  return NextResponse.json(result.body, { status: result.status });
}
