import { describe, expect, it } from "vitest";

import {
  createPartnerAttributionToken,
  hashPartnerAttributionToken,
  isPartnerAttributionTokenShape,
} from "./token";

describe("author-partner attribution token", () => {
  it("creates opaque 64-char hex tokens without ids", () => {
    const token = createPartnerAttributionToken();
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    expect(token.includes("-")).toBe(false);
  });

  it("hashes stably to 64-char sha256 hex", () => {
    const token = "a" + "b".repeat(63);
    const hash = hashPartnerAttributionToken(token);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hashPartnerAttributionToken(token)).toBe(hash);
    expect(hash).not.toBe(token);
  });

  it("rejects malformed cookie values", () => {
    expect(isPartnerAttributionTokenShape(undefined)).toBe(false);
    expect(isPartnerAttributionTokenShape("")).toBe(false);
    expect(isPartnerAttributionTokenShape("xyz")).toBe(false);
    expect(isPartnerAttributionTokenShape("A".repeat(64))).toBe(false);
    expect(isPartnerAttributionTokenShape("a".repeat(64))).toBe(true);
  });
});
