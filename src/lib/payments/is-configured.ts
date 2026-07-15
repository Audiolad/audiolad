import { getTochkaConfig } from "@/lib/payments/tochka-config";

export function isPaymentsConfigured(): boolean {
  try {
    getTochkaConfig();
    return true;
  } catch {
    return false;
  }
}
