import { NextResponse } from "next/server";

import { e2ePage } from "@/app/e2e-data";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const u = new URL(request.url);
  await new Promise((r) => setTimeout(r, 120));
  return NextResponse.json(
    e2ePage(
      {
        q: u.searchParams.get("q") ?? "",
        access: u.searchParams.get("access") ?? "all",
        sort: u.searchParams.get("sort") ?? "new",
      },
      u.searchParams.get("cursor"),
    ),
  );
}
