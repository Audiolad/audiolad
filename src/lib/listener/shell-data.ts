import { cache } from "react";

import type { SupabaseClient } from "@supabase/supabase-js";

import { listAuthorWorkspacesForUser } from "@/lib/author-products/auth";
import type { AuthorWorkspace } from "@/lib/author-products/types";
import { getCurrentAuthorApplication } from "@/lib/author-applications/queries";
import { resolveProfileApplicationVariant } from "@/lib/author-applications/status";
import { hasAdminPanelAccess } from "@/lib/auth/platform-admin";
import { getEditorialWorkspaceAccess } from "@/lib/playlists/editorial-workspace";
import {
  resolveListenerAuthorCta,
  resolveShowAuthorEntry,
  resolveShowSidebarAuthorPromo,
  type AuthorRoleLookupStatus,
  type ListenerAuthorCta,
} from "@/lib/listener/author-cta";
import { hasClaimedPersonalMaterials } from "@/lib/personal-materials/client-library/repository";
import { resolveProfileAvatarUrl } from "@/lib/profile/avatar";
import { getDisplayName, getInitial } from "@/lib/profile/display-name";
import { createClient } from "@/lib/supabase/server";

export type { AuthorRoleLookupStatus, ListenerAuthorCta };
export {
  resolveListenerAuthorCta,
  resolveShowAuthorEntry,
  resolveShowBecomeAuthorPromo,
  resolveShowSidebarAuthorPromo,
} from "@/lib/listener/author-cta";

type LookupResult<T> = { ok: true; value: T } | { ok: false; value: T };

async function settleLookup<T>(
  loader: () => Promise<T>,
  fallback: T,
  logLabel: string,
): Promise<LookupResult<T>> {
  try {
    return { ok: true, value: await loader() };
  } catch (error) {
    console.error(logLabel, error);
    return { ok: false, value: fallback };
  }
}

export type ListenerShellData = {
  isAuthenticated: boolean;
  displayName: string;
  profileInitial: string;
  avatarUrl: string | null;
  profileHref: string;
  authorCta: ListenerAuthorCta;
  showAuthorEntry: boolean;
  showAdminPanel: boolean;
  adminPanelHref: string;
  showSidebarAuthorPromo: boolean;
  /** True only after confirmed claimed personal material (no loading flash). */
  showMyMaterialsNav: boolean;
  /** Редакция → Открытые плейлисты. Never true for ordinary listeners. */
  showEditorialNav: boolean;
  /** Редакция → Направления. playlists.manage only. */
  showEditorialDirectionsNav: boolean;
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
    const authorCta = resolveListenerAuthorCta(guestAuthorInput);

    return {
      isAuthenticated: false,
      displayName: "",
      profileInitial: "",
      avatarUrl: null,
      profileHref: "/auth/sign-in",
      authorCta,
      showAuthorEntry: true,
      showAdminPanel: false,
      adminPanelHref: "/admin",
      showSidebarAuthorPromo: resolveShowSidebarAuthorPromo(guestAuthorInput),
      showMyMaterialsNav: false,
      showEditorialNav: false,
      showEditorialDirectionsNav: false,
    };
  }

  const [profileResult, workspacesLookup, application, adminLookup, showMyMaterialsNav, editorialAccess] =
    await Promise.all([
      client
        .from("profiles")
        .select("full_name, avatar_path, avatar_url")
        .eq("id", user.id)
        .maybeSingle(),
      settleLookup(
        () => listAuthorWorkspacesForUser(user.id),
        [] as AuthorWorkspace[],
        "listener_shell_author_workspaces_error",
      ),
      getCurrentAuthorApplication(client, user.id).catch((error) => {
        console.error("listener_shell_author_application_error", error);
        return null;
      }),
      settleLookup(
        () => hasAdminPanelAccess(client, user.id),
        false,
        "listener_shell_admin_panel_access_error",
      ),
      hasClaimedPersonalMaterials(client).catch((error) => {
        console.error("listener_shell_my_materials_nav_error", error);
        return false;
      }),
      getEditorialWorkspaceAccess(client, user.id).catch((error) => {
        console.error("listener_shell_editorial_nav_error", error);
        return {
          userId: user.id,
          hasAccess: false,
          canManage: false,
          canCreate: false,
          canManageDirections: false,
          isCollaborator: false,
          isDirectionEditor: false,
          directionIds: [],
        };
      }),
    ]);

  const workspaces = workspacesLookup.value;
  const showAdminPanel = adminLookup.value;
  const roleLookupStatus: AuthorRoleLookupStatus =
    workspacesLookup.ok && adminLookup.ok ? "confirmed" : "unknown";

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
    roleLookupStatus,
  };
  const authorCta = resolveListenerAuthorCta(authorInput);

  return {
    isAuthenticated: true,
    displayName,
    profileInitial: getInitial(displayName),
    avatarUrl,
    profileHref: "/profile",
    authorCta,
    showAuthorEntry: resolveShowAuthorEntry({
      authorCtaLabel: authorCta.label,
      showAdminPanel,
      roleLookupStatus,
    }),
    showAdminPanel,
    adminPanelHref: "/admin",
    showSidebarAuthorPromo: resolveShowSidebarAuthorPromo(authorInput),
    showMyMaterialsNav,
    showEditorialNav: editorialAccess.hasAccess,
    showEditorialDirectionsNav: editorialAccess.canManageDirections,
  };
}

/** Dedupe within one RSC request when layout + page both need shell data. */
export const getListenerShellData = cache(loadListenerShellData);
