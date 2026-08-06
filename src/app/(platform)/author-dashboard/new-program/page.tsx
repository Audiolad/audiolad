import { redirect } from "next/navigation";

export default function LegacyNewProgramPage() {
  redirect("/author-dashboard/products/new");
}
