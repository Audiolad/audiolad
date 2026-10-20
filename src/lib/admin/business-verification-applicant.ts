import "server-only";
import { requireAdminPermission } from "@/lib/admin/guard";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { buildBusinessVerificationApplicant, type ApplicantWorkspace, type ApplicantRightsholder } from "@/lib/admin/business-verification-applicant-model";

export type BusinessApplicantCase = { id: string; owner_user_id: string; sourceWorkspace: ApplicantWorkspace | null };
type Joined<T> = T | T[] | null;
function one<T>(value: Joined<T>): T | null { return Array.isArray(value) ? value[0] ?? null : value; }

type OwnerMembership = { user_id: string; authors: Joined<ApplicantWorkspace> };

async function loadAllOwnerMemberships(service: ReturnType<typeof createServiceRoleClient>, ownerIds: string[]) {
  const members: OwnerMembership[] = [];
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    const response = await service.from("author_members")
      .select("user_id, authors!author_members_author_id_fkey(id, name, slug, access_status)")
      .in("user_id", ownerIds).eq("role", "owner")
      .order("user_id").order("author_id").range(offset, offset + pageSize - 1);
    if (response.error) return { data: null, error: response.error };
    const page = (response.data ?? []) as unknown as OwnerMembership[];
    members.push(...page);
    if (page.length < pageSize) return { data: members, error: null };
  }
}

/** Batch account relations; permission is checked before the service client is created. */
export async function loadBusinessVerificationApplicants(cases: BusinessApplicantCase[]) {
  const session = await requireAdminPermission("author_products.moderate");
  const result = new Map<string, ReturnType<typeof buildBusinessVerificationApplicant>>();
  if (!cases.length) return result;
  const service = createServiceRoleClient();
  const ownerIds = [...new Set(cases.map((c) => c.owner_user_id))];
  const [profiles, memberships, bindings] = await Promise.all([
    service.from("profiles").select("id, full_name").in("id", ownerIds),
    loadAllOwnerMemberships(service, ownerIds),
    service.from("business_rightsholder_accounts").select("owner_user_id, rightsholder_id, music_rightsholders!business_rightsholder_accounts_rightsholder_id_fkey(id, display_name, entity_type, status)").in("owner_user_id", ownerIds),
  ]);
  for (const [lookup, response] of [["profiles", profiles], ["workspaces", memberships], ["bindings", bindings]] as const) {
    if (response.error) console.error("admin_business_applicant_lookup_failed", { lookup, code: response.error.code });
  }
  // Fail visibly rather than present a partial account scope for approval.
  if (profiles.error || memberships.error || bindings.error) throw new Error("admin_business_applicant_lookup_failed");
  const names = new Map((profiles.data ?? []).map((p) => [p.id as string, p.full_name as string | null]));
  const members = memberships.data ?? [];
  const accounts = (bindings.data ?? []) as unknown as { owner_user_id: string; music_rightsholders: Joined<ApplicantRightsholder> }[];
  for (const c of cases) {
    result.set(c.id, buildBusinessVerificationApplicant({
      ownerUserId: c.owner_user_id,
      fullName: names.get(c.owner_user_id) ?? null,
      workspaces: members.filter((m) => m.user_id === c.owner_user_id).flatMap((m) => { const author = one(m.authors); return author ? [author] : []; }),
      sourceWorkspace: c.sourceWorkspace,
      rightsholder: one(accounts.find((a) => a.owner_user_id === c.owner_user_id)?.music_rightsholders ?? null),
      access: session.access,
    }));
  }
  return result;
}
