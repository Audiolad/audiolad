import { redirect } from "next/navigation";

/** Old venue-player URL. The cabinet player is the music page. */
export default function BusinessVenuePlayerRoutePage() {
  redirect("/music");
}
