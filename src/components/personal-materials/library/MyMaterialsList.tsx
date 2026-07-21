import Link from "next/link";

import MyMaterialCard from "@/components/personal-materials/library/MyMaterialCard";
import type { MyPersonalMaterialListItemDto } from "@/lib/personal-materials/client-library/types";

type MyMaterialsListProps = {
  materials: MyPersonalMaterialListItemDto[];
};

export default function MyMaterialsList({ materials }: MyMaterialsListProps) {
  if (materials.length === 0) {
    return (
      <div className="rounded-3xl border border-dashed border-[#ddd2ef] bg-white px-6 py-12 text-center">
        <h2 className="text-lg font-semibold text-[#2f2647]">
          У вас пока нет личных материалов
        </h2>
        <p className="mt-3 text-sm leading-6 text-[#6d628f]">
          Когда автор подготовит для вас аудиоразбор, медитацию или другой
          персональный материал, вы сможете сохранить его здесь.
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex min-h-11 items-center justify-center rounded-full border border-[#c6afe6] px-5 py-3 text-sm font-semibold text-[#7042c5]"
        >
          Вернуться на главную
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {materials.map((material) => (
        <MyMaterialCard key={material.id} material={material} />
      ))}
    </div>
  );
}
