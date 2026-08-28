import { AuthorSupportExitForm } from "@/components/author-support/AuthorSupportExitForm";
import { isPersonalMaterialSupportMutationBlockedMessage } from "@/lib/personal-materials/client/errors";

type PersonalMaterialClientErrorAlertProps = {
  message: string;
  className?: string;
};

export function PersonalMaterialClientErrorAlert({
  message,
  className = "mt-3",
}: PersonalMaterialClientErrorAlertProps) {
  return (
    <div className={className} role="alert">
      <p className="text-sm text-[#b42318]">{message}</p>
      {isPersonalMaterialSupportMutationBlockedMessage(message) ? (
        <div className="mt-2">
          <AuthorSupportExitForm variant="inline" />
        </div>
      ) : null}
    </div>
  );
}
