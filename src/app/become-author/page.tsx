import AuthorApplicationPanel from "@/components/become-author/AuthorApplicationPanel";
import BecomeAuthorShell from "@/components/become-author/BecomeAuthorShell";
import BecomeAuthorHeader, {
  BecomeAuthorHero,
  BecomeAuthorInfoSections,
} from "@/components/become-author/BecomeAuthorContent";
import { getBecomeAuthorPageView } from "@/lib/author-applications/queries";
import { rowToFormValues } from "@/lib/author-applications/validation";
import { listAuthorWorkspacesForUser } from "@/lib/author-products/auth";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const EMPTY_FORM_VALUES = {
  displayName: "",
  selectedDirections: [],
  directionOther: "",
  direction: "",
  about: "",
  contact: "",
  hasReadyMaterials: false,
  wantsTraining: false,
  interestedInSchool: false,
  consentPersonalData: false,
};

export default async function BecomeAuthorPage({
  searchParams,
}: {
  searchParams: Promise<{ submitted?: string }>;
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

  const view = await getBecomeAuthorPageView(supabase, {
    user,
    workspaceCount: workspaces.length,
    showSubmittedBanner,
  });

  const defaultValues = view.application
    ? rowToFormValues(view.application)
    : EMPTY_FORM_VALUES;

  return (
    <BecomeAuthorShell>
      <BecomeAuthorHeader audience={view.audience} />

      <div className="mt-6 lg:grid lg:grid-cols-[minmax(0,3fr)_minmax(320px,2fr)] lg:items-start lg:gap-8">
        <div className="min-w-0">
          <BecomeAuthorHero />
          <BecomeAuthorInfoSections />
        </div>

        <aside className="mt-8 min-w-0 lg:mt-0 lg:self-start">
          <AuthorApplicationPanel
            audience={view.audience}
            application={view.application}
            workspaceCount={view.workspaceCount}
            defaultValues={defaultValues}
            showSubmittedBanner={view.showSubmittedBanner}
          />
        </aside>
      </div>
    </BecomeAuthorShell>
  );
}
