import {
  AuthorAccessError,
  listAuthorWorkspacesForUser,
  requireAuthenticatedUser,
  requireAuthorMembership,
} from "@/lib/author-products/auth";
import type { AuthorAccessStatus } from "@/lib/authors/access";
import type { AuthorMemberRole, AuthorWorkspace } from "@/lib/author-products/types";
import { isPlatformAdmin } from "@/lib/auth/platform-admin";

export async function listPromotionWorkspaces(
  userId: string,
): Promise<AuthorWorkspace[]> {
  const { supabase } = await requireAuthenticatedUser();
  const admin = await isPlatformAdmin(supabase, userId);

  if (!admin) {
    return listAuthorWorkspacesForUser(userId, supabase);
  }

  const { data, error } = await supabase
    .from("authors")
    .select("id, name, slug, access_status")
    .order("name", { ascending: true });

  if (error) {
    console.error("promotion_authors_list_error", error.message);
    throw new AuthorAccessError("internal_error", 500);
  }

  return (data ?? [])
    .filter((author) => author.id && author.name && author.slug)
    .map((author) => ({
      id: author.id,
      name: author.name,
      slug: author.slug,
      role: "owner" as AuthorMemberRole,
      accessStatus: (author.access_status ?? "free") as AuthorAccessStatus,
    }));
}

export async function requireAuthorPromotionAccess(authorId: string) {
  const { supabase, user } = await requireAuthenticatedUser();
  const admin = await isPlatformAdmin(supabase, user.id);

  if (admin) {
    return {
      supabase,
      user,
      role: "owner" as AuthorMemberRole,
      isPlatformAdmin: true,
    };
  }

  const membership = await requireAuthorMembership(authorId);

  return {
    ...membership,
    isPlatformAdmin: false,
  };
}

export async function requirePromotionCampaignAccess(campaignId: string) {
  const { supabase, user } = await requireAuthenticatedUser();

  const { data: campaign, error } = await supabase
    .from("promotion_campaigns")
    .select(
      `
      id,
      author_id,
      practice_id,
      name,
      campaign_key,
      status,
      created_by,
      created_at,
      updated_at,
      practices (
        title,
        slug,
        status,
        authors!practices_author_id_fkey (
          slug
        )
      )
    `,
    )
    .eq("id", campaignId)
    .maybeSingle();

  if (error) {
    console.error("promotion_campaign_lookup_error", error.message);
    throw new AuthorAccessError("internal_error", 500);
  }

  if (!campaign?.id) {
    throw new AuthorAccessError("not_found", 404);
  }

  await requireAuthorPromotionAccess(campaign.author_id);

  return { supabase, user, campaign };
}
