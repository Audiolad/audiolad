import AuthorAvatarImage from "@/components/authors/AuthorAvatarImage";

type PersonalMaterialHeaderProps = {
  authorName: string;
  authorAvatarUrl: string | null;
};

export default function PersonalMaterialHeader({
  authorName,
  authorAvatarUrl,
}: PersonalMaterialHeaderProps) {
  return (
    <header className="flex items-center gap-3">
      <div className="h-[52px] w-[52px] shrink-0 overflow-hidden rounded-full">
        <AuthorAvatarImage
          name={authorName}
          avatarUrl={authorAvatarUrl}
          size={52}
          className="h-full w-full object-cover"
        />
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-[#6d628f]">Автор</p>
        <p className="truncate text-base font-semibold text-[#2f2647]">{authorName}</p>
      </div>
    </header>
  );
}
