"use server";

import { redirect } from "next/navigation";

import { requirePlatformOwnerAccess } from "@/lib/admin/require-platform-owner";
import { isPlatformOwner } from "@/lib/auth/platform-admin";
import { createClient } from "@/lib/supabase/server";

import { recordAuthorSupportSessionAudit } from "./audit";
import { peekAuthorExecutionContext } from "./context";
import {
  evaluateAuthorSupportStart,
  isAuthorSupportUuid,
  resolveAuthorSupportLandingPath,
  resolveAuthorSupportReturnPath,
  type AuthorSupportDestination,
} from "./policy";
import {
  clearAuthorSupportCookie,
  createAuthorSupportToken,
  writeAuthorSupportCookie,
} from "./session";
import {
  createAuthorSupportSession,
  loadActingAuthorMembership,
  loadTargetUserExists,
  revokeAuthorSupportSession,
  revokeAuthorSupportSessionsForActor,
} from "./store";

function destinationFromForm(value: FormDataEntryValue | null): AuthorSupportDestination {
  return value === "studio" ? "studio" : "cabinet";
}

export async function startAuthorSupportMode(formData: FormData): Promise<void> {
  const owner = await requirePlatformOwnerAccess();
  const targetUserId = String(formData.get("targetUserId") ?? "").trim();
  const targetAuthorId = String(formData.get("targetAuthorId") ?? "").trim();
  const destination = destinationFromForm(formData.get("destination"));

  const supabase = await createClient();
  const actorIsPlatformOwner = await isPlatformOwner(supabase, owner.userId);
  const targetUserExists = await loadTargetUserExists(targetUserId);
  const membership = isAuthorSupportUuid(targetUserId) && isAuthorSupportUuid(targetAuthorId)
    ? await loadActingAuthorMembership({
        actingUserId: targetUserId,
        actingAuthorId: targetAuthorId,
      })
    : null;

  const decision = evaluateAuthorSupportStart({
    actorUserId: owner.userId,
    actorIsPlatformOwner,
    targetUserId,
    targetAuthorId,
    targetUserExists,
    membershipRole: membership?.role ?? null,
  });

  if (!decision.ok) {
    const fallback = isAuthorSupportUuid(targetUserId)
      ? `/admin/users/${targetUserId}?support_error=${decision.code}`
      : "/admin/users";
    redirect(fallback);
  }

  const token = createAuthorSupportToken();
  await createAuthorSupportSession({
    token,
    actorUserId: owner.userId,
    actingUserId: targetUserId,
    actingAuthorId: targetAuthorId,
  });
  await writeAuthorSupportCookie(token);
  await recordAuthorSupportSessionAudit({
    action: "support_session_started",
    actorUserId: owner.userId,
    actingUserId: targetUserId,
    actingAuthorId: targetAuthorId,
    metadata: { destination },
  });

  redirect(
    resolveAuthorSupportLandingPath({
      destination,
      authorSlug: membership?.authorSlug ?? "",
    }),
  );
}

export async function stopAuthorSupportMode(): Promise<void> {
  const execution = await peekAuthorExecutionContext();
  const returnUserId = execution?.isSupportMode ? execution.actingUserId : null;

  if (execution?.isSupportMode && execution.sessionId && execution.actingAuthorId) {
    await revokeAuthorSupportSession(execution.sessionId);
    await recordAuthorSupportSessionAudit({
      action: "support_session_ended",
      actorUserId: execution.realUserId,
      actingUserId: execution.actingUserId,
      actingAuthorId: execution.actingAuthorId,
    });
  } else {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      await revokeAuthorSupportSessionsForActor(user.id);
    }
  }

  await clearAuthorSupportCookie();
  redirect(returnUserId ? resolveAuthorSupportReturnPath(returnUserId) : "/admin/users");
}

export async function clearAuthorSupportModeOnLogout(realUserId: string): Promise<void> {
  await revokeAuthorSupportSessionsForActor(realUserId);
  await clearAuthorSupportCookie();
}
