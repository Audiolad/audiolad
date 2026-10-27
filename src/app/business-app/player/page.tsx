import { redirect } from "next/navigation";

/** Old venue-player URL. The cabinet player and its queue are the music page. */
export default function BusinessVenuePlayerRoutePage() {
  redirect("/music");
}
