import { afterEach, describe, expect, it } from "vitest";
import { checkRateLimit, resetRateLimits } from "../src/lib/rateLimit.js";
import { HttpError } from "../src/lib/errors.js";

describe("checkRateLimit", () => {
  afterEach(() => {
    resetRateLimits();
  });

  it("allows requests under the limit", () => {
    const result = checkRateLimit("client-1");
    expect(result.remaining).toBe(59);
  });

  it("tracks separate clients independently", () => {
    for (let i = 0; i < 30; i++) {
      checkRateLimit("client-a");
    }
    const result = checkRateLimit("client-b");
    expect(result.remaining).toBe(59);
  });

  it("throws 429 when limit is exceeded", () => {
    for (let i = 0; i < 60; i++) {
      checkRateLimit("client-x");
    }

    expect(() => checkRateLimit("client-x")).toThrow(HttpError);
    try {
      checkRateLimit("client-x");
    } catch (error) {
      expect((error as HttpError).status).toBe(429);
      expect((error as HttpError).code).toBe("rate_limit_exceeded");
    }
  });

  it("resets after the window expires", async () => {
    const realDateNow = Date.now;
    let fakeNow = realDateNow();
    Date.now = () => fakeNow;

    try {
      for (let i = 0; i < 60; i++) {
        checkRateLimit("client-t");
      }
      expect(() => checkRateLimit("client-t")).toThrow(HttpError);

      // Advance past the window
      fakeNow += 61_000;
      const result = checkRateLimit("client-t");
      expect(result.remaining).toBe(59);
    } finally {
      Date.now = realDateNow;
    }
  });
});
