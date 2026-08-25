import Link from "next/link";

export default function SavedPlaylistsEmpty() {
  return (
    <section
      className="mt-8 rounded-[24px] border border-dashed border-[#d4c2eb] bg-[#faf6ff] px-5 py-10 text-center"
      data-playlist-saved-empty
    >
      <p className="text-[18px] font-semibold">Пока нет сохранённых плейлистов</p>
      <p className="mt-2 text-sm leading-6 text-[#7d70a2]">
        Сохраняйте публичные подборки из каталога, чтобы вернуться к ним здесь.
      </p>
      <Link
        href="/playlists/catalog"
        className="mt-6 inline-flex items-center rounded-[20px] bg-[#7042c5] px-5 py-3 font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
      >
        В каталог
      </Link>
    </section>
  );
}
