import type { ReactNode } from "react";

import "@/components/business-app/theme/business-theme.css";
import "@/components/business-app/business-app.css";
import { resolveBusinessTheme } from "@/lib/business-app/theme";

export default function VenueLicenceLayout({ children }: { children: ReactNode }) {
  return (
    <div className="business-app-root" data-biz-theme={resolveBusinessTheme()}>
      <div className="business-app-public" data-testid="venue-licence-frame">{children}</div>
    </div>
  );
}
