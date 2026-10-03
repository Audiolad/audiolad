import MailingEditor from "@/components/admin/MailingEditor";
import { requireAdminPermission } from "@/lib/admin/guard";
import { snapshotHasPermission } from "@/lib/auth/platform-access";

export const dynamic = "force-dynamic";

export default async function NewMailingPage() {
  const session = await requireAdminPermission("mailings.manage");

  return (
    <MailingEditor
      canSend={snapshotHasPermission(session.access, "mailings.send")}
      initial={{
        name: "",
        messageType: "author_operational",
        subject: "",
        preheader: "",
        heading: "",
        paragraphs: "",
        ctaLabel: "",
        ctaUrl: "",
        infoTitle: "",
        infoText: "",
        secondaryLabel: "",
        secondaryUrl: "",
        filterKind: "all_authors",
        authorIds: [],
      }}
    />
  );
}
