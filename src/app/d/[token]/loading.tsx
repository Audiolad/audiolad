import { buildPersonalMaterialGuestMetadata } from "@/lib/personal-materials/guest/privacy";

export const dynamic = "force-dynamic";

export const metadata = buildPersonalMaterialGuestMetadata();

export default function PersonalMaterialGuestLoading() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-[#f7f4fb] px-4">
      <p className="text-sm text-[#6d628f]">Загружаем персональный материал…</p>
    </div>
  );
}
