import { Suspense } from "react";
import PasswordResetExpired from "@/components/auth/PasswordResetExpired";
import { hasValidRecoveryIntent } from "@/lib/auth/recovery-intent";
import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";

export default async function ResetPasswordLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const cookieStore = await cookies();

  if (user && hasValidRecoveryIntent(cookieStore, user.id)) {
    return children;
  }

  return (
    <Suspense>
      <PasswordResetExpired />
    </Suspense>
  );
}
