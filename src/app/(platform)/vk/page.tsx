import VkMiniAppScreen from "@/components/vk/VkMiniAppScreen";
import { buildVkPageMetadata } from "@/lib/vk/seo";

export const metadata = buildVkPageMetadata();
export const dynamic = "force-dynamic";

export default function VkMiniAppPage() {
  return <VkMiniAppScreen />;
}
