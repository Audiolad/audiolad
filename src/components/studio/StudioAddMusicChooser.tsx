"use client";

export function StudioAddMusicChooser({
  onPickDevice,
  onPickCatalog,
  onClose,
}: {
  onPickDevice: () => void;
  onPickCatalog: () => void;
  onClose: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-label="Источник музыки"
      className="studio-add-music-chooser flex flex-wrap gap-2"
    >
      <button
        type="button"
        onClick={onPickDevice}
        className="h-10 rounded-lg bg-[#7650bd] px-4 text-sm font-semibold text-white"
      >
        С устройства
      </button>
      <button
        type="button"
        onClick={onPickCatalog}
        className="h-10 rounded-lg border border-white/20 bg-[#1c2433] px-4 text-sm font-semibold text-[#e2e8f5]"
      >
        Каталог АудиоЛада
      </button>
      <button
        type="button"
        onClick={onClose}
        className="h-10 rounded-lg px-3 text-sm font-medium text-[#8b95a8]"
      >
        Отмена
      </button>
    </div>
  );
}
