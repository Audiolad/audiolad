import ProfileAvatarEditor from "@/components/profile/ProfileAvatarEditor";
import { profileEditPaddingClassName } from "@/lib/profile/layout";
import { createUserAvatarSignedUrl } from "@/lib/profile/avatar";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import Link from "next/link";
import { redirect } from "next/navigation";
import { updateProfile } from "./actions";

export const dynamic = "force-dynamic";

type UserMetadata = {
  first_name?: string;
  last_name?: string;
  full_name?: string;
};

const ERROR_MESSAGES: Record<string, string> = {
  empty_name: "Укажите имя или фамилию.",
  profile_not_found:
    "Профиль не найден. Попробуйте войти снова или обратитесь в поддержку.",
  profile_update_failed: "Не удалось сохранить профиль. Попробуйте ещё раз.",
  metadata_update_failed:
    "Профиль сохранён, но не удалось обновить данные аккаунта. Попробуйте сохранить ещё раз.",
};

function splitFullName(fullName: string | null | undefined): {
  firstName: string;
  lastName: string;
} {
  if (!fullName?.trim()) {
    return { firstName: "", lastName: "" };
  }

  const parts = fullName.trim().split(/\s+/);

  return {
    firstName: parts[0] ?? "",
    lastName: parts.slice(1).join(" "),
  };
}

function getEditNameFields(
  profile: { full_name: string | null } | null,
  meta: UserMetadata,
): { firstName: string; lastName: string } {
  const firstName =
    typeof meta.first_name === "string" ? meta.first_name.trim() : "";
  const lastName =
    typeof meta.last_name === "string" ? meta.last_name.trim() : "";

  if (firstName || lastName) {
    return { firstName, lastName };
  }

  return splitFullName(profile?.full_name);
}

function getDisplayInitial(
  profile: { full_name: string | null } | null,
  meta: UserMetadata,
  email: string,
): string {
  const { firstName, lastName } = getEditNameFields(profile, meta);
  const combined = `${firstName} ${lastName}`.trim();
  const fromProfile = profile?.full_name?.trim();
  const fromMeta =
    typeof meta.full_name === "string" ? meta.full_name.trim() : "";
  const displayName =
    combined || fromProfile || fromMeta || email.split("@")[0]?.trim() || "П";
  const char = displayName.trim().charAt(0);

  return char ? char.toUpperCase() : "П";
}

function BackIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none">
      <path
        d="M15 5 8 12l7 7"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const disabledFieldClass =
  "mt-3 w-full rounded-[20px] border border-[#ddcfef] bg-[#f9f7fc] px-4 py-4 outline-none disabled:cursor-not-allowed disabled:opacity-60";

export default async function EditProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const errorMessage = params.error
    ? ERROR_MESSAGES[params.error]
    : undefined;

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/sign-in");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, avatar_path, avatar_url")
    .eq("id", user.id)
    .maybeSingle();

  const meta = (user.user_metadata ?? {}) as UserMetadata;
  const { firstName, lastName } = getEditNameFields(profile, meta);
  const email = user.email ?? "";
  const initial = getDisplayInitial(profile, meta, email);

  let avatarUrl: string | null = null;

  if (profile?.avatar_path) {
    try {
      const storage = createServiceRoleClient();
      avatarUrl = await createUserAvatarSignedUrl(storage, profile.avatar_path, {
        userId: user.id,
        cacheBuster: profile.avatar_url ?? profile.avatar_path,
      });
    } catch {
      avatarUrl = profile.avatar_url;
    }
  }

  return (
    <div className={profileEditPaddingClassName}>
      <header className="flex items-center justify-between">
            <Link
              href="/profile"
              aria-label="Назад"
              className="flex h-11 w-11 items-center justify-center rounded-full border border-[#e4d7f4] text-[#7042c5]"
            >
              <BackIcon />
            </Link>

            <div className="text-center">
              <h1 className="text-[24px] font-semibold">
                Редактировать профиль
              </h1>
              <p className="mt-1 text-xs text-[#7d70a2]">
                Личные данные слушателя
              </p>
            </div>

            <div className="h-11 w-11" />
          </header>

          {errorMessage && (
            <div className="mt-6 rounded-[18px] border border-[#efc7cf] bg-[#fff8f9] px-4 py-4 text-sm leading-6 text-[#b34f63]">
              {errorMessage}
            </div>
          )}

          <ProfileAvatarEditor initialAvatarUrl={avatarUrl} initial={initial} />

          <form action={updateProfile}>
            <section className="mt-8 space-y-5">
              <label className="block">
                <span className="text-sm font-medium">Имя</span>

                <input
                  type="text"
                  name="firstName"
                  defaultValue={firstName}
                  autoComplete="given-name"
                  className="mt-3 w-full rounded-[20px] border border-[#ddcfef] bg-white px-4 py-4 outline-none focus:border-[#7042c5]"
                />
              </label>

              <label className="block">
                <span className="text-sm font-medium">Фамилия</span>

                <input
                  type="text"
                  name="lastName"
                  defaultValue={lastName}
                  autoComplete="family-name"
                  className="mt-3 w-full rounded-[20px] border border-[#ddcfef] bg-white px-4 py-4 outline-none focus:border-[#7042c5]"
                />
              </label>

              <label className="block">
                <span className="text-sm font-medium">Электронная почта</span>

                <input
                  type="email"
                  name="email"
                  defaultValue={email}
                  readOnly
                  disabled
                  className={disabledFieldClass}
                />

                <p className="mt-2 text-xs leading-5 text-[#8a7ca9]">
                  Email нельзя изменить в профиле. Для смены пароля используйте{" "}
                  <Link
                    href="/auth/forgot-password"
                    className="font-medium text-[#7042c5]"
                  >
                    восстановление доступа
                  </Link>
                  .
                </p>
              </label>
            </section>

            <section className="mt-8 grid grid-cols-2 gap-3">
              <Link
                href="/profile"
                className="flex items-center justify-center rounded-[20px] border border-[#c6afe6] bg-white px-4 py-4 font-semibold text-[#7042c5]"
              >
                Отмена
              </Link>

              <button
                type="submit"
                className="flex items-center justify-center rounded-[20px] bg-gradient-to-r from-[#7042c5] to-[#9872d8] px-4 py-4 font-semibold text-white shadow-[0_12px_28px_rgba(96,59,168,0.22)]"
              >
                Сохранить
              </button>
            </section>
          </form>
    </div>
  );
}
