import { PROFILE_HELP_CONTACT_ORDER, PROFILE_HELP_CONTACT_TITLE } from "@/lib/business-app/sergey-contact";
import SergeyContactActions from "@/components/business-app/SergeyContactActions";

/** «Профиль» → «Помощь»: first, Sergey's direct contacts (Sergey 03.11.2026 14:45). */
export default function ProfileHelpContact() {
  return (
    <div className="business-profile-help-contact" data-testid="biz-profile-help-contact">
      <h2 className="text-[1.1rem] font-bold leading-snug text-[var(--biz-text)]">{PROFILE_HELP_CONTACT_TITLE}</h2>
      <SergeyContactActions order={PROFILE_HELP_CONTACT_ORDER} testIdPrefix="biz-profile-contact" />
    </div>
  );
}
