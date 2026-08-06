import { redirect } from "next/navigation";

export default function LegacyNewPracticePublishPage() {
  redirect("/author-dashboard/products/new");
}
