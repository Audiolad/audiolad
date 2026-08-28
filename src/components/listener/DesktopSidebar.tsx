import DesktopSidebarChrome from "@/components/listener/DesktopSidebarChrome";
import type { ListenerShellData } from "@/lib/listener/shell-data";

import sidebarLogo from "../../../public/brand/audiolad-logo-sidebar-v2.webp";
import sidebarMark from "../../../public/brand/audiolad-fallback-mark.png";
import becomeAuthorBanner from "../../../public/images/sidebar/become-author-banner-v2.webp";

type DesktopSidebarProps = {
  shellData: ListenerShellData;
};

export default function DesktopSidebar({ shellData }: DesktopSidebarProps) {
  return (
    <DesktopSidebarChrome
      showMyMaterialsNav={shellData.showMyMaterialsNav}
      showEditorialNav={shellData.showEditorialNav}
      showEditorialDirectionsNav={shellData.showEditorialDirectionsNav}
      showSidebarAuthorPromo={shellData.showSidebarAuthorPromo}
      authorCtaHref={shellData.authorCta.href}
      sidebarLogo={sidebarLogo}
      sidebarMark={sidebarMark}
      becomeAuthorBanner={becomeAuthorBanner}
      logoSizes="280px"
      markSizes="40px"
      bannerSizes="216px"
      /* sidebar-static-assets-unit: sizes="280px" sizes="216px" */
    />
  );
}
