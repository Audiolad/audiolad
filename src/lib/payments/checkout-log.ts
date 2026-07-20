type CheckoutLogPayload = Record<string, string | boolean | number | null | undefined>;

export function logCheckoutEvent(
  event: string,
  payload: CheckoutLogPayload = {},
): void {
  const entry = {
    event,
    ts: new Date().toISOString(),
    ...payload,
  };

  console.info(JSON.stringify(entry));
}
