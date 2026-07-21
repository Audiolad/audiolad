import type { SafeGuestPersonalMaterialDto } from "@/lib/personal-materials/server/dto";
import type { PersonalMaterialGuestApiPaths } from "@/lib/personal-materials/guest/api-paths";

export type PersonalMaterialGuestPageProps = {
  material: SafeGuestPersonalMaterialDto;
  apiPaths: PersonalMaterialGuestApiPaths;
  isAuthenticated: boolean;
  claimCompletePath: string;
};
