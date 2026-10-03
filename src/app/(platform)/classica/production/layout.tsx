import type { Metadata } from "next";
import type { ReactNode } from "react";

import ProductionShell from "@/components/classica/ProductionShell";
import {
  classicaCanAdmin,
  requireClassicaProductionAccess,
} from "@/lib/classica/production/access";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Classica Production",
  robots: { index: false, follow: false, nocache: true },
};

export default async function ClassicaProductionLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = await requireClassicaProductionAccess();

  return (
    <ProductionShell
      title="Производство"
      subtitle="Закрытый конвейер Classica. Первые работы проводит администратор, дальше те же роли можно выдать другим."
      canAdmin={classicaCanAdmin(session.access)}
    >
      {children}
    </ProductionShell>
  );
}
