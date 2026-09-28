/**
 * Music Analyzer Lab v0.1 is owner/admin only.
 * Editor, support, analyst and finance keep admin_panel.access but do not
 * enter the lab. Role resolution stays in platform-access.
 */

const LAB_ROLES = new Set(["owner", "admin"]);

export type MusicLabAccessDecision = "anonymous" | "denied" | "allow";

export function decideMusicLabAccess(input: {
  userId: string | null;
  roles: readonly string[];
}): MusicLabAccessDecision {
  if (!input.userId) {
    return "anonymous";
  }

  if (input.roles.some((role) => LAB_ROLES.has(role))) {
    return "allow";
  }

  return "denied";
}
