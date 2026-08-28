import { AuthorSupportExitForm } from "./AuthorSupportExitForm";

type AuthorSupportBannerProps = {
  actingDisplayName: string;
  actingAuthorName: string;
  variant?: "light" | "dark";
};

export function AuthorSupportBanner({
  actingDisplayName,
  actingAuthorName,
  variant = "light",
}: AuthorSupportBannerProps) {
  const dark = variant === "dark";

  return (
    <div
      data-author-support-banner="true"
      className={
        dark
          ? "mb-5 rounded-[20px] border border-[#9bdab5]/40 bg-[#1d1433] px-4 py-3 text-sm text-[#eadfff]"
          : "mb-5 rounded-[20px] border border-[#d7c6f2] bg-[#f7f1ff] px-4 py-3 text-sm text-[#3d2a6b]"
      }
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-semibold">Режим поддержки</p>
          <p className={dark ? "mt-1 text-[#cfc4e4]" : "mt-1 text-[#6a5a8a]"}>
            Режим поддержки: вы работаете от имени {actingDisplayName} ·{" "}
            {actingAuthorName}. Изменения записываются в журнал.
          </p>
        </div>
        <AuthorSupportExitForm variant={dark ? "dark" : "light"} />
      </div>
    </div>
  );
}
