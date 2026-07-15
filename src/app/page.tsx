import Link from "next/link";

import BottomNav from "@/components/BottomNav";
import LegalFooter from "@/components/LegalFooter";
import PrimaryNav from "@/components/PrimaryNav";
import { createClient } from "@/lib/supabase/server";
import { platformMobileShellClass } from "@/lib/navigation/bottom-nav";

export const dynamic = "force-dynamic";

const FIRST_AUDIO_COURSE_SLUG = "first-audio-course";

function isAccessActive(expiresAt: string | null): boolean {
  if (expiresAt === null) {
    return true;
  }

  return new Date(expiresAt) > new Date();
}

export default async function Home() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  let hasFirstAudioCourseAccess = false;

  if (user) {
    const { data: practice } = await supabase
      .from("practices")
      .select("id")
      .eq("slug", FIRST_AUDIO_COURSE_SLUG)
      .maybeSingle();

    if (practice?.id) {
      const { data: entitlement } = await supabase
        .from("user_practices")
        .select("expires_at")
        .eq("practice_id", practice.id)
        .maybeSingle();

      hasFirstAudioCourseAccess =
        entitlement !== null && isAccessActive(entitlement.expires_at);
    }
  }

  return (
    <main className="min-h-screen bg-platform-surface text-[#25135c]">
      <div
        className={`mx-auto min-h-screen w-full max-w-[430px] bg-platform-surface lg:max-w-[1200px] ${platformMobileShellClass}`}
      >
        <div className="px-5 pt-5 lg:px-10 lg:pt-8">
          <header className="border-b border-[#eadff8] pb-5">
            <div className="flex items-start justify-between gap-4">
              <Link
                href="/"
                className="text-[28px] font-semibold leading-none text-[#6234b5] focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5] lg:text-[30px]"
              >
                АудиоЛад
              </Link>

              {!user && (
                <div className="flex shrink-0 gap-2 pt-1 text-sm">
                  <Link
                    href="/auth/sign-in"
                    className="rounded-full border border-[#bda6e1] px-3 py-1.5 font-medium text-[#7042c5]"
                  >
                    Войти
                  </Link>
                  <Link
                    href="/auth/sign-up"
                    className="rounded-full bg-[#7042c5] px-3 py-1.5 font-medium text-white"
                  >
                    Регистрация
                  </Link>
                </div>
              )}
            </div>

            <PrimaryNav className="mt-5 hidden items-center gap-8 lg:flex" />
          </header>

          <section className="mt-8 lg:mt-12">
            <h1 className="text-[32px] font-semibold leading-tight text-[#25135c] lg:text-[42px] lg:leading-[1.15]">
              АудиоЛад
            </h1>

            <p className="mt-3 text-lg font-medium text-[#7042c5] lg:text-xl">
              Авторские аудиопрактики, медитации и образовательные аудиопродукты
            </p>

            <p className="mt-4 max-w-[720px] text-[15px] leading-6 text-[#6f61a3] lg:text-[17px] lg:leading-7">
              Слушайте материалы в Аудиотеке, открывайте новые практики в
              каталоге и возвращайтесь к любимым записям в любое время.
            </p>

            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href="/catalog"
                className="inline-flex rounded-[22px] bg-gradient-to-r from-[#7042c5] to-[#9872d8] px-6 py-4 text-[17px] font-semibold text-white shadow-[0_14px_34px_rgba(96,59,168,0.24)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
              >
                Открыть каталог
              </Link>

              {user ? (
                <Link
                  href="/my-practices"
                  className="inline-flex rounded-[22px] border border-[#7042c5] bg-white px-6 py-4 text-[17px] font-semibold text-[#7042c5] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
                >
                  Аудиотека
                </Link>
              ) : (
                <Link
                  href="/auth/sign-in?next=%2Fmy-practices"
                  className="inline-flex rounded-[22px] border border-[#7042c5] bg-white px-6 py-4 text-[17px] font-semibold text-[#7042c5] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
                >
                  Войти в Аудиотеку
                </Link>
              )}
            </div>
          </section>

          <section className="mt-10 overflow-hidden rounded-[26px] border border-[#eadff8] bg-gradient-to-r from-[#faf4ff] to-[#f1e4fc] p-6 lg:mt-12 lg:p-8">
            <span className="inline-flex rounded-full bg-white/70 px-3 py-1 text-xs font-medium text-[#7042c5]">
              Авторский аудиоподкаст
            </span>

            <h2 className="mt-4 text-[22px] font-semibold leading-tight text-[#25135c] lg:text-[26px]">
              Ваш голос уже может стать цифровым продуктом
            </h2>

            <p className="mt-4 text-[15px] leading-6 text-[#6f61a3]">
              Как превратить свои знания, опыт и состояние в свой первый
              авторский аудиопродукт – аудиопрактику, медитацию или аудиокурс,
              чтобы помогать людям и получать достойное вознаграждение
            </p>

            <dl className="mt-5 space-y-2 text-[15px]">
              <div className="flex flex-wrap gap-x-2">
                <dt className="text-[#8c7dab]">Формат:</dt>
                <dd className="font-medium text-[#25135c]">
                  Авторский аудиоподкаст, 11 мин 28 сек
                </dd>
              </div>
              <div className="flex flex-wrap gap-x-2">
                <dt className="text-[#8c7dab]">Цена:</dt>
                <dd className="font-semibold text-[#7042c5]">99 ₽</dd>
              </div>
            </dl>

            <div className="mt-6 flex flex-wrap gap-3">
              {hasFirstAudioCourseAccess ? (
                <Link
                  href="/listen/first-audio-course"
                  className="inline-flex items-center gap-2 rounded-2xl bg-[#7042c5] px-5 py-3 text-sm font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
                >
                  Слушать
                </Link>
              ) : (
                <Link
                  href="/first-audio-course"
                  className="inline-flex rounded-2xl bg-[#7042c5] px-5 py-3 text-sm font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
                >
                  Купить за 99 ₽
                </Link>
              )}

              <Link
                href="/first-audio-course"
                className="inline-flex rounded-2xl border border-[#7042c5] bg-white px-5 py-3 text-sm font-medium text-[#7042c5] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
              >
                Подробнее
              </Link>
            </div>
          </section>

          <section className="mt-10 rounded-[26px] border border-dashed border-[#d9c9ef] bg-[#fcfaff] p-5 lg:mt-12">
            <h2 className="text-[18px] font-semibold text-[#7042c5]">
              Персональная главная
            </h2>
            <p className="mt-2 text-sm leading-6 text-[#7d70a2]">
              На следующем этапе здесь появятся «Продолжить прослушивание»,
              подборки из вашей Аудиотеки, новинки, рекомендации и раздел для
              авторов.
            </p>
          </section>
        </div>

        <div className="px-5 pb-6 lg:px-10">
          <LegalFooter className="mt-6" />
        </div>

        <BottomNav />
      </div>
    </main>
  );
}
