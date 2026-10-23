import type { Metadata } from "next";

import BusinessWorkspace from "@/components/business-app/workspace/BusinessWorkspace";
import { buildBusinessAppMetadata } from "@/lib/business-app/seo";
import { loadWorkspacePage } from "@/lib/business-workspace/load.server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  ...buildBusinessAppMetadata(),
  title: "Кабинет музыки – АудиоЛад Бизнес",
  robots: { index: false, follow: false },
};

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * One workspace for every business_space. The cafe space is the only enabled direction.
 */
export default async function BusinessWorkspacePage({ searchParams }: PageProps) {
  const space = (await searchParams).space;
  const model = await loadWorkspacePage(typeof space === "string" ? space : null);
  return <BusinessWorkspace model={model} />;
}
