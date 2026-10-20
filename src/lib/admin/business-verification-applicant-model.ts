import { snapshotHasPermission, type PlatformAccessSnapshot } from "@/lib/auth/platform-access";

export type ApplicantWorkspace = { id: string; name: string; slug: string | null; access_status: string | null };
export type ApplicantRightsholder = { id: string; display_name: string; entity_type: string; status: string };
export function formatApplicantWorkspaceTotal(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  const noun = mod10 === 1 && mod100 !== 11 ? "авторский проект" : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14) ? "авторских проекта" : "авторских проектов";
  return `${count} ${noun}`;
}
export function buildBusinessVerificationApplicant(input: {
  ownerUserId: string;
  fullName: string | null;
  workspaces: ApplicantWorkspace[];
  sourceWorkspace: ApplicantWorkspace | null;
  rightsholder: ApplicantRightsholder | null;
  access: PlatformAccessSnapshot;
}) {
  const fullName = input.fullName?.trim() || null;
  const workspaces = [...new Map(input.workspaces.map((w) => [w.id, w])).values()].sort((a, b) => a.name.localeCompare(b.name, "ru"));
  return {
    fullName,
    nameLabel: fullName ?? "Имя в профиле не заполнено – проверьте профиль",
    profileHref: snapshotHasPermission(input.access, "users.view") ? `/admin/users/${input.ownerUserId}` : null,
    workspaces,
    workspaceTotal: workspaces.length ? formatApplicantWorkspaceTotal(workspaces.length) : "У аккаунта нет авторских проектов",
    sourceWorkspace: input.sourceWorkspace,
    sourceLabel: input.sourceWorkspace?.name ?? "Не определено",
    sourceWarning: input.sourceWorkspace && !workspaces.some((w) => w.id === input.sourceWorkspace?.id) ? "пространство не принадлежит аккаунту заявителя – проверьте" : null,
    rightsholder: input.rightsholder,
  };
}
