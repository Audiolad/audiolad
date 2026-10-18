import Link from "next/link";

import { agreementAcceptHref, type ProductWorkspace } from "@/lib/business-rightsholder/agreement-links";

/**
 * Red notice: the chosen product's workspace has not accepted the unified agreement 2.0.
 * Always carries direct links to the acceptance page of THAT workspace (Sergey 18.10.2026 UX rule).
 */
export default function AgreementRequiredNotice({
  workspace,
  showWorkspaceName,
  variant,
}: {
  workspace: Pick<ProductWorkspace, "slug" | "name">;
  showWorkspaceName: boolean;
  /** "choice": shown as soon as such a product is selected; "submit": the server refused the submit. */
  variant: "choice" | "submit";
}) {
  const href = agreementAcceptHref(workspace.slug);
  const where = showWorkspaceName ? ` в кабинете «${workspace.name}»` : "";
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert" data-agreement-required={workspace.slug}>
      <p>
        {variant === "choice"
          ? `Этот продукт – из кабинета, где ещё не принято Единое коммерческое соглашение (редакция 2.0)${where ? `: «${workspace.name}»` : ""}. `
          : `Сначала примите Единое коммерческое соглашение (редакция 2.0)${where} в разделе `}
        {variant === "submit" ? (
          <>
            <Link href={href} className="font-semibold underline underline-offset-2">«Юридические документы»</Link>.{" "}
          </>
        ) : null}
        <Link href={href} className="font-semibold underline underline-offset-2" data-agreement-accept-link>
          Перейти и принять
        </Link>
        {variant === "choice" ? " или выберите продукт из кабинета, где соглашение уже принято." : null}
      </p>
    </div>
  );
}
