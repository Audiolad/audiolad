import {
  getPersonalMaterialStatusClassName,
  getPersonalMaterialStatusLabel,
} from "@/lib/personal-materials/client/status-labels";
import type { AuthorPersonalMaterial } from "@/lib/personal-materials/client/types";

type AuthorDiagnosticsStatusBadgeProps = {
  material: Pick<AuthorPersonalMaterial, "status" | "claimed">;
};

export default function AuthorDiagnosticsStatusBadge({
  material,
}: AuthorDiagnosticsStatusBadgeProps) {
  return (
    <span
      className={`inline-flex shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium ${getPersonalMaterialStatusClassName(material)}`}
    >
      {getPersonalMaterialStatusLabel(material)}
    </span>
  );
}
