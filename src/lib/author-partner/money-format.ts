import { formatRubFromMinor } from "@/lib/admin/analytics-money-format";

const SUPPORTED_CURRENCIES = new Set(["RUB"]);

export function formatPartnerRewardMoney(
  amountMinor: number | null | undefined,
  currency: string | null | undefined,
): string {
  if (
    !Number.isSafeInteger(amountMinor) ||
    typeof currency !== "string" ||
    !/^[A-Z]{3}$/.test(currency) ||
    !SUPPORTED_CURRENCIES.has(currency)
  ) {
    return "—";
  }

  if (currency === "RUB") return formatRubFromMinor(amountMinor);
  return "—";
}
