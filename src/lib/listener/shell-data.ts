import { cache } from "react";

import type { SupabaseClient } from "@supabase/supabase-js";

import { listAuthorWorkspacesForUser } from "@/lib/author-products/auth";
import type { AuthorWorkspace } from "@/lib/author-products/types";
import { getCurrentAuthorApplication } from "@/lib/author-applications/queries";
import { resolveProfileApplicationVariant } from "@/lib/author-applications/status";
import {
  resolveListenerAuthorCta,
  resolveShowSidebarAuthorPromo,
  type ListenerAuthorCta,
} from "@/lib/listener/author-cta";
import { resolveProfileAvatarUrl } from "@/lib/profile/avatar";
import { getDisplayName, getInitial } from "@/lib/profile/display-name";
import { createClient } from "@/lib/supabase/server";

export type { ListenerAuthorCta };
export {
  resolveListenerAuthorCta,
  resolveShowBecomeAuthorPromo,
  resolveShowSidebarAuthorPromo,
} from "@/lib/listener/author-cta";

export type ListenerShellData = {
  isAuthenticated: boolean;
  displayName: string;
  profileInitial: string;
  avatarUrl: string | null;
  profileHref: string;
  authorCta: ListenerAuthorCta;
  showSidebarAuthorPromo: boolean;
};

type ProfileRow = {
  full_name: string | null;
  avatar_path: string | null;
  avatar_url: string | null;
};

async function loadListenerShellData(
  supabase?: SupabaseClient,
): Promise<ListenerShellData> {
  const client = supabase ?? (await createClient());

  const {
    data: { user },
  } = await client.auth.getUser();

  if (!user) {
    const guestAuthorInput = {
      workspaces: [] as AuthorWorkspace[],
      applicationVariant: null,
    };

    return {
      isAuthenticated: false,
      displayName: "",
      profileInitial: "",
      avatarUrl: null,
      profileHref: "/auth/sign-in",
      authorCta: resolveListenerAuthorCta(guestAuthorInput),
      showSidebarAuthorPromo: resolveShowSidebarAuthorPromo(guestAuthorInput),
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

  const authorInput = {
    workspaces,
    applicationVariant: resolveProfileApplicationVariant({
      workspaceCount: workspaces.length,
      applicationStatus: application?.status ?? null,
    }),
  };

  return {
    isAuthenticated: true,
    displayName,
    profileInitial: getInitial(displayName),
    avatarUrl,
    profileHref: "/profile",
    authorCta: resolveListenerAuthorCta(authorInput),
    showSidebarAuthorPromo: resolveShowSidebarAuthorPromo(authorInput),
  };
}

/** Dedupe within one RSC request when layout + page both need shell data. */
export const getListenerShellData = cache(loadListenerShellData);
