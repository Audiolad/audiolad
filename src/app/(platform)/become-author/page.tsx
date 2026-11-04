import type { Metadata } from "next";

import AuthorApplicationPanel from "@/components/become-author/AuthorApplicationPanel";
import BecomeAuthorShell from "@/components/become-author/BecomeAuthorShell";
import BecomeAuthorHeader, {
  AUTHOR_APPLICATION_PANEL_ID,
  BecomeAuthorHero,
  BecomeAuthorInfoSections,
  BecomeAuthorSchoolSection,
  BecomeAuthorTopCta,
} from "@/components/become-author/BecomeAuthorContent";
import { getBecomeAuthorPageView } from "@/lib/author-applications/queries";
import { loadAuthorApplicationRevisionFields } from "@/lib/author-applications/revision";
import { rowToFormValues } from "@/lib/author-applications/validation";
import { listAuthorWorkspacesForUser } from "@/lib/author-products/auth";
import { getAppOrigin } from "@/lib/seo/app-origin";
import { createClient } from "@/lib/supabase/server";
import { getInviteePartnerAttribution } from "@/lib/author-partner/attribution";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Стать автором – АудиоЛад",
  description:
    "Подайте заявку и начните публиковать аудиопрактики, музыку и программы на платформе АудиоЛад.",
  alternates: {
    canonical: `${getAppOrigin()}/become-author`,
  },
};

const EMPTY_FORM_VALUES = {
  displayName: "",
  selectedDirections: [],
  directionOther: "",
  direction: "",
  about: "",
  contactEmail: "",
  contactDetails: "",
  hasReadyMaterials: false,
  wantsTraining: false,
  interestedInSchool: false,
  consentPersonalData: false,
  inviteCode: "",
};

export default async function BecomeAuthorPage({
  searchParams,
}: {
  searchParams: Promise<{ submitted?: string; revision?: string }>;
}) {
  const params = await searchParams;
  const showSubmittedBanner = params.submitted === "1";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const workspaces = user
    ? await listAuthorWorkspacesForUser(user.id).catch(() => [])
    : [];

  const partnerAttribution = user
    ? await getInviteePartnerAttribution(user.id)
    : { exists: false };

  const view = await getBecomeAuthorPageView(supabase, {
    user,
    workspaceCount: workspaces.length,
    showSubmittedBanner,
  });

  const defaultValues = {
    ...(view.application
      ? rowToFormValues(view.application, {
          fallbackContactEmail: view.userEmail,
        })
      : {
          ...EMPTY_FORM_VALUES,
          contactEmail: view.userEmail ?? "",
        }),
    inviteCode:
      partnerAttribution.exists && partnerAttribution.code
        ? partnerAttribution.code
        : "",
  };

  const inviteLocked =
    Boolean(partnerAttribution.exists && partnerAttribution.code);

  // «На доработке»: sections the team asked to fix (tolerant – [] before the
  // revision_fields migration is applied).
  const revisionFields =
    view.application?.status === "needs_changes"
      ? await loadAuthorApplicationRevisionFields(supabase, view.application.id)
      : [];

  return (
    <BecomeAuthorShell>
      <BecomeAuthorHeader audience={view.audience} />

      <div className="mt-6 flex flex-col lg:grid lg:grid-cols-[minmax(0,3fr)_minmax(320px,2fr)] lg:items-start lg:gap-8">
        <div className="min-w-0">
          <BecomeAuthorHero />
          <BecomeAuthorTopCta audience={view.audience} />
          <div className="mt-8">
            <BecomeAuthorInfoSections />
          </div>
        </div>

        <aside
          id={AUTHOR_APPLICATION_PANEL_ID}
          className="mt-8 min-w-0 scroll-mt-[calc(5.5rem+env(safe-area-inset-top,0px))] lg:mt-0 lg:self-start"
        >
          <AuthorApplicationPanel
            audience={view.audience}
            application={view.application}
            workspaceCount={view.workspaceCount}
            defaultValues={defaultValues}
            showSubmittedBanner={view.showSubmittedBanner}
            userEmail={view.userEmail}
            inviteLocked={inviteLocked}
            revisionFields={revisionFields}
          />
        </aside>

        <div className="mt-8 min-w-0 lg:col-span-2">
          <BecomeAuthorSchoolSection />
        </div>
      </div>
    </BecomeAuthorShell>
  );
}
