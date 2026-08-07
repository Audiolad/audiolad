import Image from "next/image";

export function StudioBrand() {
  return (
    <div className="flex items-center gap-3">
      <Image
        src="/brand/audiolad-logo-light.webp"
        alt="АудиоЛад"
        width={768}
        height={197}
        priority
        className="h-10 w-auto sm:h-12"
      />
      <span className="border-l border-white/20 pl-3 text-sm font-semibold text-[#ddd2f5]">
        Студия
      </span>
    </div>
  );
}
