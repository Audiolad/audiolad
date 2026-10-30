import { headers } from "next/headers";
import { notFound } from "next/navigation";
import CoffeeHandoff from "@/components/business-app/CoffeeHandoff";
import { BUSINESS_HOSTNAME, coffeeHostEnabled, getHostnameFromHeaders } from "@/lib/business-app/host";
import { coffeeReturnPath } from "@/lib/business-app/guest-coffee/shared-identity";

export default async function CoffeeHandoffPage({ searchParams }: {
  searchParams: Promise<{ next?: string }>;
}) {
  if (!coffeeHostEnabled() || getHostnameFromHeaders(await headers()) !== BUSINESS_HOSTNAME) notFound();
  return <CoffeeHandoff next={coffeeReturnPath((await searchParams).next ?? "/")} />;
}
