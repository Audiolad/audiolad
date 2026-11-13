"use client";
import { businessAuthHref, BUSINESS_CABINET_RETURN_PATH } from "@/lib/access-grants/paths";
import { useBusinessHostname } from "@/components/business-app/BusinessDomainProvider";

export function BusinessEmailTakenActions({ onChange }: { onChange: (button: HTMLButtonElement) => void }) {
  const hostname = useBusinessHostname();
  const href = businessAuthHref(hostname, "sign-in");
  const signIn = href.includes("?next=") ? href : `${href}?next=${encodeURIComponent(BUSINESS_CABINET_RETURN_PATH)}`;
  return <span className="flex flex-wrap gap-3">
    <a className="underline business-app-focus-ring" href={signIn}>Войти</a>
    <button type="button" className="underline business-app-focus-ring" onClick={(event) => onChange(event.currentTarget)}>Изменить почту</button>
  </span>;
}
