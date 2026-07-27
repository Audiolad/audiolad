import { redirect } from "next/navigation";

import {
  isAuthorCommercialApprovedAccess,
  type AuthorAccessStatus,
} from "@/lib/authors/access";
import { listAuthorWorkspacesForUser } from "@/lib/author-products/auth";
import { createClient } from "@/lib/supabase/server";

export type CommercialOnboardingRouteAuthor = {
  id: string;
  slug: string;
  name: string;
  accessStatus: AuthorAccessStatus | string;
};

export async function requireCommercialOnboardingAuthor(input: {
  nextPath: string;
  authorSlug?: string | null;
}): Promise<CommercialOnboardingRouteAuthor> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/auth/sign-in?next=${encodeURIComponent(input.nextPath)}`);
  }

  const authors = await listAuthorWorkspacesForUser(user.id);

  if (authors.length === 0) {
    redirect("/author-dashboard");
  }

  const requestedSlug = input.authorSlug?.trim() || null;
  const selected =
    (requestedSlug
      ? authors.find((author) => author.slug === requestedSlug)
      : null) ?? authors[0];

  if (!selected) {
    redirect("/author-dashboard");
  }

  if (requestedSlug && selected.slug !== requestedSlug) {
    // Another author's slug was requested — do not expose foreign onboarding.
    redirect("/author-dashboard");
  }

  if (!isAuthorCommercialApprovedAccess(selected.accessStatus)) {
    redirect(
      `/author-dashboard/commercial-application?author=${encodeURIComponent(selected.slug)}`,
    );
  }

  return {
    id: selected.id,
    slug: selected.slug,
    name: selected.name,
    accessStatus: selected.accessStatus,
  };
}
