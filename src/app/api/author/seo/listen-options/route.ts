import { NextResponse } from "next/server";

import { listListenPageDefinitions } from "@/lib/seo/listens/registry";

export const dynamic = "force-dynamic";

/** Small server-produced editor list; never bundle the Listen registry client-side. */
export async function GET() {
  return NextResponse.json({
    options: listListenPageDefinitions().map((page) => ({
      value: page.slug,
      label: page.title,
    })),
  });
}
