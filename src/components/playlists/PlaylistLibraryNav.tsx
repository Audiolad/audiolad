import Link from "next/link";

const LIBRARY_NAV_ITEMS = [
  { href: "/playlists", label: "Плейлисты", active: "mine" },
  { href: "/playlists/saved", label: "Сохранённые", active: "saved" },
] as const;

type PlaylistLibraryNavProps = {
  active: "mine" | "saved";
};

export default function PlaylistLibraryNav({ active }: PlaylistLibraryNavProps) {
  return (
    <nav className="mt-3" aria-label="Разделы плейлистов" data-playlist-library-nav>
      <div className="flex gap-2">
        {LIBRARY_NAV_ITEMS.map((item) => {
          const isActive = item.active === active;

          return (
            <Link
              key={item.href}
              href={item.href}
              prefetch={false}
              aria-current={isActive ? "page" : undefined}
              className={`inline-flex min-h-9 items-center rounded-full border px-3 py-1.5 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5] ${
                isActive
                  ? "border-[#7042c5] bg-[#7042c5] text-white"
                  : "border-[#ddcfef] bg-white text-[#7042c5]"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
