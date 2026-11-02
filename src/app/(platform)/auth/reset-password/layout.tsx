import BottomNav from "@/components/BottomNav";
import { hasValidRecoveryIntent } from "@/lib/auth/recovery-intent";
import { PASSWORD_RESET_EXPIRED_MESSAGE } from "@/lib/auth/recovery-messages";
import { platformNavPaddingClass } from "@/lib/navigation/bottom-nav";
import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import Link from "next/link";

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
    <main className="min-h-screen bg-platform-surface text-[#25135c]">
      <div className={`mx-auto min-h-screen w-full max-w-[430px] bg-platform-surface px-5 pt-8 ${platformNavPaddingClass}`}>
        <header className="text-center">
          <Link href="/" className="text-[30px] font-semibold text-[#7042c5]">АудиоЛад</Link>
          <h1 className="mt-8 text-[30px] font-semibold">Смена пароля</h1>
        </header>
        <div role="alert" className="mt-8 rounded-[18px] border border-[#efc7cf] bg-[#fff8f9] px-4 py-4 text-sm leading-6 text-[#b34f63]">
          {PASSWORD_RESET_EXPIRED_MESSAGE}
        </div>
        <p className="mt-6 text-center text-sm text-[#7d70a2]">
          <Link href="/auth/forgot-password" className="font-semibold text-[#7042c5]">Запросить новую ссылку</Link>
        </p>
        <BottomNav />
      </div>
    </main>
  );
}
