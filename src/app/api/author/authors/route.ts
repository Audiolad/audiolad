import { NextResponse } from "next/server";

import {
  handleAuthorRouteError,
  listAuthorWorkspacesForUser,
  requireAuthenticatedUser,
} from "@/lib/author-products/auth";

export async function GET() {
  try {
    const { supabase, user } = await requireAuthenticatedUser();
    const authors = await listAuthorWorkspacesForUser(user.id, supabase);

    return NextResponse.json({ authors });
  } catch (error) {
    return handleAuthorRouteError(error);
  }
}
