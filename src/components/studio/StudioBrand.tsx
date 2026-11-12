import Image from "next/image";

import { AUDIOLAD_LIGHT_LOGO_PATH } from "@/lib/brand/classic-logos";

export function StudioBrand({
  compact = false,
}: {
  compact?: boolean;
} = {}) {
  return (
    <div className={compact ? "flex items-center gap-1.5" : "flex items-center gap-3"}>
      <Image
        src={AUDIOLAD_LIGHT_LOGO_PATH}
        alt="АудиоЛад"
        width={674}
        height={197}
        priority
        className={compact ? "h-7 w-auto" : "h-10 w-auto sm:h-12"}
      />
      <span
        className={
          compact
            ? "hidden border-l border-white/20 pl-1.5 text-xs font-semibold text-[#ddd2f5] min-[400px]:inline"
            : "border-l border-white/20 pl-3 text-sm font-semibold text-[#ddd2f5]"
        }
      >
        {compact ? "Studio" : "Студия"}
      </span>
    </div>
  );
}
