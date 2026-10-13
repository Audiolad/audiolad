import { NextResponse } from "next/server";

import { handleOwnerLaunchRequest } from "@/lib/admin/ai-company-launch";
import { requireAdminPermission } from "@/lib/admin/guard";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const session = await requireAdminPermission("ai_company.view");
  // Core records the launch as actor `sergey`; only the platform owner session may speak for it.
  const actor = { userId: session.userId, isOwner: session.access.roles.includes("owner") };
  const body = await request.json().catch(() => null);
  const result = await handleOwnerLaunchRequest({
    body,
    base: process.env.COMPANY_CORE_URL ?? process.env.COMPANY_API_URL,
    token: process.env.COMPANY_API_TOKEN,
    actor,
  });
  // Audit line: authenticated session user id, task and outcome code only. No token.
  const record = body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
  console.info("ai_company_launch_audit", {
    sessionUserId: actor.userId,
    sessionOwner: actor.isOwner,
    taskId: typeof record.taskId === "string" ? record.taskId.slice(0, 64) : null,
    status: result.status,
    code: result.body.ok ? "sent" : result.body.code,
  });
  return NextResponse.json(result.body, { status: result.status });
}
