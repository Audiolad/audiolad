import { randomUUID } from "node:crypto";

process.env.CHECKOUT_STATUS_SECRET = "unit-test-checkout-secret";

import {
  buildCheckoutResultQuery,
  createSignedCheckoutToken,
  isStoredCheckoutTokenValidForOrder,
  verifySignedCheckoutToken,
} from "@/lib/payments/checkout-token";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

const orderId = randomUUID();
const signed = createSignedCheckoutToken(orderId, 3600, 1_700_000_000);
const freshSigned = createSignedCheckoutToken(orderId, 3600);

assert(typeof signed.token === "string", "token is generated");
assert(signed.token.includes("."), "token uses payload.signature format");

const valid = verifySignedCheckoutToken(signed.token, orderId, 1_700_000_100);
assert(valid.ok, "valid token verifies for matching order");

const expired = verifySignedCheckoutToken(signed.token, orderId, 1_700_010_000);
assert(!expired.ok && expired.error === "token_expired", "expired token rejected");

const tampered = verifySignedCheckoutToken(
  `${signed.token}x`,
  orderId,
  1_700_000_100,
);
assert(!tampered.ok, "tampered token rejected");

const otherOrder = verifySignedCheckoutToken(
  signed.token,
  randomUUID(),
  1_700_000_100,
);
assert(
  !otherOrder.ok && otherOrder.error === "order_id_mismatch",
  "order mismatch rejected",
);

const query = buildCheckoutResultQuery(orderId, signed.token);
assert(query.includes("order_id="), "checkout query includes order_id");
assert(query.includes("token="), "checkout query includes token");
assert(!query.includes("success="), "checkout query does not trust success flag");

assert(
  isStoredCheckoutTokenValidForOrder(
    { checkout_token: freshSigned.token },
    orderId,
  ),
  "stored metadata token validates for order",
);
assert(
  !isStoredCheckoutTokenValidForOrder(
    { checkout_token: freshSigned.token },
    randomUUID(),
  ),
  "stored metadata token rejects other order",
);

console.log("checkout-return-token-unit: ok");
