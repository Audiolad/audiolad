import { redirect } from "next/navigation";

export default function LegacyNewPracticePage() {
  redirect("/author-dashboard/products/new");
}
