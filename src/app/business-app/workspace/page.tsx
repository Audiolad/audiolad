import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * Gift and onboarding still return here. The shelves and the player live on /music,
 * so this hop does not load the catalog a second time.
 */
export default function BusinessWorkspacePage() {
  redirect("/music");
}
