import { cache } from "react";

import type { SupabaseClient } from "@supabase/supabase-js";

import { listAuthorWorkspacesForUser } from "@/lib/author-products/auth";
import type { AuthorWorkspace } from "@/lib/author-products/types";
import { getCurrentAuthorApplication } from "@/lib/author-applications/queries";
import { resolveProfileApplicationVariant } from "@/lib/author-applications/status";
import type { ProfileApplicationVariant } from "@/lib/author-applications/types";
import { resolveProfileAvatarUrl } from "@/lib/profile/avatar";
import { getDisplayName, getInitial } from "@/lib/profile/display-name";
import { BECOME_AUTHOR_HREF } from "@/lib/profile/constants";
import { createClient } from "@/lib/supabase/server";

export type ListenerAuthorCta = {
  label: string;
  href: string;
};

export type ListenerShellData = {
  isAuthenticated: boolean;
  displayName: string;
  profileInitial: string;
  avatarUrl: string | null;
  profileHref: string;
  authorCta: ListenerAuthorCta;
};

type ProfileRow = {
  full_name: string | null;
  avatar_path: string | null;
  avatar_url: string | null;
};

export function resolveListenerAuthorCta(input: {
  workspaces: AuthorWorkspace[];
  applicationVariant: ProfileApplicationVariant | null;
}): ListenerAuthorCta {
  if (input.workspaces.length > 0) {
    const href =
      input.workspaces.length === 1
        ? `/author-dashboard?author=${encodeURIComponent(input.workspaces[0]!.slug)}`
        : "/author-dashboard";

    return {
      label: "Кабинет автора",
      href,
    };
  }

  const variant = input.applicationVariant ?? "none";

  switch (variant) {
    case "draft":
      return { label: "Продолжить", href: BECOME_AUTHOR_HREF };
    case "submitted":
      return { label: "Посмотреть заявку", href: BECOME_AUTHOR_HREF };
    case "in_review":
      return { label: "Статус заявки", href: BECOME_AUTHOR_HREF };
    case "needs_changes":
      return { label: "Дополнить заявку", href: BECOME_AUTHOR_HREF };
    case "approved_pending_access":
      return { label: "Заявка одобрена", href: BECOME_AUTHOR_HREF };
    case "rejected":
      return { label: "Посмотреть решение", href: BECOME_AUTHOR_HREF };
    default:
      return { label: "Стать автором", href: BECOME_AUTHOR_HREF };
  }
}

async function loadListenerShellData(
  supabase?: SupabaseClient,
): Promise<ListenerShellData> {
  const client = supabase ?? (await createClient());

  const {
    data: { user },
  } = await client.auth.getUser();

  if (!user) {
    return {
      isAuthenticated: false,
      displayName: "",
      profileInitial: "",
      avatarUrl: null,
      profileHref: "/auth/sign-in",
      authorCta: resolveListenerAuthorCta({
        workspaces: [],
        applicationVariant: null,
      }),
    };
  }

  const [profileResult, workspaces, application] = await Promise.all([
    client
      .from("profiles")
      .select("full_name, avatar_path, avatar_url")
      .eq("id", user.id)
      .maybeSingle(),
    listAuthorWorkspacesForUser(user.id).catch((error) => {
      console.error("listener_shell_author_workspaces_error", error);
      return [] as AuthorWorkspace[];
    }),
    getCurrentAuthorApplication(client, user.id).catch((error) => {
      console.error("listener_shell_author_application_error", error);
      return null;
    }),
  ]);

  if (profileResult.error) {
    console.error(
      "listener_shell_profile_load_error",
      profileResult.error.message,
    );
  }

  const profile = (profileResult.data as ProfileRow | null) ?? null;
  const displayName = getDisplayName(profile, user);
  const avatarUrl = await resolveProfileAvatarUrl(profile, user.id);

  return {
    isAuthenticated: true,
    displayName,
    profileInitial: getInitial(displayName),
    avatarUrl,
    profileHref: "/profile",
    authorCta: resolveListenerAuthorCta({
      workspaces,
      applicationVariant: resolveProfileApplicationVariant({
        workspaceCount: workspaces.length,
        applicationStatus: application?.status ?? null,
      }),
    }),
  };
}

/** Dedupe within one RSC request when layout + page both need shell data. */
export const getListenerShellData = cache(loadListenerShellData);
