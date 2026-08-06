import { redirect } from "next/navigation";

export default function NewPlaylistRedirectPage() {
  redirect("/playlists");
}
